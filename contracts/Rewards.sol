// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;
import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "./Locking.sol";

// TODO reentrancy guard?
contract Rewards is Ownable {
    using SafeERC20 for IERC20;

    Locking locking;

    // ERC20 address => month index => amount
    mapping(address => mapping(uint256 => uint256)) public rewards;
    mapping(address => uint256) public rewardBalances;
    mapping(address => mapping(address => uint256)) public claimedRewards;

    constructor(address _locking) {
        locking = Locking(_locking);
    }

    function addReward(address _token, uint256 offset, uint256 months, uint256 amountPerMonth) external onlyOwner {
        IERC20(_token).safeTransferFrom(msg.sender, address(this), amountPerMonth * months);

        uint256 rewardsStartMonth = locking.currentMonthIndex() + offset;

        for (uint256 i = rewardsStartMonth; i < rewardsStartMonth + months; i++) {
            rewards[_token][i] += amountPerMonth;
        }

        rewardBalances[_token] += amountPerMonth * months;
    }

    function pendingRewards(address target, address _token) public view returns (uint256) {
        Locking.Lock memory targetLock = locking.locks(target);

        uint256 monthFrom = targetLock.startMonth;
        uint256 monthTo = Math.min(targetLock.endMonth, locking.currentMonthIndex());

        uint256 _pendingRewards = 0;

        for (uint256 i = monthFrom; i < monthTo; i++) {
            uint256 monthsLeft = targetLock.endMonth - i;
            uint256 targetBoost = (targetLock.amount * locking.monthToBoost(monthsLeft - 1)) / locking.PRECISION();
            _pendingRewards += (rewards[_token][i] * targetBoost) / locking.totalBoostedAt(i);
        }

        return _pendingRewards - claimedRewards[target][_token];
    }

    function claim(address user, address rewardToken) external {
        // checkpoint(); // TODO - how do we trigger this if rewards is separated? on the other hand, if locks/withdrawals already checkpoint,
        // is it necessary to checkpoint here? at the very least we don't have any test failing as a result of commenting this out.
        uint256 _pendingRewards = pendingRewards(user, rewardToken);
        claimedRewards[user][rewardToken] += _pendingRewards;
        rewardBalances[rewardToken] -= _pendingRewards;
        IERC20(rewardToken).safeTransfer(user, _pendingRewards);
    }

    function recover(address tokenAddress, uint256 startMonth, uint256 endMonth) external onlyOwner {
        require(endMonth < locking.currentMonthIndex(), "Locking:recover:endMonth");
        // Return any balance of the token that doesn't belong to the rewards program
        // TODO: restore this functionality
        uint256 tokenBalanceToRecover = IERC20(tokenAddress).balanceOf(address(this)) - rewardBalances[tokenAddress];

        // Recover reward for any past months that had 0 locked amount
        for (uint256 i = startMonth; i < endMonth; i++) {
            if (locking.totalBoostedAt(i) == 0) {
                tokenBalanceToRecover += rewards[tokenAddress][i];
                rewardBalances[tokenAddress] -= rewards[tokenAddress][i];
                rewards[tokenAddress][i] = 0;
            }
        }

        // Shouldn't happen
        tokenBalanceToRecover = Math.min(tokenBalanceToRecover, IERC20(tokenAddress).balanceOf(address(this)));

        IERC20(tokenAddress).safeTransfer(owner(), tokenBalanceToRecover);
        // in case of ETH, transfer the balance as well
        Address.sendValue(payable(owner()), address(this).balance);
    }
}
