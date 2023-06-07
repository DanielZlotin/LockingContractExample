// SPDX-License-Identifier: MIT
pragma solidity 0.8.18;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockERC20 is ERC20 {
    constructor(uint256 amount) ERC20("MockERC20", "MockERC20") {
        _mint(msg.sender, amount);
    }
}
