// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./ABDKMath64x64.sol";
import "hardhat/console.sol";


contract Locking is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using ABDKMath64x64 for int128;

    IERC20 public token; // FoT is NOT supported
    mapping(address => Lock) public locks;
    uint256 public totalLocked = 0;
    uint256 public _currentMonthIndex = 0;

    uint256 public constant PRECISION = 10000;
    uint256 public exponent; // based on PERCISION
    uint256 public immutable penalty; // based on PERCISION
    address public immutable feeReceiver1; // 50% of penalties
    address public immutable feeReceiver2; // 50% of penalties

    mapping(uint256 => uint256) public monthToBoost;
    uint256[24] public lockedPerMonth;

    struct Lock {
        uint256 amount;
        uint256 deadline;
    }

    uint256 deployTime;

    event Locked(address indexed target, uint256 amount, uint256 deadline);
    event Withdraw(address indexed target, uint256 amount);
    event WithdrawWithPenalty(address indexed target, uint256 amount, uint256 penalty);

    constructor(address _token, uint256 _exp, uint256 _penalty, address _feeReceiver1, address _feeReceiver2) {
        token = IERC20(_token);
        exponent = _exp;
        penalty = _penalty;
        feeReceiver1 = _feeReceiver1;
        feeReceiver2 = _feeReceiver2; 
        deployTime = block.timestamp;  

        // 1.00 for funds locked for up to 1 month
        monthToBoost[0] = 10000;    

        // 3.74 for funds locked for 1+ months
        monthToBoost[1] = 37400;    
        monthToBoost[2] = 37400;    

        // 8.59 for funds locked for 3+ months
        monthToBoost[3] = 85900;    
        monthToBoost[4] = 85900;   
        monthToBoost[5] = 85900;    

        // 19.73 for funds locked for 6+ months
        monthToBoost[6] = 197300;  
        monthToBoost[7] = 197300;   
        monthToBoost[8] = 197300;  
        monthToBoost[9] = 197300;  
        monthToBoost[10] = 197300;  
        monthToBoost[11] = 197300; 
        
        // 45.32 for funds locked for 12+ months
        monthToBoost[12] = 453200; 
        monthToBoost[13] = 453200; 
        monthToBoost[14] = 453200; 
        monthToBoost[15] = 453200; 
        monthToBoost[16] = 453200; 
        monthToBoost[17] = 453200; 
        monthToBoost[18] = 453200; 
        monthToBoost[19] = 453200; 
        monthToBoost[20] = 453200; 
        monthToBoost[21] = 453200; 
        monthToBoost[22] = 453200; 
        monthToBoost[23] = 453200;  
    }

    function currentMonthIndex() internal view returns (uint256) {
        return uint256((block.timestamp - deployTime) / 30 days) % 24;
    }

    function zeroOutStaleMonths() internal {
        uint256 _calculatedCurMonthIndex = currentMonthIndex();

        if (_calculatedCurMonthIndex != _currentMonthIndex) {
            uint256 i = _currentMonthIndex;
            while (i != _calculatedCurMonthIndex) {
                lockedPerMonth[i] = 0;
                i = (i + 1) % 24;
            }
        
            _currentMonthIndex = _calculatedCurMonthIndex;
        }
    }

    /**
     * Create or increase lock, sending {amount} of {token} to this contract, and locking it for {durationSeconds} from now.
     * Assumes {amount} allowance given to this contract.
     * Emits Locked.
     */
    function lock(uint256 amount, uint256 durationSeconds) external nonReentrant {
        require(amount > 0 || durationSeconds > 0, "Locking:lock:params");
        token.safeTransferFrom(msg.sender, address(this), amount);

        if (locks[msg.sender].deadline == 0) locks[msg.sender].deadline = block.timestamp;
        locks[msg.sender].amount += amount;
        locks[msg.sender].deadline += durationSeconds;
        totalLocked += amount;
        
        uint256 durationMonths = durationSeconds / 30 days;
     
        zeroOutStaleMonths();

        for (uint256 i = 0; i < durationMonths; i++) {
            // minus 1 to account for 0 index in lockedPerMonth
            lockedPerMonth[(_currentMonthIndex + i) % 24] += amount;
        }

        emit Locked(msg.sender, locks[msg.sender].amount, locks[msg.sender].deadline);
    }

    function withdraw() external nonReentrant {
        require(locks[msg.sender].deadline < block.timestamp, "Locking:withdraw:deadline");
        uint256 amount = locks[msg.sender].amount;
        delete locks[msg.sender];
        totalLocked -= amount;
        token.safeTransfer(msg.sender, amount);
        emit Withdraw(msg.sender, amount);
    }

    function earlyWithdrawWithPenalty(uint256 amount) external nonReentrant {
        if (amount >= locks[msg.sender].amount) {
            amount = locks[msg.sender].amount;
            delete locks[msg.sender];
        } else {
            locks[msg.sender].amount -= amount;
        }
        totalLocked -= amount;

        uint256 penaltyAmount = (amount * penalty) / PRECISION;
        uint256 amountAfterPenalty = amount - penaltyAmount; // this also protects (by underflowing) against penalty > 100%, which can open exploit
        token.safeTransfer(msg.sender, amountAfterPenalty);

        token.safeTransfer(feeReceiver1, penaltyAmount / 2);
        token.safeTransfer(feeReceiver2, penaltyAmount - (penaltyAmount / 2));
        emit WithdrawWithPenalty(msg.sender, amount, penaltyAmount);
    }

    /**************************************
     * View functions
     **************************************/

    /**
     * _exponent 12000 is 1.2% exponent on locked months
     * returns ratio based on {PRECISION}
     */
    function calcPowerRatio(uint256 _exponent, uint256 remainingSeconds) public pure returns (uint256 power) {
        if (remainingSeconds == 0) return 0;
        int128 factor = ABDKMath64x64.divu(_exponent, PRECISION);
        int128 months = ABDKMath64x64.divu(remainingSeconds, 30 days);
        power = months.log_2().mul(factor).exp_2().mulu(PRECISION);
    }

    function lockedBalanceOf(address target) external view returns (uint256 amount, uint256 deadline) {
        amount = locks[target].amount;
        deadline = locks[target].deadline;
    }

    function boostedBalanceOf(address target) public view returns (uint256 amount) {
        amount = (locks[target].amount * calcPowerRatio(exponent, locks[target].deadline - block.timestamp)) / PRECISION;
    }

    function totalBoosted() external view returns (uint256) {
        // TODO do we return stored or calculated??
        uint256 currentMonth = currentMonthIndex();
        // 100 for 24m
        // 100 for 3m 
        // total 4500+374=4874
        // [4874, 4874, 4600, ..., 100, 0...]
        // [200, 200, 200, 100, 100, ...]

        // [{totalBoosted: 4874, locked: 200}, {totalBoosted: 4874, locked: 200},..., {totalBoosted: 4500, locked: 100}, ...]
        console.log('lockedPerMonth[currentMonth]', lockedPerMonth[currentMonth]);
        console.log('monthToBoost[currentMonth]', monthToBoost[currentMonth]);
        return (lockedPerMonth[currentMonth] * monthToBoost[currentMonth]) / PRECISION;
    }


    /*
    output of this function is a 24-element array, named lockedForDuration, ex:
    lockedForDuration[23] = 1000
    lockedForDuration[22] = 0
    ...
    lockedForDuration[6] = 0
    lockedForDuration[5] = 300
    ...
    lockedForDuration[0] = 0

    this allows us to calculate the total boost, as if we were re-locking these amounts, each element to its respective duration
    */
    function _calculateLockedForDuration() public returns (uint256[24] memory lockedForDuration) {
        zeroOutStaleMonths();
        // get the current period index
        uint256 currentPeriodIndex = currentMonthIndex();
        // get the index to the period in 24 months (maximum lock duration)
        uint256 i = (currentPeriodIndex + 23) % 24;
        // we need to store the most recent amount locked at the end of the array
        uint256 shittyCounter = 23;
        // variable to store the diff between the last different amount period and this one
        uint256 lastSeenAmount = 0;
        // iterate backwards over the previous 24 months, and return the amount locked for each month
        while (currentPeriodIndex != i) {
            lockedForDuration[shittyCounter] = lockedPerMonth[i] - lastSeenAmount;
            lastSeenAmount = lockedPerMonth[i];
            i = (i + 24 - 1) % 24; // TODO fix somehow such that the -1 comes before 24?
            shittyCounter -= 1;
        }
    }

    // user 1 - 3 months
    // 1 month pass
    // user 2 - 12 months
    // 3 months pass

    // month 16 - last touched, staked there for 24 months [16...15]
    // month 24

    struct RewardProgram {
        uint256 rewardsPerSecond;
        uint256 lastRewardTimestamp; // Last time reward has been claimed
    }

    mapping(address => RewardProgram) public rewards;

    function pendingRewards(address target, address token) external view returns (uint256) {
        RewardProgram memory rewardProgram = rewards[token];
        uint256 _boostedBalanceOf = boostedBalanceOf(target);
        uint256 _seconds = block.timestamp - rewardProgram.lastRewardTimestamp;
        uint256 rewards = _seconds * rewardProgram.rewardsPerSecond;
        return rewards;
    }

    /**************************************
     * Admin functions
     **************************************/

    function addReward(uint256 amount, address token, uint256 rewardsPerSecond) external onlyOwner {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        rewards[token].rewardsPerSecond = rewardsPerSecond;
        rewards[token].lastRewardTimestamp = block.timestamp;
    }

    function setExponent(uint256 _exponent) external onlyOwner {
        exponent = _exponent;
    }

    function renounceOwnership() public view override onlyOwner {
        revert();
    }

    function recover(address tokenAddress, uint256 tokenAmount) external onlyOwner {
        require(tokenAddress != address(token) || tokenAmount <= token.balanceOf(address(this)) - totalLocked, "Locking:recoverERC20:locked");
        IERC20(tokenAddress).safeTransfer(owner(), tokenAmount);
        Address.sendValue(payable(owner()), address(this).balance);
    }

    function updateBoostFactors(uint256[] memory _monthToBoost) external onlyOwner {
        require(_monthToBoost.length == 24, "Locking:updateBoostFactors:invalidLength");
        for (uint256 i = 0; i < _monthToBoost.length; i++) {
            monthToBoost[i] = _monthToBoost[i];
        }
    }
}
