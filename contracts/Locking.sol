// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./ABDKMath64x64.sol";

contract Locking {
    using SafeERC20 for IERC20;
    using ABDKMath64x64 for int128;

    IERC20 public token;

    struct Lock {
        uint256 amount;
        uint256 deadline;
    }
    mapping(address => Lock) public locks;

    uint256 public constant PRECISION = 10000;
    uint256 public immutable exponent;
    uint256 public immutable penalty;

    address public immutable feeReceiver1;
    address public immutable feeReceiver2;

    constructor(address _token, uint256 _exp, uint256 _penalty, address _feeReceiver1, address _feeReceiver2) {
        token = IERC20(_token);
        exponent = _exp;
        penalty = _penalty;
        feeReceiver1 = _feeReceiver1;
        feeReceiver2 = _feeReceiver2;
    }

    function createLock(uint256 amount, uint256 durationSeconds) external {
        token.safeTransferFrom(msg.sender, address(this), amount);
        locks[msg.sender] = Lock(amount, block.timestamp + durationSeconds);
    }

    function lockedBalanceOf(address target) external view returns (uint256 amount, uint256 deadline) {
        amount = locks[target].amount;
        deadline = locks[target].deadline;
    }

    function boostedBalanceOf(address target) external view returns (uint256 amount) {
        amount = (locks[target].amount * calcPowerRatio(exponent, locks[target].deadline - block.timestamp)) / PRECISION;
    }

    function withdraw() external {
        // require(locks[msg.sender].amount > 0, "No lock");
        // require(locks[msg.sender].deadline < block.timestamp, "Not yet");
        // uint256 amount = locks[msg.sender].amount;
        // delete locks[msg.sender];
        // IERC20(token).safeTransfer(msg.sender, amount);
    }

    function earlyWithdrawWithPenalty(uint256 amount) external {
        locks[msg.sender].amount -= amount;
        uint256 penaltyAmount = (amount * penalty) / PRECISION;
        uint256 amountAfterPenalty = amount - penaltyAmount;
        token.safeTransfer(msg.sender, amountAfterPenalty);

        token.safeTransfer(feeReceiver1, penaltyAmount / 2);
        token.safeTransfer(feeReceiver2, penaltyAmount - (penaltyAmount / 2));
    }

    function calcPowerRatio(uint256 _exponent, uint256 remainingSeconds) public pure returns (uint256 power) {
        int128 factor = ABDKMath64x64.divu(_exponent, PRECISION);
        int128 months = ABDKMath64x64.divu(remainingSeconds, 30 days);
        power = months.log_2().mul(factor).exp_2().mulu(PRECISION);
    }
}
