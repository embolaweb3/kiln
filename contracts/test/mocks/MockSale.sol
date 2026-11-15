// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {ISale} from "../../src/interfaces/ISale.sol";
import {IAllocationSource} from "../../src/interfaces/IAllocationSource.sol";
import {ITeamBond} from "../../src/interfaces/ITeamBond.sol";

/// @dev Stand-in sale for vault and bond unit tests.
contract MockSale is ISale {
    mapping(address => uint256) public contributionOf;
    uint256 public totalRaised;
    bool public isSettled;

    function setContribution(address w, uint256 a) external {
        totalRaised = totalRaised - contributionOf[w] + a;
        contributionOf[w] = a;
    }

    function setSettled(bool s) external {
        isSettled = s;
    }

    function lock(IAllocationSource src, address w) external {
        src.lockWallet(w);
    }

    function release(ITeamBond b) external {
        b.release();
    }

    function slash(ITeamBond b) external {
        b.slash();
    }
}
