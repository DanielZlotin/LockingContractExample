// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "./ABDKMath64x64.sol";

contract Locking {
    using SafeERC20 for IERC20;
    using ABDKMath64x64 for int128;

    address public token;
    mapping(address => Lock) public locks;

    uint256 public constant PRECISION = 10_000;
    uint256 public immutable exponent;

    constructor(address _token, uint256 _exp) {
        token = _token;
        exponent = _exp;
    }

    function createLock(uint256 amount, uint256 durationSeconds) external {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
        locks[msg.sender] = Lock(amount, block.timestamp + durationSeconds);
    }

    function getLockedBalance(address target) external view returns (uint256 amount, uint256 deadline) {
        amount = locks[target].amount;
        deadline = locks[target].deadline;
    }

    function boostedBalanceOf(address target) external view returns (uint256 amount) {
        amount = (locks[target].amount * calcPowerRatio(exponent, locks[target].deadline - block.timestamp)) / PRECISION;
    }

    function calcPowerRatio(uint256 _exponent, uint256 remainingSeconds) public pure returns (uint256 power) {
        int128 factor = ABDKMath64x64.divu(_exponent, PRECISION);
        int128 months = ABDKMath64x64.divu(remainingSeconds, 30 days);
        power = months.log_2().mul(factor).exp_2().mulu(PRECISION);
    }
}

struct Lock {
    uint256 amount;
    uint256 deadline;
}
