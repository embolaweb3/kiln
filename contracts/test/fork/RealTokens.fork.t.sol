// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";

/// Needs MEZO_TESTNET_RPC_URL; skipped otherwise.
/// MEZO (0x7B7c...0001) is a precompile-backed token whose balanceOf calls itself, so forge's local
/// EVM cannot execute it. Its approve/transferFrom behaviour is proven against the live node
/// in docs/testnet-proof.md instead.
contract RealTokensForkTest is Test {
    address constant MUSD = 0x118917a40FAF1CD7a13dB0Ef56C86De7973Ac503;

    function setUp() public {
        if (!vm.envExists("MEZO_TESTNET_RPC_URL")) vm.skip(true);
        vm.createSelectFork(vm.envString("MEZO_TESTNET_RPC_URL"));
    }

    function test_musdMovesOneToOne() public {
        address from = makeAddr("from");
        address to = makeAddr("to");
        address spender = makeAddr("spender");
        deal(MUSD, from, 1_000e18);

        vm.prank(from);
        IERC20(MUSD).transfer(to, 10e18);
        assertEq(IERC20(MUSD).balanceOf(to), 10e18);

        vm.prank(from);
        IERC20(MUSD).approve(spender, 20e18);
        vm.prank(spender);
        IERC20(MUSD).transferFrom(from, to, 20e18);
        assertEq(IERC20(MUSD).balanceOf(to), 30e18);
        assertEq(IERC20(MUSD).allowance(from, spender), 0);
    }
}
