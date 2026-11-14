// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {KilnFactory} from "../src/KilnFactory.sol";
import {Sale} from "../src/Sale.sol";
import {TeamBond} from "../src/TeamBond.sol";
import {MezoTierVault} from "../src/MezoTierVault.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {FeeToken} from "./mocks/FeeToken.sol";

contract KilnFactoryTest is Test {
    KilnFactory factory;
    MezoTierVault vault;
    MockERC20 musd;
    MockERC20 mezo;
    MockERC20 token;
    address team = makeAddr("team");

    KilnFactory.Bounds b = KilnFactory.Bounds({
        minBond: 500e18,
        minDuration: 1 days,
        maxDuration: 30 days,
        minTimelock: 1 days,
        maxTimelock: 14 days,
        minSoftCapBps: 2_000,
        maxFirstTrancheBps: 5_000,
        minVetoBps: 500,
        maxVetoBps: 5_000
    });

    event SaleCreated(
        address indexed sale,
        address indexed team,
        address indexed saleToken,
        uint256 price,
        uint256 softCap,
        uint256 hardCap,
        uint256 start,
        uint256 end,
        uint256 bondAmount
    );

    function setUp() public {
        musd = new MockERC20("MUSD", "MUSD", 18);
        mezo = new MockERC20("MEZO", "MEZO", 18);
        token = new MockERC20("Token", "TKN", 18);
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        vault = new MezoTierVault(mezo, predicted, address(this), 100_000e18, 1_000e18, 10e18, 50_000e18);
        factory = new KilnFactory(musd, mezo, vault, b);
        assertEq(address(factory), predicted);

        token.mint(team, 1_000_000e18);
        mezo.mint(team, 10_000e18);
        vm.startPrank(team);
        token.approve(address(factory), type(uint256).max);
        mezo.approve(address(factory), type(uint256).max);
        vm.stopPrank();
    }

    function _cfg() internal view returns (KilnFactory.SaleConfig memory) {
        return KilnFactory.SaleConfig({
            saleToken: token,
            price: 0.5e18,
            softCap: 20_000e18,
            hardCap: 100_000e18,
            start: block.timestamp + 1 hours,
            end: block.timestamp + 1 hours + 7 days,
            firstTrancheBps: 2_500,
            timelock: 7 days,
            vetoBps: 2_000,
            bondAmount: 1_000e18
        });
    }

    function _create(KilnFactory.SaleConfig memory c) internal returns (Sale) {
        vm.prank(team);
        return Sale(factory.createSale(c));
    }

    function test_createSaleWiresEverything() public {
        KilnFactory.SaleConfig memory c = _cfg();
        vm.expectEmit(false, true, true, false);
        emit SaleCreated(address(0), team, address(token), c.price, c.softCap, c.hardCap, c.start, c.end, c.bondAmount);
        Sale s = _create(c);

        assertEq(s.team(), team);
        assertEq(address(s.allocation()), address(vault));
        assertEq(address(s.raiseToken()), address(musd));
        assertEq(token.balanceOf(address(s)), s.tokensForSale());
        assertEq(mezo.balanceOf(address(factory.bond())), 1_000e18);
        assertTrue(vault.isSale(address(s)));
        assertTrue(factory.isSale(address(s)));
        assertEq(factory.saleCount(), 1);
        assertEq(factory.sales(0), address(s));
        (address t, uint256 a, TeamBond.Status st) = factory.bond().bonds(address(s));
        assertEq(t, team);
        assertEq(a, 1_000e18);
        assertTrue(st == TeamBond.Status.Held);
        assertEq(mezo.balanceOf(address(factory)), 0);
    }

    function test_constructorRejectsBadBounds() public {
        KilnFactory.Bounds memory x = b;
        x.minBond = 0;
        vm.expectRevert(KilnFactory.InvalidBounds.selector);
        new KilnFactory(musd, mezo, vault, x);
        x = b;
        x.minDuration = 31 days;
        vm.expectRevert(KilnFactory.InvalidBounds.selector);
        new KilnFactory(musd, mezo, vault, x);
        x = b;
        x.minTimelock = 15 days;
        vm.expectRevert(KilnFactory.InvalidBounds.selector);
        new KilnFactory(musd, mezo, vault, x);
        x = b;
        x.maxFirstTrancheBps = 10_000;
        vm.expectRevert(KilnFactory.InvalidBounds.selector);
        new KilnFactory(musd, mezo, vault, x);
        x = b;
        x.minVetoBps = 0;
        vm.expectRevert(KilnFactory.InvalidBounds.selector);
        new KilnFactory(musd, mezo, vault, x);
        x = b;
        x.minSoftCapBps = 0;
        vm.expectRevert(KilnFactory.InvalidBounds.selector);
        new KilnFactory(musd, mezo, vault, x);
        x = b;
        x.maxVetoBps = 10_001;
        vm.expectRevert(KilnFactory.InvalidBounds.selector);
        new KilnFactory(musd, mezo, vault, x);
    }

    function test_constructorRejectsZeroAddresses() public {
        vm.expectRevert(KilnFactory.ZeroAddress.selector);
        new KilnFactory(MockERC20(address(0)), mezo, vault, b);
        vm.expectRevert(KilnFactory.ZeroAddress.selector);
        new KilnFactory(musd, MockERC20(address(0)), vault, b);
        vm.expectRevert(KilnFactory.ZeroAddress.selector);
        new KilnFactory(musd, mezo, MezoTierVault(address(0)), b);
    }

    function test_bondBelowMinReverts() public {
        KilnFactory.SaleConfig memory c = _cfg();
        c.bondAmount = 499e18;
        vm.prank(team);
        vm.expectRevert(KilnFactory.BondTooSmall.selector);
        factory.createSale(c);
    }

    function test_startInPastReverts() public {
        KilnFactory.SaleConfig memory c = _cfg();
        vm.warp(10 days);
        c.start = block.timestamp - 1;
        c.end = c.start + 7 days;
        vm.prank(team);
        vm.expectRevert(KilnFactory.StartInPast.selector);
        factory.createSale(c);
    }

    function test_durationBounds() public {
        KilnFactory.SaleConfig memory c = _cfg();
        c.end = c.start + 1 days - 1;
        vm.prank(team);
        vm.expectRevert(KilnFactory.DurationOutOfBounds.selector);
        factory.createSale(c);
        c.end = c.start + 30 days + 1;
        vm.prank(team);
        vm.expectRevert(KilnFactory.DurationOutOfBounds.selector);
        factory.createSale(c);
        c.end = c.start;
        vm.prank(team);
        vm.expectRevert(KilnFactory.DurationOutOfBounds.selector);
        factory.createSale(c);
        c.end = c.start + 1 days;
        _create(c); // boundary accepted
    }

    function test_timelockBounds() public {
        KilnFactory.SaleConfig memory c = _cfg();
        c.timelock = 1 days - 1;
        vm.prank(team);
        vm.expectRevert(KilnFactory.TimelockOutOfBounds.selector);
        factory.createSale(c);
        c.timelock = 14 days + 1;
        vm.prank(team);
        vm.expectRevert(KilnFactory.TimelockOutOfBounds.selector);
        factory.createSale(c);
    }

    function test_softCapRatio() public {
        KilnFactory.SaleConfig memory c = _cfg();
        c.softCap = 20_000e18 - 1;
        vm.prank(team);
        vm.expectRevert(KilnFactory.SoftCapTooLow.selector);
        factory.createSale(c);
        c.softCap = 20_000e18;
        _create(c);
    }

    function test_firstTrancheBound() public {
        KilnFactory.SaleConfig memory c = _cfg();
        c.firstTrancheBps = 5_001;
        vm.prank(team);
        vm.expectRevert(KilnFactory.FirstTrancheTooHigh.selector);
        factory.createSale(c);
    }

    function test_vetoThresholdBounds() public {
        KilnFactory.SaleConfig memory c = _cfg();
        c.vetoBps = 499;
        vm.prank(team);
        vm.expectRevert(KilnFactory.VetoThresholdOutOfBounds.selector);
        factory.createSale(c);
        c.vetoBps = 5_001;
        vm.prank(team);
        vm.expectRevert(KilnFactory.VetoThresholdOutOfBounds.selector);
        factory.createSale(c);
    }

    function test_feeOnTransferSaleTokenRejected() public {
        FeeToken fee = new FeeToken();
        fee.mint(team, 1_000_000e18);
        vm.prank(team);
        fee.approve(address(factory), type(uint256).max);
        KilnFactory.SaleConfig memory c = _cfg();
        c.saleToken = fee;
        vm.prank(team);
        vm.expectRevert(KilnFactory.FeeOnTransferToken.selector);
        factory.createSale(c);
    }

    function test_feeOnTransferBondTokenRejected() public {
        FeeToken fee = new FeeToken();
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        MezoTierVault v = new MezoTierVault(mezo, predicted, address(this), 100_000e18, 1_000e18, 10e18, 50_000e18);
        KilnFactory f = new KilnFactory(musd, fee, v, b);
        fee.mint(team, 10_000e18);
        vm.startPrank(team);
        fee.approve(address(f), type(uint256).max);
        token.approve(address(f), type(uint256).max);
        vm.expectRevert();
        f.createSale(_cfg());
        vm.stopPrank();
    }

    function test_unapprovedTokensRevert() public {
        address stranger = makeAddr("stranger");
        vm.prank(stranger);
        vm.expectRevert();
        factory.createSale(_cfg());
    }

    function test_onlyFactoryCanOpenBondsAndRegisterSales() public {
        TeamBond tb = factory.bond();
        vm.expectRevert(TeamBond.OnlyFactory.selector);
        tb.deposit(address(1), team, 1e18);
        vm.expectRevert(MezoTierVault.OnlyFactory.selector);
        vault.registerSale(address(1));
    }

    function test_directSaleCannotLockStake() public {
        // a sale deployed outside the factory is never registered with the vault
        Sale rogue = new Sale(
            Sale.Params(
                team, token, musd, vault, factory.bond(), 0.5e18, 1e18, 10e18, block.timestamp + 1, block.timestamp + 100, 0, 1, 100
            )
        );
        address user = makeAddr("user");
        musd.mint(user, 10e18);
        vm.warp(block.timestamp + 1);
        vm.startPrank(user);
        musd.approve(address(rogue), type(uint256).max);
        vm.expectRevert(MezoTierVault.OnlySale.selector);
        rogue.contribute(1e18);
        vm.stopPrank();
    }

    function testFuzz_saleTokensMatchHardCap(uint64 price, uint64 hardCap) public {
        uint256 p = bound(price, 1e15, 1_000e18);
        uint256 hc = bound(hardCap, 1_000e18, 1_000_000e18);
        KilnFactory.SaleConfig memory c = _cfg();
        c.price = p;
        c.hardCap = hc;
        c.softCap = hc / 4;
        token.mint(team, hc * 1e18 / p + 1);
        Sale s = _create(c);
        assertEq(s.tokensForSale(), hc * 1e18 / p);
        assertEq(token.balanceOf(address(s)), s.tokensForSale());
    }
}
