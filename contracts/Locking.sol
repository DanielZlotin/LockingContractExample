// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "./ABDKMath64x64.sol";

contract Locking is Ownable, ReentrancyGuard {
    using SafeERC20 for IERC20;
    using ABDKMath64x64 for int128;

    IERC20 public token; // FoT is NOT supported
    mapping(address => Lock) public locks;

    uint256 public constant PRECISION = 10000;
    uint256 public exponent; // based on PERCISION
    uint256 public immutable penalty; // based on PERCISION
    address public immutable feeReceiver1; // 50% of penalties
    address public immutable feeReceiver2; // 50% of penalties

    struct Lock {
        uint256 amount;
        uint256 deadline;
    }

    event Locked(address indexed target, uint256 amount, uint256 deadline);
    event Withdraw(address indexed target, uint256 amount);
    event WithdrawWithPenalty(address indexed target, uint256 amount, uint256 penalty);

    constructor(address _token, uint256 _exp, uint256 _penalty, address _feeReceiver1, address _feeReceiver2) {
        token = IERC20(_token);
        exponent = _exp;
        penalty = _penalty;
        feeReceiver1 = _feeReceiver1;
        feeReceiver2 = _feeReceiver2;
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
        emit Locked(msg.sender, locks[msg.sender].amount, locks[msg.sender].deadline);
    }

    function withdraw() external nonReentrant {
        require(locks[msg.sender].deadline < block.timestamp, "Locking:withdraw:deadline");
        uint256 amount = locks[msg.sender].amount;
        delete locks[msg.sender];
        token.safeTransfer(msg.sender, amount);
        emit Withdraw(msg.sender, amount);
    }

    function earlyWithdrawWithPenalty(uint256 amount) external nonReentrant {
        locks[msg.sender].amount -= amount;
        uint256 penaltyAmount = (amount * penalty) / PRECISION;
        uint256 amountAfterPenalty = amount - penaltyAmount;
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
        int128 factor = ABDKMath64x64.divu(_exponent, PRECISION);
        int128 months = ABDKMath64x64.divu(remainingSeconds, 30 days);
        power = months.log_2().mul(factor).exp_2().mulu(PRECISION);
    }

    function lockedBalanceOf(address target) external view returns (uint256 amount, uint256 deadline) {
        amount = locks[target].amount;
        deadline = locks[target].deadline;
    }

    function boostedBalanceOf(address target) external view returns (uint256 amount) {
        amount = (locks[target].amount * calcPowerRatio(exponent, locks[target].deadline - block.timestamp)) / PRECISION;
    }

    /**************************************
     * Admin functions
     **************************************/

    function setExponent(uint256 _exponent) external onlyOwner {
        exponent = _exponent;
    }
}
