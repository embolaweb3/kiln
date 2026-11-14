// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IAllocationSource} from "../../src/interfaces/IAllocationSource.sol";

/// @dev Flat per-wallet cap with lock bookkeeping, for sale unit tests.
contract MockAllocation is IAllocationSource {
    uint256 public cap;
    mapping(address => uint256) public locks;

    constructor(uint256 cap_) {
        cap = cap_;
    }

    function setCap(uint256 c) external {
        cap = c;
    }

    function maxContribution(address) external view returns (uint256) {
        return cap;
    }

    function lockWallet(address w) external {
        locks[w] += 1;
    }
}
