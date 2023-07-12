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

    uint256 public constant PRECISION = 10000;
    uint256 public exponent; // based on PERCISION
    uint256 public immutable penalty; // based on PERCISION
    address public immutable feeReceiver1; // 50% of penalties
    address public immutable feeReceiver2; // 50% of penalties

    mapping(uint256 => uint256) public monthToBoost;
    // TODO: address compiler warning
    uint256[100000000000000000000000000000] public lockedPerMonth;

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
        return uint256((block.timestamp - deployTime) / 30 days);
    }

    /**
     * Create or increase lock, sending {amount} of {token} to this contract, and locking it for {durationSeconds} from now.
     * Assumes {amount} allowance given to this contract.
     * Emits Locked.
     */
    function lock(uint256 amount, uint256 durationSeconds) external nonReentrant {
        require(amount > 0 || durationSeconds > 0, "Locking:lock:params");
        token.safeTransferFrom(msg.sender, address(this), amount); // TODO: CEI - should this be at the end?

        if (locks[msg.sender].deadline == 0) locks[msg.sender].deadline = block.timestamp;
        locks[msg.sender].amount += amount;
        locks[msg.sender].deadline += durationSeconds;
        totalLocked += amount;

        uint256 _currentMonthIndex = currentMonthIndex();
        
        uint256 durationMonths = durationSeconds / 30 days;

        for (uint256 i = 0; i < durationMonths; i++) {
            lockedPerMonth[(_currentMonthIndex + i)] += amount;
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

    function totalBoosted() public view returns (uint256) {
        // TODO do we return stored or calculated??

        uint256[24] memory lockedForDuration = _calculateLockedForDuration();

        uint256 _totalBoosted;
        for (uint256 i = 0; i < 24; i++) {
            _totalBoosted += lockedForDuration[i] * monthToBoost[i];
        }

        return _totalBoosted / PRECISION;
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
    function _calculateLockedForDuration() private view returns (uint256[24] memory lockedForDuration) {
        // get the current period index
        uint256 currentPeriodIndex = currentMonthIndex();
        // variable to store the diff between the last different amount period and this one
        uint256 lastSeenAmount = 0;
        // iterate backwards over the previous 24 months, and return the amount locked for each month
        for (int256 i = 23; i >= 0; i--) {
            uint256 _i = uint256(i);
            lockedForDuration[_i] = lockedPerMonth[currentPeriodIndex + _i] - lastSeenAmount;
            lastSeenAmount = lockedPerMonth[currentPeriodIndex + _i];
        }
    }


    struct RewardProgram {
        // uint256 rewardsPerSecond;
        // uint256 lastRewardTimestamp; // Last time reward has been claimed
        uint256 startMonth;
        uint256 endMonth;
        uint256 totalRewards;
    }

    mapping(address => RewardProgram) public rewards;

    function pendingRewards(address target, address _token) external view returns (uint256) {
        RewardProgram memory rewardProgram = rewards[_token];

        Lock memory targetLock = locks[target];
        uint256 monthsLeft = (targetLock.deadline - block.timestamp) / 30 days;
        uint256 targetShare = (targetLock.amount * monthToBoost[monthsLeft - 1]) / PRECISION;
        uint256 totalRewardsDue = rewardProgram.totalRewards * (currentMonthIndex() - rewardProgram.startMonth) / (rewardProgram.endMonth + 1 - rewardProgram.startMonth);
        

        /*

        

        ---

        Rewards program is 50k [3....8]
        Positions goes from [1...5]

        user checks at 7:
            - user's boosted position @ 7
            - total boost at @ 7
            - ratio => user's share of the pie
            - userClaimSoFar

        */

        console.log("targetShare", targetShare / 1e18);
        console.log("monthsLeft", monthsLeft);
        console.log("totalBoosted", totalBoosted() / 1e18);

        return (totalRewardsDue * targetShare) / totalBoosted();
    }

    /**************************************
     * Admin functions
     **************************************/

    function addReward(address _token, RewardProgram calldata reward) external onlyOwner {
        IERC20(_token).safeTransferFrom(msg.sender, address(this), reward.totalRewards);
        rewards[_token] = reward;
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
