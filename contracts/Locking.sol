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
    uint256[24] public totalBoost;

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

        // delta = current timestamp - deploy timestamp
        // delta / 30 days
        // Math.floor((((Date.now())) / (86400*30)) % 24)

        // (block.timestamp / 30 days) % 24

        /*
            contract deployment is 21-06-2023
            "CUR" is calculated to be 0
            Luke deposits on 23-06-2023 for 3 months => [30, 20, 10, ....]
            Shahar deposits on 20-07-2023 for 3 months => [60, 40 , 20, ....]
            the 22-07-2023 arrives, CUR is calculated as 1 => [40 , 20, ....]
        */
        
        /*
            contract deployment is 21-06-2023
            "CUR" is calculated to be 0
            Luke deposits on 23-06-2023 for 3 months =>       [30, 20, 10, ....]
            Shahar deposits on 20-07-2023 for 1 months =>     [60, 20 , 10, ....]
            the 22-07-2023 arrives, CUR is calculated as 1 => [20 , 10, ....]
        */
        
        uint256 durationMonths = durationSeconds / 30 days;
        uint256 _calculatedCurMonthIndex = currentMonthIndex();
        // computed 3, current is 23
        // need to update 23, 24, 0, 1, 2
        // First loop: i=23

        // for (uint256 i = lastKnown; i != currentComputed; i = (i + 1) % 24) {
        
        // 3-23 = -18
        // 
        // we want to zero out 
        if (_calculatedCurMonthIndex != _currentMonthIndex) {
            uint256 i = _currentMonthIndex;
            while (i != _calculatedCurMonthIndex) {
                totalBoost[i] = 0;
                i = (i + 1) % 24;
            }
        
            _currentMonthIndex = _calculatedCurMonthIndex;
        }

        for (uint256 i = 0; i < durationMonths; i++) {
            // minus 1 to account for 0 index in totalBoost
            totalBoost[(_currentMonthIndex + i) % 24] += amount * monthToBoost[durationMonths - i - 1];
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
        return totalBoost[currentMonthIndex()] / PRECISION;
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
