// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {SaleBase} from "./SaleBase.sol";
import {Sale} from "../src/Sale.sol";
import {TeamBond} from "../src/TeamBond.sol";
import {FeeToken} from "./mocks/FeeToken.sol";

contract SaleTest is SaleBase {
    event Contributed(address indexed wallet, uint256 amount, uint256 walletTotal, uint256 totalRaised);
    event Refunded(address indexed wallet, uint256 amount);
    event Finalized(uint256 raised, uint256 firstTranche, uint256 unsoldTokens);
    event TokensClaimed(address indexed wallet, uint256 amount);
    event VetoCast(address indexed wallet, uint256 weight, uint256 totalWeight);
    event VetoTriggered(uint256 totalWeight, uint256 raised);
    event VetoRefunded(address indexed wallet, uint256 amount);
    event RemainderReleased(uint256 amount);
    event FailureReclaimed(uint256 tokens);

    function setUp() public {
        _setUpBase();
    }

    // ---- constructor

    function test_constructorDerivesTokenAmounts() public view {
        assertEq(sale.saleUnit(), 1e18);
        assertEq(sale.tokensForSale(), 200_000e18);
    }

    function test_constructorRejectsBadParams() public {
        Sale.Params memory p = Sale.Params(
            team, token, musd, alloc, bond, PRICE, SOFT, HARD, block.timestamp + 1, block.timestamp + 100, FIRST_BPS, TIMELOCK, VETO_BPS
        );
        Sale.Params memory q;

        q = p; q.team = address(0);
        vm.expectRevert(Sale.InvalidParams.selector); new Sale(q);
        q = p; q.price = 0;
        vm.expectRevert(Sale.InvalidParams.selector); new Sale(q);
        q = p; q.softCap = 0;
        vm.expectRevert(Sale.InvalidParams.selector); new Sale(q);
        q = p; q.softCap = HARD + 1;
        vm.expectRevert(Sale.InvalidParams.selector); new Sale(q);
        q = p; q.end = q.start;
        vm.expectRevert(Sale.InvalidParams.selector); new Sale(q);
        q = p; q.firstTrancheBps = 10_000;
        vm.expectRevert(Sale.InvalidParams.selector); new Sale(q);
        q = p; q.vetoBps = 0;
        vm.expectRevert(Sale.InvalidParams.selector); new Sale(q);
        q = p; q.vetoBps = 10_001;
        vm.expectRevert(Sale.InvalidParams.selector); new Sale(q);
        q = p; q.timelock = 0;
        vm.expectRevert(Sale.InvalidParams.selector); new Sale(q);
        q = p; q.saleToken = musd;
        vm.expectRevert(Sale.InvalidParams.selector); new Sale(q);
        q = p; q.price = type(uint256).max;
        vm.expectRevert(Sale.InvalidParams.selector); new Sale(q);
    }

    // ---- contribute

    function test_contributeEmitsAndLocks() public {
        _open();
        vm.expectEmit(true, false, false, true);
        emit Contributed(alice, 5_000e18, 5_000e18, 5_000e18);
        _contribute(alice, 5_000e18);
        assertEq(sale.contributionOf(alice), 5_000e18);
        assertEq(sale.totalRaised(), 5_000e18);
        assertEq(musd.balanceOf(address(sale)), 5_000e18);
        assertEq(alloc.locks(alice), 1);
        _contribute(alice, 1e18);
        assertEq(alloc.locks(alice), 1, "lock only on first contribution");
    }

    function test_contributeZeroReverts() public {
        _open();
        vm.prank(alice);
        vm.expectRevert(Sale.ZeroAmount.selector);
        sale.contribute(0);
    }

    function test_contributeBeforeStartReverts() public {
        vm.prank(alice);
        vm.expectRevert(Sale.NotStarted.selector);
        sale.contribute(1e18);
    }

    function test_contributeAfterEndReverts() public {
        _endSale();
        vm.prank(alice);
        vm.expectRevert(Sale.SaleClosed.selector);
        sale.contribute(1e18);
    }

    function test_contributeOverWalletCapReverts() public {
        _open();
        _contribute(alice, WALLET_CAP);
        vm.prank(alice);
        vm.expectRevert(Sale.WalletCapExceeded.selector);
        sale.contribute(1);
    }

    function test_contributeOverHardCapReverts() public {
        _open();
        alloc.setCap(HARD);
        _contribute(alice, HARD - 10e18);
        vm.prank(bob);
        vm.expectRevert(Sale.HardCapExceeded.selector);
        sale.contribute(11e18);
        _contribute(bob, 10e18);
        assertEq(sale.totalRaised(), HARD);
    }

    function test_contributeRejectsFeeOnTransferRaiseToken() public {
        FeeToken fee = new FeeToken();
        Sale s = _deploy(fee);
        fee.mint(alice, 1_000e18);
        vm.startPrank(alice);
        fee.approve(address(s), type(uint256).max);
        vm.warp(start);
        vm.expectRevert(Sale.FeeOnTransferToken.selector);
        s.contribute(100e18);
        vm.stopPrank();
    }

    function test_contributeAfterFinalizeAtHardCapReverts() public {
        _open();
        alloc.setCap(HARD);
        _contribute(alice, HARD);
        sale.finalize();
        vm.prank(bob);
        vm.expectRevert(Sale.SaleClosed.selector);
        sale.contribute(1);
    }

    // ---- failed sale

    function _failSale() internal {
        _open();
        _contribute(alice, 3_000e18);
        _contribute(bob, 2_000e18);
        _endSale();
    }

    function test_refundAfterSoftCapMissed() public {
        _failSale();
        vm.expectEmit(true, false, false, true);
        emit Refunded(alice, 3_000e18);
        vm.prank(alice);
        sale.refund();
        assertEq(musd.balanceOf(alice), 1_000_000e18);
        assertEq(sale.totalRefunded(), 3_000e18);
        assertTrue(sale.refunded(alice));
    }

    function test_refundBeforeEndReverts() public {
        _open();
        _contribute(alice, 1e18);
        vm.prank(alice);
        vm.expectRevert(Sale.SaleNotFailed.selector);
        sale.refund();
    }

    function test_refundWhenSoftCapMetReverts() public {
        _open();
        _contribute(alice, SOFT);
        _endSale();
        vm.prank(alice);
        vm.expectRevert(Sale.SaleNotFailed.selector);
        sale.refund();
    }

    function test_refundTwiceAndNonContributorRevert() public {
        _failSale();
        vm.startPrank(alice);
        sale.refund();
        vm.expectRevert(Sale.AlreadyRefunded.selector);
        sale.refund();
        vm.stopPrank();
        vm.prank(carol);
        vm.expectRevert(Sale.NothingContributed.selector);
        sale.refund();
    }

    function test_reclaimOnFailureReturnsTokensAndBond() public {
        _failSale();
        vm.expectEmit(false, false, false, true);
        emit FailureReclaimed(200_000e18);
        sale.reclaimOnFailure();
        assertEq(token.balanceOf(team), 200_000e18);
        assertEq(mezo.balanceOf(team), BOND);
        vm.expectRevert(Sale.AlreadyReleased.selector);
        sale.reclaimOnFailure();
    }

    function test_reclaimOnFailureOnlyWhenFailed() public {
        _open();
        _contribute(alice, SOFT);
        _endSale();
        vm.expectRevert(Sale.SaleNotFailed.selector);
        sale.reclaimOnFailure();
    }

    function test_failedSaleCannotFinalize() public {
        _failSale();
        vm.expectRevert(Sale.SoftCapNotMet.selector);
        sale.finalize();
    }

    // ---- finalize and claim

    function _succeed() internal {
        _open();
        _contribute(alice, 10_000e18);
        _contribute(bob, 6_000e18);
        _contribute(carol, 4_000e18);
        _endSale();
    }

    function test_finalizePaysFirstTrancheAndReturnsUnsold() public {
        _succeed();
        // raised 20_000 -> sold 40_000 tokens of 200_000, unsold 160_000
        vm.expectEmit(false, false, false, true);
        emit Finalized(20_000e18, 5_000e18, 160_000e18);
        sale.finalize();
        assertEq(musd.balanceOf(team), 5_000e18);
        assertEq(token.balanceOf(team), 160_000e18);
        assertEq(musd.balanceOf(address(sale)), 15_000e18);
        assertEq(sale.totalReleased(), 5_000e18);
        assertTrue(sale.state() == Sale.State.Timelocked);
    }

    function test_finalizeBeforeEndReverts() public {
        _open();
        _contribute(alice, SOFT);
        vm.expectRevert(Sale.SaleNotEnded.selector);
        sale.finalize();
    }

    function test_finalizeEarlyAtHardCap() public {
        _open();
        alloc.setCap(HARD);
        _contribute(alice, HARD);
        sale.finalize();
        assertTrue(sale.finalized());
        assertEq(token.balanceOf(team), 0, "everything sold");
    }

    function test_finalizeTwiceReverts() public {
        _succeed();
        sale.finalize();
        vm.expectRevert(Sale.AlreadyFinalized.selector);
        sale.finalize();
    }

    function test_claimTokens() public {
        _succeed();
        sale.finalize();
        vm.expectEmit(true, false, false, true);
        emit TokensClaimed(alice, 20_000e18);
        vm.prank(alice);
        sale.claim();
        assertEq(token.balanceOf(alice), 20_000e18);
    }

    function test_claimGuards() public {
        _succeed();
        vm.prank(alice);
        vm.expectRevert(Sale.NotFinalized.selector);
        sale.claim();
        sale.finalize();
        vm.startPrank(alice);
        sale.claim();
        vm.expectRevert(Sale.AlreadyClaimed.selector);
        sale.claim();
        vm.stopPrank();
        address dave = makeAddr("dave");
        vm.prank(dave);
        vm.expectRevert(Sale.NothingContributed.selector);
        sale.claim();
    }

    // ---- release without veto

    function test_releaseRemainderAfterTimelock() public {
        _succeed();
        sale.finalize();
        vm.expectRevert(Sale.TimelockActive.selector);
        sale.releaseRemainder();

        vm.warp(block.timestamp + TIMELOCK);
        assertTrue(sale.state() == Sale.State.Releasable);
        vm.expectEmit(false, false, false, true);
        emit RemainderReleased(15_000e18);
        sale.releaseRemainder();
        assertEq(musd.balanceOf(team), 20_000e18);
        assertEq(mezo.balanceOf(team), BOND);
        assertEq(musd.balanceOf(address(sale)), 0);
        assertTrue(sale.state() == Sale.State.Completed);

        vm.expectRevert(Sale.AlreadyReleased.selector);
        sale.releaseRemainder();
    }

    function test_releaseBeforeFinalizeReverts() public {
        vm.expectRevert(Sale.NotFinalized.selector);
        sale.releaseRemainder();
    }

    // ---- veto

    function test_vetoExactlyAtThresholdPasses() public {
        _succeed(); // raised 20_000, threshold 20% = 4_000, carol holds exactly 4_000
        sale.finalize();
        vm.expectEmit(true, false, false, true);
        emit VetoCast(carol, 4_000e18, 4_000e18);
        vm.prank(carol);
        sale.veto();
        assertTrue(sale.vetoed());
    }

    function test_vetoAccumulatesAcrossWallets() public {
        _open();
        _contribute(alice, 12_000e18);
        _contribute(bob, 6_000e18);
        _contribute(carol, 2_000e18);
        _endSale();
        sale.finalize(); // raised 20_000, threshold 4_000
        vm.prank(carol);
        sale.veto();
        assertFalse(sale.vetoed());
        assertEq(sale.vetoWeight(), 2_000e18);
        vm.expectEmit(false, false, false, true);
        emit VetoTriggered(8_000e18, 20_000e18);
        vm.prank(bob);
        sale.veto();
        assertTrue(sale.vetoed());
        assertTrue(sale.state() == Sale.State.Vetoed);
    }

    function test_vetoGuards() public {
        _succeed();
        vm.prank(carol);
        vm.expectRevert(Sale.NotFinalized.selector);
        sale.veto();
        sale.finalize();

        address dave = makeAddr("dave");
        vm.prank(dave);
        vm.expectRevert(Sale.NothingContributed.selector);
        sale.veto();

        vm.warp(block.timestamp + TIMELOCK);
        vm.prank(carol);
        vm.expectRevert(Sale.TimelockOver.selector);
        sale.veto();
    }

    function test_vetoTwiceSameWalletReverts() public {
        _open();
        _contribute(alice, 1_000e18);
        _contribute(bob, 19_000e18);
        _endSale();
        sale.finalize();
        vm.startPrank(alice);
        sale.veto();
        vm.expectRevert(Sale.AlreadyVetoed.selector);
        sale.veto();
        vm.stopPrank();
    }

    function test_vetoAfterTriggeredReverts() public {
        _succeed();
        sale.finalize();
        vm.prank(alice);
        sale.veto();
        vm.prank(bob);
        vm.expectRevert(Sale.AlreadyVetoed.selector);
        sale.veto();
    }

    function test_vetoSlashesBondAndBlocksRelease() public {
        _succeed();
        sale.finalize();
        vm.prank(alice);
        sale.veto();
        (,, TeamBond.Status s) = bond.bonds(address(sale));
        assertTrue(s == TeamBond.Status.Slashed);
        vm.warp(block.timestamp + TIMELOCK);
        vm.expectRevert(Sale.AlreadyVetoed.selector);
        sale.releaseRemainder();
        assertEq(mezo.balanceOf(address(bond)), BOND);
    }

    function test_vetoRefundsRemainderProRata() public {
        _succeed(); // raised 20_000: alice 10_000, bob 6_000, carol 4_000; remainder 15_000
        sale.finalize();
        vm.prank(alice);
        sale.veto();

        vm.expectEmit(true, false, false, true);
        emit VetoRefunded(alice, 7_500e18);
        vm.prank(alice);
        sale.claimVetoRefund();
        vm.prank(bob);
        sale.claimVetoRefund();
        vm.prank(carol);
        sale.claimVetoRefund();
        assertEq(musd.balanceOf(address(sale)), 0);
        assertEq(sale.totalRefunded(), 15_000e18);

        // bond goes to contributors pro rata too
        vm.prank(alice);
        bond.claimSlash(address(sale));
        assertEq(mezo.balanceOf(alice), 500e18);
    }

    function test_vetoRefundGuards() public {
        _succeed();
        sale.finalize();
        vm.prank(alice);
        vm.expectRevert(Sale.VetoNotTriggered.selector);
        sale.claimVetoRefund();
        vm.prank(alice);
        sale.veto();
        vm.startPrank(alice);
        sale.claimVetoRefund();
        vm.expectRevert(Sale.AlreadyClaimed.selector);
        sale.claimVetoRefund();
        vm.stopPrank();
        address dave = makeAddr("dave");
        vm.prank(dave);
        vm.expectRevert(Sale.NothingToRefund.selector);
        sale.claimVetoRefund();
    }

    // ---- state machine

    function test_stateProgression() public {
        assertTrue(sale.state() == Sale.State.Upcoming);
        _open();
        assertTrue(sale.state() == Sale.State.Live);
        _contribute(alice, SOFT);
        _endSale();
        assertTrue(sale.state() == Sale.State.AwaitingFinalize);
        assertFalse(sale.isSettled());
        sale.finalize();
        assertTrue(sale.isSettled());
    }

    function test_failedStateIsSettled() public {
        _failSale();
        assertTrue(sale.state() == Sale.State.Failed);
        assertTrue(sale.isSettled());
    }

    // ---- fuzz

    function testFuzz_contributionsRespectCaps(uint96 a, uint96 b, uint96 cap) public {
        uint256 walletCap = bound(cap, 1e18, HARD);
        alloc.setCap(walletCap);
        _open();
        uint256 x = bound(a, 1, HARD);
        uint256 y = bound(b, 1, HARD);

        vm.prank(alice);
        try sale.contribute(x) {} catch {}
        vm.prank(alice);
        try sale.contribute(y) {} catch {}
        vm.prank(bob);
        try sale.contribute(x) {} catch {}

        assertLe(sale.contributionOf(alice), walletCap);
        assertLe(sale.contributionOf(bob), walletCap);
        assertLe(sale.totalRaised(), HARD);
        assertEq(sale.totalRaised(), sale.contributionOf(alice) + sale.contributionOf(bob));
        assertEq(musd.balanceOf(address(sale)), sale.totalRaised());
    }

    /// Refund and finalize are mutually exclusive in either call order.
    function testFuzz_refundFinalizeOrdering(uint96 a, uint96 b, bool finalizeFirst) public {
        uint256 x = bound(a, 1e18, WALLET_CAP);
        uint256 y = bound(b, 1e18, WALLET_CAP);
        _open();
        _contribute(alice, x);
        _contribute(bob, y);
        _endSale();
        bool met = x + y >= SOFT;

        if (finalizeFirst) {
            try sale.finalize() {
                assertTrue(met);
            } catch {
                assertFalse(met);
            }
        }
        vm.prank(alice);
        try sale.refund() {
            assertFalse(met);
            assertFalse(sale.finalized());
        } catch {
            assertTrue(met);
        }
        if (!finalizeFirst) {
            try sale.finalize() {
                assertTrue(met);
            } catch {
                assertFalse(met);
            }
        }
        assertFalse(sale.finalized() && sale.refunded(alice));
    }

    function testFuzz_vetoThreshold(uint96 a, uint96 b) public {
        uint256 x = bound(a, 1e18, WALLET_CAP);
        uint256 y = bound(b, SOFT, WALLET_CAP);
        _open();
        _contribute(alice, x);
        _contribute(bob, y);
        _endSale();
        sale.finalize();
        vm.prank(alice);
        sale.veto();
        uint256 raised = x + y;
        assertEq(sale.vetoed(), x * 10_000 >= raised * VETO_BPS);
    }

    function testFuzz_vetoRefundsNeverExceedRemainder(uint96 a, uint96 b, uint96 c) public {
        uint256 x = bound(a, 1e18, WALLET_CAP);
        uint256 y = bound(b, 1e18, WALLET_CAP);
        uint256 z = bound(c, 1e18, WALLET_CAP);
        vm.assume(x + y + z >= SOFT);
        _open();
        _contribute(alice, x);
        _contribute(bob, y);
        _contribute(carol, z);
        _endSale();
        sale.finalize();
        vm.prank(alice);
        sale.veto();
        vm.prank(bob);
        try sale.veto() {} catch {}
        if (!sale.vetoed()) {
            vm.prank(carol);
            try sale.veto() {} catch {}
        }
        if (!sale.vetoed()) return;
        for (uint256 i; i < 3; i++) {
            vm.prank(_who(i));
            try sale.claimVetoRefund() {} catch {}
        }
        uint256 raised = x + y + z;
        assertLe(sale.totalRefunded(), raised - sale.totalReleased());
        assertEq(
            musd.balanceOf(address(sale)), sale.totalRaised() - sale.totalRefunded() - sale.totalReleased()
        );
    }
}
