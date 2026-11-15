// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {DemoToken} from "../src/demo/DemoToken.sol";

contract DemoTokenTest is Test {
    function test_mintsFixedSupplyToHolder() public {
        address holder = makeAddr("holder");
        DemoToken t = new DemoToken("Ember Labs", "EMBR", holder, 1_000_000e18);
        assertEq(t.name(), "Ember Labs");
        assertEq(t.symbol(), "EMBR");
        assertEq(t.decimals(), 18);
        assertEq(t.totalSupply(), 1_000_000e18);
        assertEq(t.balanceOf(holder), 1_000_000e18);
    }

    function test_supplyCannotGrow() public {
        DemoToken t = new DemoToken("Ember Labs", "EMBR", address(this), 1e18);
        (bool ok,) = address(t).call(abi.encodeWithSignature("mint(address,uint256)", address(this), 1e18));
        assertFalse(ok);
    }
}
