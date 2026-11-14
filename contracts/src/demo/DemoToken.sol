// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ERC20} from "@openzeppelin/contracts/token/ERC20/ERC20.sol";

/// @title DemoToken
/// @notice Plain fixed-supply ERC-20 for testnet sales. The whole supply is minted once to
/// `holder` at construction. There is no mint, burn hook or owner.
contract DemoToken is ERC20 {
    constructor(string memory name_, string memory symbol_, address holder, uint256 supply) ERC20(name_, symbol_) {
        _mint(holder, supply);
    }
}
