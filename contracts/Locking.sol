// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/utils/math/Math.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "hardhat/console.sol";

contract Locking is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;

    IERC20 public token; // FoT is NOT supported
    mapping(address => Lock) public locks;
    uint256 public totalLocked = 0;

    uint256 public constant PRECISION = 10000;
    uint256 public exponent; // based on PERCISION
    uint256 public immutable penalty; // based on PERCISION
    address public immutable feeReceiver1; // 50% of penalties
    address public immutable feeReceiver2; // 50% of penalties

    mapping(uint256 => uint256) public monthToBoost;
    mapping(uint256 => uint256) public lockedPerMonth;

    uint256 _currentMonthIndexStored = 0;

    mapping(uint256 => uint256) public totalBoostHistory;

    struct Lock {
        uint256 amount;
        uint256 startMonth;
        uint256 endMonth;
    }

    uint256 deployTime;

    // TODO refactor all requires to revert with custom errors and check gas implications

    // ERC20 address => month index => amount
    mapping(address => mapping(uint256 => uint256)) public rewards;
    mapping(address => uint256) public rewardBalances;
    mapping(address => mapping(address => uint256)) public claimedRewards;

    event Locked(address indexed target, uint256 amount, uint256 startMonth, uint256 endMonth);
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
    function lock(uint256 amount, uint256 monthsToLock) external nonReentrant {
        require(amount > 0 || monthsToLock > 0, "Locking:lock:params");

        checkpoint();

        token.safeTransferFrom(msg.sender, address(this), amount); // TODO: CEI - should this be at the end?

        uint256 _currentMonthIndex = currentMonthIndex();

        locks[msg.sender].startMonth = _currentMonthIndex;
        locks[msg.sender].endMonth = locks[msg.sender].startMonth + monthsToLock;
        locks[msg.sender].amount += amount;
        totalLocked += amount;

        for (uint256 i = 0; i < monthsToLock; i++) {
            lockedPerMonth[(_currentMonthIndex + i)] += amount;
        }

        emit Locked(msg.sender, locks[msg.sender].amount, locks[msg.sender].startMonth, locks[msg.sender].endMonth);
    }

    function withdraw() external nonReentrant {
        require(locks[msg.sender].endMonth <= currentMonthIndex(), "Locking:withdraw:endMonth");
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

    function totalBoosted() public view returns (uint256) {
        // TODO do we return stored or calculated??

        uint256[24] memory lockedForDuration = _calculateLockedForDuration(currentMonthIndex());

        uint256 _totalBoosted;
        for (uint256 i = 0; i < 24; i++) {
            _totalBoosted += lockedForDuration[i] * monthToBoost[i];
        }

        return _totalBoosted / PRECISION;
    }

    function totalBoostedAt(uint256 month) private view returns (uint256) {
        if (month < _currentMonthIndexStored) {
            return totalBoostHistory[month];
        }

        uint256[24] memory lockedForDuration = _calculateLockedForDuration(month);

        uint256 _totalBoosted;
        for (uint256 i = 0; i < 24; i++) {
            _totalBoosted += lockedForDuration[i] * monthToBoost[i];
        }

        return _totalBoosted / PRECISION;
    }

    function claim(address user, address rewardToken) external {
        checkpoint();
        uint256 _pendingRewards = pendingRewards(user, rewardToken);
        claimedRewards[user][rewardToken] += _pendingRewards;
        rewardBalances[rewardToken] -= _pendingRewards;
        IERC20(rewardToken).safeTransfer(user, _pendingRewards);
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
    function _calculateLockedForDuration(uint256 month) private view returns (uint256[24] memory lockedForDuration) {
        // get the current period index
        uint256 currentPeriodIndex = month;
        // variable to store the diff between the last different amount period and this one
        uint256 lastSeenAmount = 0;
        // iterate backwards over the previous 24 months, and return the amount locked for each month
        for (int256 i = 23; i >= 0; i--) {
            uint256 _i = uint256(i);
            lockedForDuration[_i] = lockedPerMonth[currentPeriodIndex + _i] - lastSeenAmount;
            lastSeenAmount = lockedPerMonth[currentPeriodIndex + _i];
        }
    }

    function checkpoint() public {
        uint256 _currentMonthIndex = currentMonthIndex();

        if (_currentMonthIndexStored == _currentMonthIndex) {
            return;
        }

        for (uint256 i = _currentMonthIndexStored; i < _currentMonthIndex; i++) {
            totalBoostHistory[i] = totalBoostedAt(i);
        }
        _currentMonthIndexStored = currentMonthIndex();
    }

    function pendingRewards(address target, address _token) public view returns (uint256) {
        Lock memory targetLock = locks[target];

        uint256 monthFrom = targetLock.startMonth;
        uint256 monthTo = Math.min(targetLock.endMonth, currentMonthIndex());

        uint256 _pendingRewards = 0;

        for (uint256 i = monthFrom; i < monthTo; i++) {
            uint256 monthsLeft = targetLock.endMonth - i;
            uint256 targetBoost = (targetLock.amount * monthToBoost[monthsLeft - 1]) / PRECISION;
            _pendingRewards += (rewards[_token][i] * targetBoost) / totalBoostedAt(i);
        }

        return _pendingRewards - claimedRewards[target][_token];
    }

    /**************************************
     * Admin functions
     **************************************/

    function addReward(address _token, uint256 offset, uint256 months, uint256 amountPerMonth) external onlyOwner {
        // TODO not necessarily owner holds the reward token
        IERC20(_token).safeTransferFrom(msg.sender, address(this), amountPerMonth * months);

        uint256 rewardsStartMonth = currentMonthIndex() + offset;

        for (uint256 i = rewardsStartMonth; i < rewardsStartMonth + months; i++) {
            rewards[_token][i] += amountPerMonth;
        }

        rewardBalances[_token] += amountPerMonth * months;
    }

    function setExponent(uint256 _exponent) external onlyOwner {
        exponent = _exponent;
    }

    function renounceOwnership() public view override onlyOwner {
        revert();
    }

    function recover(address tokenAddress, uint256 startMonth, uint256 endMonth) external onlyOwner {
        // if(startMonth >= endMonth) revert InvalidArguments(startMonth);
        require(endMonth < currentMonthIndex(), "Locking:recover:endMonth");
        // Return any balance of the token that doesn't belong to the rewards program
        uint256 tokenBalanceToRecover = IERC20(tokenAddress).balanceOf(address(this)) - rewardBalances[tokenAddress];

        // in case of XCTD, we also need to retain the total locked amount in the contract
        if (tokenAddress == address(token)) {
            tokenBalanceToRecover -= totalLocked;
        } 

        // TODO: bug - claim from the future!
        // Recover reward for any past months that had 0 locked amount
        for (uint256 i = startMonth; i < endMonth; i++) {
            if (totalBoostedAt(i) == 0) {
                tokenBalanceToRecover += rewards[tokenAddress][i];
                rewardBalances[tokenAddress] -= rewards[tokenAddress][i];
                rewards[tokenAddress][i] = 0;
            }
        }

        // Shouldn't happen
        // tokenBalanceToRecover = Math.min(tokenBalanceToRecover, IERC20(tokenAddress).balanceOf(address(this)));

        IERC20(tokenAddress).safeTransfer(owner(), tokenBalanceToRecover);
        // in case of ETH, transfer the balance as well
        Address.sendValue(payable(owner()), address(this).balance);
    }

    function updateBoostFactors(uint256[] memory _monthToBoost) external onlyOwner {
        require(_monthToBoost.length == 24, "Locking:updateBoostFactors:invalidLength");
        for (uint256 i = 0; i < _monthToBoost.length; i++) {
            monthToBoost[i] = _monthToBoost[i];
        }
    }
}
