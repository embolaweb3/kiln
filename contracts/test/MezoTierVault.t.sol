// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {MezoTierVault} from "../src/MezoTierVault.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {FeeToken} from "./mocks/FeeToken.sol";
import {MockSale} from "./mocks/MockSale.sol";

contract MezoTierVaultTest is Test {
    MezoTierVault vault;
    MockERC20 mezo;
    MockSale sale;
    address factory = makeAddr("factory");
    address owner = makeAddr("owner");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    uint256 constant BASE = 1_000e18;
    uint256 constant PER_MEZO = 10e18; // 10 MUSD per MEZO
    uint256 constant MAX = 50_000e18;
    uint256 constant ABS_MAX = 100_000e18;

    event Staked(address indexed wallet, uint256 amount, uint256 totalStaked);
    event Unstaked(address indexed wallet, uint256 amount, uint256 totalStaked);
    event SaleRegistered(address indexed sale);
    event WalletLocked(address indexed sale, address indexed wallet);
    event WalletUnlocked(address indexed sale, address indexed wallet);
    event CapParamsUpdated(uint256 baseCap, uint256 capPerMezo, uint256 maxCap);

    function setUp() public {
        mezo = new MockERC20("MEZO", "MEZO", 18);
        vault = new MezoTierVault(mezo, factory, owner, ABS_MAX, BASE, PER_MEZO, MAX);
        sale = new MockSale();
        vm.prank(factory);
        vault.registerSale(address(sale));
        mezo.mint(alice, 1_000_000e18);
        mezo.mint(bob, 1_000_000e18);
        vm.prank(alice);
        mezo.approve(address(vault), type(uint256).max);
        vm.prank(bob);
        mezo.approve(address(vault), type(uint256).max);
    }

    function test_constructorSetsParams() public view {
        assertEq(vault.baseCap(), BASE);
        assertEq(vault.capPerMezo(), PER_MEZO);
        assertEq(vault.maxCap(), MAX);
        assertEq(vault.owner(), owner);
    }

    function test_constructorRevertsOnBadParams() public {
        vm.expectRevert(MezoTierVault.InvalidCapParams.selector);
        new MezoTierVault(mezo, factory, owner, ABS_MAX, BASE, PER_MEZO, ABS_MAX + 1);
        vm.expectRevert(MezoTierVault.InvalidCapParams.selector);
        new MezoTierVault(mezo, factory, owner, ABS_MAX, MAX + 1, PER_MEZO, MAX);
    }

    function test_stakeEmitsAndRaisesCap() public {
        vm.expectEmit(true, false, false, true);
        emit Staked(alice, 100e18, 100e18);
        vm.prank(alice);
        vault.stake(100e18);
        assertEq(vault.staked(alice), 100e18);
        assertEq(vault.maxContribution(alice), BASE + 1_000e18);
        assertEq(vault.maxContribution(bob), BASE);
    }

    function test_capBoundedByMax() public {
        vm.prank(alice);
        vault.stake(900_000e18);
        assertEq(vault.maxContribution(alice), MAX);
    }

    function test_stakeZeroReverts() public {
        vm.prank(alice);
        vm.expectRevert(MezoTierVault.ZeroAmount.selector);
        vault.stake(0);
    }

    function test_stakeRejectsFeeOnTransfer() public {
        FeeToken fee = new FeeToken();
        MezoTierVault v = new MezoTierVault(fee, factory, owner, ABS_MAX, BASE, PER_MEZO, MAX);
        fee.mint(alice, 1000e18);
        vm.startPrank(alice);
        fee.approve(address(v), type(uint256).max);
        vm.expectRevert(MezoTierVault.FeeOnTransferToken.selector);
        v.stake(100e18);
        vm.stopPrank();
    }

    function test_unstakeEmitsAndReturns() public {
        vm.startPrank(alice);
        vault.stake(100e18);
        vm.expectEmit(true, false, false, true);
        emit Unstaked(alice, 40e18, 60e18);
        vault.unstake(40e18);
        vm.stopPrank();
        assertEq(vault.staked(alice), 60e18);
        assertEq(mezo.balanceOf(alice), 1_000_000e18 - 60e18);
    }

    function test_unstakeZeroAndTooMuchRevert() public {
        vm.startPrank(alice);
        vault.stake(10e18);
        vm.expectRevert(MezoTierVault.ZeroAmount.selector);
        vault.unstake(0);
        vm.expectRevert(MezoTierVault.InsufficientStake.selector);
        vault.unstake(11e18);
        vm.stopPrank();
    }

    function test_registerSaleOnlyFactory() public {
        vm.expectRevert(MezoTierVault.OnlyFactory.selector);
        vault.registerSale(address(1));
        vm.expectEmit(true, false, false, false);
        emit SaleRegistered(address(1));
        vm.prank(factory);
        vault.registerSale(address(1));
        assertTrue(vault.isSale(address(1)));
    }

    function test_ownerCannotRegisterSale() public {
        vm.prank(owner);
        vm.expectRevert(MezoTierVault.OnlyFactory.selector);
        vault.registerSale(address(1));
    }

    function test_lockOnlyRegisteredSale() public {
        MockSale rogue = new MockSale();
        vm.expectRevert(MezoTierVault.OnlySale.selector);
        rogue.lock(vault, alice);
        vm.prank(alice);
        vm.expectRevert(MezoTierVault.OnlySale.selector);
        vault.lockWallet(alice);
    }

    function test_lockBlocksUnstake() public {
        vm.prank(alice);
        vault.stake(100e18);
        vm.expectEmit(true, true, false, false);
        emit WalletLocked(address(sale), alice);
        sale.lock(vault, alice);
        assertEq(vault.lockCount(alice), 1);
        vm.prank(alice);
        vm.expectRevert(MezoTierVault.StakeLocked.selector);
        vault.unstake(1e18);
    }

    function test_lockIsIdempotentPerSale() public {
        sale.lock(vault, alice);
        sale.lock(vault, alice);
        assertEq(vault.lockCount(alice), 1);
    }

    function test_unlockRequiresSettledSale() public {
        sale.lock(vault, alice);
        vm.expectRevert(MezoTierVault.SaleNotSettled.selector);
        vault.unlock(address(sale), alice);
        sale.setSettled(true);
        vm.expectEmit(true, true, false, false);
        emit WalletUnlocked(address(sale), alice);
        vault.unlock(address(sale), alice);
        assertEq(vault.lockCount(alice), 0);
    }

    function test_unlockWithoutLockReverts() public {
        sale.setSettled(true);
        vm.expectRevert(MezoTierVault.NotLocked.selector);
        vault.unlock(address(sale), alice);
    }

    function test_stayLockedWhileAnyOtherSaleUnsettled() public {
        MockSale second = new MockSale();
        vm.prank(factory);
        vault.registerSale(address(second));
        vm.prank(alice);
        vault.stake(10e18);
        sale.lock(vault, alice);
        second.lock(vault, alice);
        sale.setSettled(true);
        vault.unlock(address(sale), alice);
        assertEq(vault.lockCount(alice), 1);
        vm.prank(alice);
        vm.expectRevert(MezoTierVault.StakeLocked.selector);
        vault.unstake(1e18);
        second.setSettled(true);
        vault.unlock(address(second), alice);
        vm.prank(alice);
        vault.unstake(10e18);
    }

    function test_setCapParams() public {
        vm.expectEmit(false, false, false, true);
        emit CapParamsUpdated(1, 2, 3);
        vm.prank(owner);
        vault.setCapParams(1, 2, 3);
        assertEq(vault.maxCap(), 3);
    }

    function test_setCapParamsGuards() public {
        vm.expectRevert();
        vault.setCapParams(1, 2, 3);
        vm.startPrank(owner);
        vm.expectRevert(MezoTierVault.InvalidCapParams.selector);
        vault.setCapParams(1, 2, ABS_MAX + 1);
        vm.expectRevert(MezoTierVault.InvalidCapParams.selector);
        vault.setCapParams(5, 2, 4);
        vm.stopPrank();
    }

    function testFuzz_capNeverExceedsMax(uint96 amount, uint96 base, uint96 per) public {
        uint256 b = bound(base, 0, MAX);
        vm.prank(owner);
        vault.setCapParams(b, per, MAX);
        uint256 a = bound(amount, 1, 1_000_000e18);
        vm.prank(alice);
        vault.stake(a);
        uint256 cap = vault.maxContribution(alice);
        assertLe(cap, MAX);
        assertGe(cap, b);
    }

    function testFuzz_lockedStakeCannotLeave(uint96 amount, uint96 out) public {
        uint256 a = bound(amount, 1, 1_000_000e18);
        vm.prank(alice);
        vault.stake(a);
        sale.lock(vault, alice);
        vm.prank(alice);
        vm.expectRevert(MezoTierVault.StakeLocked.selector);
        vault.unstake(bound(out, 1, a));
        assertEq(mezo.balanceOf(address(vault)), a);
    }
}
