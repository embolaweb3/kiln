// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Sale} from "./Sale.sol";
import {TeamBond} from "./TeamBond.sol";
import {MezoTierVault} from "./MezoTierVault.sol";
import {ITeamBond} from "./interfaces/ITeamBond.sol";

/// @title KilnFactory
/// @notice Creates sales inside fixed parameter bounds, escrows the team's sale tokens and
/// MEZO bond, and registers each sale with the tier vault so only factory sales can lock stake.
/// The bounds are set at deployment and cannot change. The factory has no owner.
contract KilnFactory is ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant BPS = 10_000;

    struct Bounds {
        uint256 minBond; // MEZO
        uint256 minDuration;
        uint256 maxDuration;
        uint256 minTimelock;
        uint256 maxTimelock;
        uint256 minSoftCapBps; // soft cap as a share of hard cap
        uint256 maxFirstTrancheBps;
        uint256 minVetoBps;
        uint256 maxVetoBps;
    }

    struct SaleConfig {
        IERC20 saleToken;
        uint256 price;
        uint256 softCap;
        uint256 hardCap;
        uint256 start;
        uint256 end;
        uint256 firstTrancheBps;
        uint256 timelock;
        uint256 vetoBps;
        uint256 bondAmount;
    }

    /// @notice Raise token for every sale (MUSD).
    IERC20 public immutable raiseToken;
    /// @notice Bond token (MEZO).
    IERC20 public immutable bondToken;
    /// @notice Tier vault used as each sale's allocation source.
    MezoTierVault public immutable vault;
    /// @notice Bond escrow, deployed by this factory.
    TeamBond public immutable bond;

    Bounds public bounds;

    address[] public sales;
    mapping(address sale => bool) public isSale;

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

    error InvalidBounds();
    error BondTooSmall();
    error StartInPast();
    error DurationOutOfBounds();
    error TimelockOutOfBounds();
    error SoftCapTooLow();
    error FirstTrancheTooHigh();
    error VetoThresholdOutOfBounds();
    error FeeOnTransferToken();
    error ZeroAddress();

    constructor(IERC20 raiseToken_, IERC20 bondToken_, MezoTierVault vault_, Bounds memory b) {
        if (address(raiseToken_) == address(0) || address(bondToken_) == address(0) || address(vault_) == address(0)) {
            revert ZeroAddress();
        }
        if (
            b.minBond == 0 || b.minDuration == 0 || b.minDuration > b.maxDuration || b.minTimelock == 0
                || b.minTimelock > b.maxTimelock || b.minSoftCapBps == 0 || b.minSoftCapBps > BPS
                || b.maxFirstTrancheBps >= BPS || b.minVetoBps == 0 || b.minVetoBps > b.maxVetoBps
                || b.maxVetoBps > BPS
        ) revert InvalidBounds();
        raiseToken = raiseToken_;
        bondToken = bondToken_;
        vault = vault_;
        bounds = b;
        bond = new TeamBond(bondToken_, address(this));
    }

    /// @notice Create a sale. The caller becomes the team and must have approved this factory
    /// for the bond and for the sale tokens covering the hard cap.
    /// @param c Sale configuration, checked against the factory bounds.
    /// @return sale The new sale.
    function createSale(SaleConfig calldata c) external nonReentrant returns (address sale) {
        Bounds memory b = bounds;
        if (c.bondAmount < b.minBond) revert BondTooSmall();
        if (c.start < block.timestamp) revert StartInPast();
        if (c.end <= c.start || c.end - c.start < b.minDuration || c.end - c.start > b.maxDuration) {
            revert DurationOutOfBounds();
        }
        if (c.timelock < b.minTimelock || c.timelock > b.maxTimelock) revert TimelockOutOfBounds();
        if (c.softCap * BPS < c.hardCap * b.minSoftCapBps) revert SoftCapTooLow();
        if (c.firstTrancheBps > b.maxFirstTrancheBps) revert FirstTrancheTooHigh();
        if (c.vetoBps < b.minVetoBps || c.vetoBps > b.maxVetoBps) revert VetoThresholdOutOfBounds();

        Sale s = new Sale(
            Sale.Params({
                team: msg.sender,
                saleToken: c.saleToken,
                raiseToken: raiseToken,
                allocation: vault,
                bond: ITeamBond(address(bond)),
                price: c.price,
                softCap: c.softCap,
                hardCap: c.hardCap,
                start: c.start,
                end: c.end,
                firstTrancheBps: c.firstTrancheBps,
                timelock: c.timelock,
                vetoBps: c.vetoBps
            })
        );
        sale = address(s);
        sales.push(sale);
        isSale[sale] = true;
        emit SaleCreated(sale, msg.sender, address(c.saleToken), c.price, c.softCap, c.hardCap, c.start, c.end, c.bondAmount);

        vault.registerSale(sale);

        uint256 tokens = s.tokensForSale();
        uint256 before = c.saleToken.balanceOf(sale);
        c.saleToken.safeTransferFrom(msg.sender, sale, tokens);
        if (c.saleToken.balanceOf(sale) - before != tokens) revert FeeOnTransferToken();

        bondToken.safeTransferFrom(msg.sender, address(this), c.bondAmount);
        bondToken.forceApprove(address(bond), c.bondAmount);
        bond.deposit(sale, msg.sender, c.bondAmount);
    }

    /// @notice Number of sales created so far.
    function saleCount() external view returns (uint256) {
        return sales.length;
    }
}
