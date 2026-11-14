// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {StdInvariant} from "forge-std/StdInvariant.sol";
import {KilnFactory} from "../src/KilnFactory.sol";
import {Sale} from "../src/Sale.sol";
import {TeamBond} from "../src/TeamBond.sol";
import {MezoTierVault} from "../src/MezoTierVault.sol";
import {MockERC20} from "./mocks/MockERC20.sol";

/// @dev Drives the full system (factory, vault, bond, sale) with random calls from a few actors.
contract Handler is Test {
    MockERC20 public musd;
    MockERC20 public mezo;
    Sale public sale;
    MezoTierVault public vault;
    address[] public actors;
    uint256 public ghostStaked;
    /// set if any accepted contribution left a wallet above its cap at that moment
    bool public capViolated;
    uint256 public accepted;

    constructor(MockERC20 musd_, MockERC20 mezo_, Sale sale_, MezoTierVault vault_, address[] memory actors_) {
        musd = musd_;
        mezo = mezo_;
        sale = sale_;
        vault = vault_;
        actors = actors_;
    }

    function actorCount() external view returns (uint256) {
        return actors.length;
    }

    function _a(uint256 seed) internal view returns (address) {
        return actors[seed % actors.length];
    }

    function stake(uint256 seed, uint256 amount) external {
        address a = _a(seed);
        amount = bound(amount, 1, 5_000e18);
        vm.prank(a);
        try vault.stake(amount) {
            ghostStaked += amount;
        } catch {}
    }

    function unstake(uint256 seed, uint256 amount) external {
        address a = _a(seed);
        amount = bound(amount, 1, 50_000e18);
        vm.prank(a);
        try vault.unstake(amount) {
            ghostStaked -= amount;
        } catch {}
    }

    /// Stakes just enough MEZO to raise the cap, then contributes. Gets the sale past its soft cap.
    function stakeAndContribute(uint256 seed, uint256 amount) external {
        address a = _a(seed);
        amount = bound(amount, 1e18, 40_000e18);
        uint256 cap = vault.maxContribution(a);
        uint256 have = sale.contributionOf(a);
        if (have + amount > cap) {
            uint256 missing = have + amount - cap;
            uint256 perMezo = vault.capPerMezo();
            uint256 need = (missing * 1e18) / perMezo + 1;
            vm.prank(a);
            try vault.stake(need) {
                ghostStaked += need;
            } catch {}
        }
        _contributeAs(a, amount);
    }

    function _contributeAs(address a, uint256 amount) internal {
        vm.prank(a);
        try sale.contribute(amount) {
            accepted++;
            if (sale.contributionOf(a) > vault.maxContribution(a)) capViolated = true;
        } catch {}
    }

    function contribute(uint256 seed, uint256 amount) external {
        _contributeAs(_a(seed), bound(amount, 1, 60_000e18));
    }

    function warp(uint256 secs) external {
        vm.warp(block.timestamp + bound(secs, 1, 2 days));
    }

    function finalize() external {
        try sale.finalize() {} catch {}
    }

    function refund(uint256 seed) external {
        vm.prank(_a(seed));
        try sale.refund() {} catch {}
    }

    function reclaimOnFailure() external {
        try sale.reclaimOnFailure() {} catch {}
    }

    function veto(uint256 seed) external {
        vm.prank(_a(seed));
        try sale.veto() {} catch {}
    }

    function claimVetoRefund(uint256 seed) external {
        vm.prank(_a(seed));
        try sale.claimVetoRefund() {} catch {}
    }

    function releaseRemainder() external {
        try sale.releaseRemainder() {} catch {}
    }

    function claim(uint256 seed) external {
        vm.prank(_a(seed));
        try sale.claim() {} catch {}
    }

    function unlock(uint256 seed) external {
        try vault.unlock(address(sale), _a(seed)) {} catch {}
    }

    function claimSlash(uint256 seed) external {
        TeamBond b = TeamBond(address(sale.bond()));
        vm.prank(_a(seed));
        try b.claimSlash(address(sale)) {} catch {}
    }
}

contract InvariantsTest is StdInvariant, Test {
    MockERC20 musd;
    MockERC20 mezo;
    MockERC20 token;
    KilnFactory factory;
    MezoTierVault vault;
    TeamBond bond;
    Sale sale;
    Handler handler;
    address team = makeAddr("team");
    address[] actors;

    uint256 constant BOND = 1_000e18;

    function setUp() public {
        musd = new MockERC20("MUSD", "MUSD", 18);
        mezo = new MockERC20("MEZO", "MEZO", 18);
        token = new MockERC20("Token", "TKN", 18);
        address predicted = vm.computeCreateAddress(address(this), vm.getNonce(address(this)) + 1);
        vault = new MezoTierVault(mezo, predicted, address(this), 100_000e18, 2_000e18, 5e18, 40_000e18);
        factory = new KilnFactory(
            musd,
            mezo,
            vault,
            KilnFactory.Bounds(500e18, 1 days, 30 days, 1 days, 14 days, 2_000, 5_000, 500, 5_000)
        );
        bond = factory.bond();

        token.mint(team, 1_000_000e18);
        mezo.mint(team, BOND);
        vm.startPrank(team);
        token.approve(address(factory), type(uint256).max);
        mezo.approve(address(factory), type(uint256).max);
        sale = Sale(
            factory.createSale(
                KilnFactory.SaleConfig({
                    saleToken: token,
                    price: 0.5e18,
                    softCap: 20_000e18,
                    hardCap: 100_000e18,
                    start: block.timestamp + 1 hours,
                    end: block.timestamp + 1 hours + 5 days,
                    firstTrancheBps: 2_500,
                    timelock: 3 days,
                    vetoBps: 2_000,
                    bondAmount: BOND
                })
            )
        );
        vm.stopPrank();

        for (uint256 i; i < 4; i++) {
            address a = makeAddr(string.concat("actor", vm.toString(i)));
            actors.push(a);
            musd.mint(a, 1_000_000e18);
            mezo.mint(a, 1_000_000e18);
            vm.startPrank(a);
            musd.approve(address(sale), type(uint256).max);
            mezo.approve(address(vault), type(uint256).max);
            vm.stopPrank();
        }
        vm.warp(block.timestamp + 1 hours);

        handler = new Handler(musd, mezo, sale, vault, actors);
        targetContract(address(handler));
    }

    /// raised == contributions - refunds - released, as token balance
    function invariant_raiseAccounting() public view {
        assertEq(musd.balanceOf(address(sale)), sale.totalRaised() - sale.totalRefunded() - sale.totalReleased());
    }

    function invariant_totalRaisedIsSumOfContributions() public view {
        uint256 sum;
        for (uint256 i; i < actors.length; i++) {
            sum += sale.contributionOf(actors[i]);
        }
        assertEq(sum, sale.totalRaised());
        assertLe(sale.totalRaised(), sale.hardCap());
    }

    function invariant_noWalletOverCap() public view {
        assertFalse(handler.capViolated());
        assertLe(sale.totalRaised(), sale.hardCap());
        // once settled the stake may legitimately leave, so only compare against the live cap before that
        if (sale.isSettled()) return;
        for (uint256 i; i < actors.length; i++) {
            assertLe(sale.contributionOf(actors[i]), vault.maxContribution(actors[i]));
        }
    }

    /// while a contribution is live (sale unsettled) the wallet holds a lock and its stake still backs its cap
    function invariant_stakeLockedWhileContributionLive() public view {
        if (sale.isSettled()) return;
        for (uint256 i; i < actors.length; i++) {
            address a = actors[i];
            if (sale.contributionOf(a) > 0) {
                assertGt(vault.lockCount(a), 0);
                assertLe(sale.contributionOf(a), vault.maxContribution(a));
            }
        }
    }

    function invariant_vaultHoldsAllStakes() public view {
        assertEq(mezo.balanceOf(address(vault)), handler.ghostStaked());
        uint256 sum;
        for (uint256 i; i < actors.length; i++) {
            sum += vault.staked(actors[i]);
        }
        assertEq(sum, handler.ghostStaked());
    }

    /// the bond stays escrowed until the sale fails, or the timelock ends with no veto
    function invariant_bondStaysWhileVetoPossible() public view {
        (, uint256 amount, TeamBond.Status st) = bond.bonds(address(sale));
        assertEq(amount, BOND);
        bool failed = !sale.finalized() && block.timestamp >= sale.end() && sale.totalRaised() < sale.softCap();
        if (sale.vetoed()) {
            assertTrue(st == TeamBond.Status.Slashed);
        } else if (!failed && !sale.remainderReleased()) {
            assertTrue(st == TeamBond.Status.Held);
            assertEq(mezo.balanceOf(address(bond)), BOND);
        }
        if (sale.finalized() && !sale.vetoed() && block.timestamp < sale.finalizedAt() + sale.timelock()) {
            assertTrue(st == TeamBond.Status.Held);
        }
    }

    /// team never holds more than first tranche while the timelock runs
    function invariant_remainderHeldDuringTimelock() public view {
        if (sale.finalized() && !sale.remainderReleased()) {
            assertEq(sale.totalReleased(), (sale.totalRaised() * sale.firstTrancheBps()) / 10_000);
        }
    }
}
