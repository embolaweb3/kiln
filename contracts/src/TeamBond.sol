// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {ITeamBond} from "./interfaces/ITeamBond.sol";
import {ISale} from "./interfaces/ISale.sol";

/// @title TeamBond
/// @notice Holds each team's MEZO quality bond. A bond leaves only through its own sale:
/// back to the team when the sale fails or the release timelock passes without a veto,
/// or to the sale's contributors, pro rata, when the veto passes. There is no admin path.
contract TeamBond is ITeamBond, ReentrancyGuard {
    using SafeERC20 for IERC20;

    enum Status {
        None,
        Held,
        Released,
        Slashed
    }

    struct Bond {
        address team;
        uint256 amount;
        Status status;
    }

    /// @notice Token the bond is paid in (MEZO).
    IERC20 public immutable bondToken;
    /// @notice The only account allowed to open bonds.
    address public immutable factory;

    /// @notice Bond per sale address.
    mapping(address sale => Bond) public bonds;
    /// @notice Whether a contributor already took their share of a slashed bond.
    mapping(address sale => mapping(address wallet => bool)) public slashClaimed;

    event BondDeposited(address indexed sale, address indexed team, uint256 amount);
    event BondReleased(address indexed sale, address indexed team, uint256 amount);
    event BondSlashed(address indexed sale, uint256 amount);
    event SlashClaimed(address indexed sale, address indexed wallet, uint256 amount);

    error OnlyFactory();
    error ZeroAmount();
    error BondExists();
    error NoActiveBond();
    error NotSlashed();
    error AlreadyClaimed();
    error NothingToClaim();
    error FeeOnTransferToken();
    error ZeroAddress();

    constructor(IERC20 bondToken_, address factory_) {
        if (address(bondToken_) == address(0) || factory_ == address(0)) revert ZeroAddress();
        bondToken = bondToken_;
        factory = factory_;
    }

    /// @inheritdoc ITeamBond
    function deposit(address sale, address team, uint256 amount) external nonReentrant {
        if (msg.sender != factory) revert OnlyFactory();
        if (amount == 0) revert ZeroAmount();
        if (bonds[sale].status != Status.None) revert BondExists();

        bonds[sale] = Bond(team, amount, Status.Held);
        emit BondDeposited(sale, team, amount);

        // The factory forwards tokens it pulled from the team, so the check is on what lands here.
        uint256 before = bondToken.balanceOf(address(this));
        bondToken.safeTransferFrom(msg.sender, address(this), amount);
        if (bondToken.balanceOf(address(this)) - before != amount) revert FeeOnTransferToken();
    }

    /// @inheritdoc ITeamBond
    function release() external nonReentrant {
        Bond storage b = bonds[msg.sender];
        if (b.status != Status.Held) revert NoActiveBond();
        b.status = Status.Released;
        emit BondReleased(msg.sender, b.team, b.amount);
        bondToken.safeTransfer(b.team, b.amount);
    }

    /// @inheritdoc ITeamBond
    function slash() external {
        Bond storage b = bonds[msg.sender];
        if (b.status != Status.Held) revert NoActiveBond();
        b.status = Status.Slashed;
        emit BondSlashed(msg.sender, b.amount);
    }

    /// @notice Take the caller's pro rata share of a slashed bond.
    /// @param sale The sale whose bond was slashed.
    function claimSlash(address sale) external nonReentrant {
        Bond storage b = bonds[sale];
        if (b.status != Status.Slashed) revert NotSlashed();
        if (slashClaimed[sale][msg.sender]) revert AlreadyClaimed();

        uint256 share = (b.amount * ISale(sale).contributionOf(msg.sender)) / ISale(sale).totalRaised();
        if (share == 0) revert NothingToClaim();

        slashClaimed[sale][msg.sender] = true;
        emit SlashClaimed(sale, msg.sender, share);
        bondToken.safeTransfer(msg.sender, share);
    }
}
