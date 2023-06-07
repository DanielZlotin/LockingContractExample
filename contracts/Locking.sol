// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import "@openzeppelin/contracts/utils/Address.sol";

contract Locking {
    using SafeERC20 for IERC20;
    address public token;

    constructor(address _token) {
        token = _token;
    }

    function createLock(uint256 amount, uint256 durationSeconds) external {
        IERC20(token).safeTransferFrom(msg.sender, address(this), amount);
    }
}
