// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {Test} from "forge-std/Test.sol";
import {Sale} from "../src/Sale.sol";
import {TeamBond} from "../src/TeamBond.sol";
import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {MockERC20} from "./mocks/MockERC20.sol";
import {MockAllocation} from "./mocks/MockAllocation.sol";

/// @dev Shared fixture: a sale funded the way the factory funds it, with this contract acting as factory.
abstract contract SaleBase is Test {
    uint256 internal constant PRICE = 0.5e18; // 0.5 MUSD per sale token
    uint256 internal constant SOFT = 20_000e18;
    uint256 internal constant HARD = 100_000e18;
    uint256 internal constant WALLET_CAP = 30_000e18;
    uint256 internal constant BOND = 1_000e18;
    uint256 internal constant TIMELOCK = 7 days;
    uint256 internal constant FIRST_BPS = 2_500;
    uint256 internal constant VETO_BPS = 2_000;

    MockERC20 internal musd;
    MockERC20 internal mezo;
    MockERC20 internal token;
    MockAllocation internal alloc;
    TeamBond internal bond;
    Sale internal sale;

    address internal team = makeAddr("team");
    address internal alice = makeAddr("alice");
    address internal bob = makeAddr("bob");
    address internal carol = makeAddr("carol");

    uint256 internal start;
    uint256 internal end;

    function _deploy(IERC20 raise) internal returns (Sale s) {
        start = block.timestamp + 1 days;
        end = start + 7 days;
        s = new Sale(
            Sale.Params({
                team: team,
                saleToken: token,
                raiseToken: raise,
                allocation: alloc,
                bond: bond,
                price: PRICE,
                softCap: SOFT,
                hardCap: HARD,
                start: start,
                end: end,
                firstTrancheBps: FIRST_BPS,
                timelock: TIMELOCK,
                vetoBps: VETO_BPS
            })
        );
        token.mint(address(s), s.tokensForSale());
        mezo.mint(address(this), BOND);
        mezo.approve(address(bond), BOND);
        bond.deposit(address(s), team, BOND);
    }

    function _setUpBase() internal {
        musd = new MockERC20("MUSD", "MUSD", 18);
        mezo = new MockERC20("MEZO", "MEZO", 18);
        token = new MockERC20("Token", "TKN", 18);
        alloc = new MockAllocation(WALLET_CAP);
        bond = new TeamBond(mezo, address(this));
        sale = _deploy(musd);
        for (uint256 i; i < 3; i++) {
            address w = _who(i);
            musd.mint(w, 1_000_000e18);
            vm.prank(w);
            musd.approve(address(sale), type(uint256).max);
        }
    }

    function _who(uint256 i) internal view returns (address) {
        return i == 0 ? alice : i == 1 ? bob : carol;
    }

    function _contribute(address who, uint256 amount) internal {
        vm.prank(who);
        sale.contribute(amount);
    }

    function _open() internal {
        vm.warp(start);
    }

    function _endSale() internal {
        vm.warp(end);
    }
}
