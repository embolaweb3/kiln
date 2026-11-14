// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {TeamBond} from "../src/TeamBond.sol";
import {ITeamBond} from "../src/interfaces/ITeamBond.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {FeeToken} from "./mocks/FeeToken.sol";
import {MockSale} from "./mocks/MockSale.sol";

contract TeamBondTest is Test {
    TeamBond bond;
    MockERC20 mezo;
    MockSale sale;
    address factory = makeAddr("factory");
    address team = makeAddr("team");
    address alice = makeAddr("alice");
    address bob = makeAddr("bob");

    uint256 constant BOND = 1_000e18;

    event BondDeposited(address indexed sale, address indexed team, uint256 amount);
    event BondReleased(address indexed sale, address indexed team, uint256 amount);
    event BondSlashed(address indexed sale, uint256 amount);
    event SlashClaimed(address indexed sale, address indexed wallet, uint256 amount);

    function setUp() public {
        mezo = new MockERC20("MEZO", "MEZO", 18);
        bond = new TeamBond(mezo, factory);
        sale = new MockSale();
        mezo.mint(factory, 10_000e18);
        vm.prank(factory);
        mezo.approve(address(bond), type(uint256).max);
    }

    function _deposit() internal {
        vm.prank(factory);
        bond.deposit(address(sale), team, BOND);
    }

    function test_constructorRejectsZeroAddresses() public {
        vm.expectRevert(TeamBond.ZeroAddress.selector);
        new TeamBond(mezo, address(0));
        vm.expectRevert(TeamBond.ZeroAddress.selector);
        new TeamBond(MockERC20(address(0)), factory);
    }

    function test_depositEmitsAndHolds() public {
        vm.expectEmit(true, true, false, true);
        emit BondDeposited(address(sale), team, BOND);
        _deposit();
        (address t, uint256 a, TeamBond.Status s) = bond.bonds(address(sale));
        assertEq(t, team);
        assertEq(a, BOND);
        assertTrue(s == TeamBond.Status.Held);
        assertEq(mezo.balanceOf(address(bond)), BOND);
    }

    function test_depositOnlyFactory() public {
        vm.expectRevert(TeamBond.OnlyFactory.selector);
        bond.deposit(address(sale), team, BOND);
    }

    function test_depositZeroReverts() public {
        vm.prank(factory);
        vm.expectRevert(TeamBond.ZeroAmount.selector);
        bond.deposit(address(sale), team, 0);
    }

    function test_depositTwiceReverts() public {
        _deposit();
        vm.prank(factory);
        vm.expectRevert(TeamBond.BondExists.selector);
        bond.deposit(address(sale), team, BOND);
    }

    function test_depositRejectsFeeToken() public {
        FeeToken fee = new FeeToken();
        TeamBond b = new TeamBond(fee, factory);
        fee.mint(factory, 1000e18);
        vm.startPrank(factory);
        fee.approve(address(b), type(uint256).max);
        vm.expectRevert(TeamBond.FeeOnTransferToken.selector);
        b.deposit(address(sale), team, 100e18);
        vm.stopPrank();
    }

    function test_releaseReturnsToTeam() public {
        _deposit();
        vm.expectEmit(true, true, false, true);
        emit BondReleased(address(sale), team, BOND);
        sale.release(bond);
        assertEq(mezo.balanceOf(team), BOND);
        assertEq(mezo.balanceOf(address(bond)), 0);
    }

    function test_releaseWithoutBondReverts() public {
        vm.expectRevert(TeamBond.NoActiveBond.selector);
        sale.release(bond);
    }

    function test_releaseTwiceReverts() public {
        _deposit();
        sale.release(bond);
        vm.expectRevert(TeamBond.NoActiveBond.selector);
        sale.release(bond);
    }

    function test_onlyOwningSaleCanReleaseOrSlash() public {
        _deposit();
        MockSale other = new MockSale();
        vm.expectRevert(TeamBond.NoActiveBond.selector);
        other.release(bond);
        vm.expectRevert(TeamBond.NoActiveBond.selector);
        other.slash(bond);
        vm.prank(team);
        vm.expectRevert(TeamBond.NoActiveBond.selector);
        bond.release();
        vm.prank(factory);
        vm.expectRevert(TeamBond.NoActiveBond.selector);
        bond.slash();
    }

    function test_slashThenClaimProRata() public {
        _deposit();
        sale.setContribution(alice, 300e18);
        sale.setContribution(bob, 100e18);
        vm.expectEmit(true, false, false, true);
        emit BondSlashed(address(sale), BOND);
        sale.slash(bond);

        vm.expectEmit(true, true, false, true);
        emit SlashClaimed(address(sale), alice, 750e18);
        vm.prank(alice);
        bond.claimSlash(address(sale));
        vm.prank(bob);
        bond.claimSlash(address(sale));
        assertEq(mezo.balanceOf(alice), 750e18);
        assertEq(mezo.balanceOf(bob), 250e18);
        assertEq(mezo.balanceOf(team), 0);
    }

    function test_slashedBondCannotBeReleased() public {
        _deposit();
        sale.slash(bond);
        vm.expectRevert(TeamBond.NoActiveBond.selector);
        sale.release(bond);
        vm.expectRevert(TeamBond.NoActiveBond.selector);
        sale.slash(bond);
    }

    function test_claimBeforeSlashReverts() public {
        _deposit();
        sale.setContribution(alice, 1e18);
        vm.prank(alice);
        vm.expectRevert(TeamBond.NotSlashed.selector);
        bond.claimSlash(address(sale));
    }

    function test_claimTwiceReverts() public {
        _deposit();
        sale.setContribution(alice, 1e18);
        sale.slash(bond);
        vm.startPrank(alice);
        bond.claimSlash(address(sale));
        vm.expectRevert(TeamBond.AlreadyClaimed.selector);
        bond.claimSlash(address(sale));
        vm.stopPrank();
    }

    function test_nonContributorCannotClaim() public {
        _deposit();
        sale.setContribution(alice, 1e18);
        sale.slash(bond);
        vm.prank(bob);
        vm.expectRevert(TeamBond.NothingToClaim.selector);
        bond.claimSlash(address(sale));
    }

    function testFuzz_slashSharesNeverExceedBond(uint96 a, uint96 b, uint96 c, uint96 bondAmt) public {
        uint256 amt = bound(bondAmt, 1, 5_000e18);
        uint256 ca = bound(a, 1, 1e24);
        uint256 cb = bound(b, 1, 1e24);
        uint256 cc = bound(c, 1, 1e24);
        vm.prank(factory);
        bond.deposit(address(sale), team, amt);
        sale.setContribution(alice, ca);
        sale.setContribution(bob, cb);
        address carol = makeAddr("carol");
        sale.setContribution(carol, cc);
        sale.slash(bond);
        uint256 paid;
        address[3] memory who = [alice, bob, carol];
        for (uint256 i; i < 3; i++) {
            vm.prank(who[i]);
            try bond.claimSlash(address(sale)) {
                paid += mezo.balanceOf(who[i]);
            } catch {}
        }
        assertLe(paid, amt);
        assertEq(mezo.balanceOf(address(bond)), amt - paid);
    }
}
