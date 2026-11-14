// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {IERC20Metadata} from "@openzeppelin/contracts/token/ERC20/extensions/IERC20Metadata.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {IAllocationSource} from "./interfaces/IAllocationSource.sol";
import {ITeamBond} from "./interfaces/ITeamBond.sol";
import {ISale} from "./interfaces/ISale.sol";

/// @title Sale
/// @notice Fixed-price raise in a raise token (MUSD) for a sale token.
/// Below the soft cap, contributors pull refunds. At or above it, anyone can finalize:
/// the team gets a first tranche at once and the remainder after a timelock, during which
/// contributors holding enough of the raise can veto. A veto slashes the team bond to
/// contributors and refunds the unreleased remainder pro rata. Nobody can touch contributor
/// funds outside these paths.
contract Sale is ISale, ReentrancyGuard {
    using SafeERC20 for IERC20;

    uint256 private constant BPS = 10_000;

    struct Params {
        address team;
        IERC20 saleToken;
        IERC20 raiseToken;
        IAllocationSource allocation;
        ITeamBond bond;
        uint256 price; // raise-token units per one whole sale token
        uint256 softCap;
        uint256 hardCap;
        uint256 start;
        uint256 end;
        uint256 firstTrancheBps;
        uint256 timelock;
        uint256 vetoBps;
    }

    enum State {
        Upcoming,
        Live,
        Failed,
        AwaitingFinalize,
        Timelocked,
        Releasable,
        Completed,
        Vetoed
    }

    address public immutable team;
    IERC20 public immutable saleToken;
    IERC20 public immutable raiseToken;
    IAllocationSource public immutable allocation;
    ITeamBond public immutable bond;
    uint256 public immutable price;
    uint256 public immutable softCap;
    uint256 public immutable hardCap;
    uint256 public immutable start;
    uint256 public immutable end;
    uint256 public immutable firstTrancheBps;
    uint256 public immutable timelock;
    uint256 public immutable vetoBps;
    /// @notice One whole sale token in its smallest units.
    uint256 public immutable saleUnit;
    /// @notice Sale tokens the factory must deposit: enough to cover the hard cap.
    uint256 public immutable tokensForSale;

    mapping(address wallet => uint256) public override contributionOf;
    mapping(address wallet => bool) public refunded;
    mapping(address wallet => bool) public tokensClaimed;
    mapping(address wallet => bool) public hasVetoed;
    mapping(address wallet => bool) public vetoRefundClaimed;

    uint256 public override totalRaised;
    /// @notice Raise tokens returned to contributors (failed-sale and veto refunds).
    uint256 public totalRefunded;
    /// @notice Raise tokens paid out to the team.
    uint256 public totalReleased;
    uint256 public vetoWeight;
    uint256 public finalizedAt;
    bool public finalized;
    bool public vetoed;
    bool public remainderReleased;
    bool public failureReclaimed;

    event Contributed(address indexed wallet, uint256 amount, uint256 walletTotal, uint256 totalRaised);
    event Refunded(address indexed wallet, uint256 amount);
    event Finalized(uint256 raised, uint256 firstTranche, uint256 unsoldTokens);
    event TokensClaimed(address indexed wallet, uint256 amount);
    event VetoCast(address indexed wallet, uint256 weight, uint256 totalWeight);
    event VetoTriggered(uint256 totalWeight, uint256 raised);
    event VetoRefunded(address indexed wallet, uint256 amount);
    event RemainderReleased(uint256 amount);
    event FailureReclaimed(uint256 tokens);

    error InvalidParams();
    error ZeroAmount();
    error NotStarted();
    error SaleClosed();
    error HardCapExceeded();
    error WalletCapExceeded();
    error FeeOnTransferToken();
    error SaleNotFailed();
    error AlreadyRefunded();
    error NothingContributed();
    error AlreadyFinalized();
    error SoftCapNotMet();
    error SaleNotEnded();
    error NotFinalized();
    error AlreadyClaimed();
    error AlreadyVetoed();
    error TimelockOver();
    error TimelockActive();
    error VetoNotTriggered();
    error AlreadyReleased();
    error NothingToRefund();

    constructor(Params memory p) {
        if (
            p.team == address(0) || address(p.saleToken) == address(0) || address(p.raiseToken) == address(0)
                || address(p.allocation) == address(0) || address(p.bond) == address(0) || p.price == 0 || p.softCap == 0 || p.softCap > p.hardCap || p.start >= p.end
                || p.firstTrancheBps >= BPS || p.vetoBps == 0 || p.vetoBps > BPS || p.timelock == 0
                || address(p.saleToken) == address(p.raiseToken)
        ) revert InvalidParams();

        team = p.team;
        saleToken = p.saleToken;
        raiseToken = p.raiseToken;
        allocation = p.allocation;
        bond = p.bond;
        price = p.price;
        softCap = p.softCap;
        hardCap = p.hardCap;
        start = p.start;
        end = p.end;
        firstTrancheBps = p.firstTrancheBps;
        timelock = p.timelock;
        vetoBps = p.vetoBps;

        uint256 unit = 10 ** IERC20Metadata(address(p.saleToken)).decimals();
        saleUnit = unit;
        uint256 needed = (p.hardCap * unit) / p.price;
        if (needed == 0) revert InvalidParams();
        tokensForSale = needed;
    }

    /// @notice Contribute raise tokens. Needs prior approval.
    /// @param amount Raise-token amount. The wallet's total is capped by the allocation source.
    function contribute(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (block.timestamp < start) revert NotStarted();
        if (block.timestamp >= end || finalized) revert SaleClosed();

        uint256 raised = totalRaised + amount;
        if (raised > hardCap) revert HardCapExceeded();
        uint256 previous = contributionOf[msg.sender];
        uint256 walletTotal = previous + amount;
        if (walletTotal > allocation.maxContribution(msg.sender)) revert WalletCapExceeded();

        totalRaised = raised;
        contributionOf[msg.sender] = walletTotal;
        emit Contributed(msg.sender, amount, walletTotal, raised);

        if (previous == 0) allocation.lockWallet(msg.sender);

        uint256 before = raiseToken.balanceOf(address(this));
        raiseToken.safeTransferFrom(msg.sender, address(this), amount);
        if (raiseToken.balanceOf(address(this)) - before != amount) revert FeeOnTransferToken();
    }

    /// @notice Pull a refund after the sale ended below its soft cap.
    function refund() external nonReentrant {
        if (!_failed()) revert SaleNotFailed();
        uint256 amount = contributionOf[msg.sender];
        if (amount == 0) revert NothingContributed();
        if (refunded[msg.sender]) revert AlreadyRefunded();

        refunded[msg.sender] = true;
        totalRefunded += amount;
        emit Refunded(msg.sender, amount);
        raiseToken.safeTransfer(msg.sender, amount);
    }

    /// @notice After a failed sale, send the sale tokens and the bond back to the team.
    function reclaimOnFailure() external nonReentrant {
        if (!_failed()) revert SaleNotFailed();
        if (failureReclaimed) revert AlreadyReleased();
        failureReclaimed = true;
        emit FailureReclaimed(tokensForSale);
        saleToken.safeTransfer(team, tokensForSale);
        bond.release();
    }

    /// @notice Finalize a sale that met its soft cap. Pays the first tranche and returns unsold tokens.
    /// Callable by anyone once the sale has ended or hit its hard cap.
    function finalize() external nonReentrant {
        if (finalized) revert AlreadyFinalized();
        uint256 raised = totalRaised;
        if (raised < softCap) revert SoftCapNotMet();
        if (block.timestamp < end && raised < hardCap) revert SaleNotEnded();

        finalized = true;
        finalizedAt = block.timestamp;
        uint256 first = (raised * firstTrancheBps) / BPS;
        totalReleased = first;
        uint256 unsold = tokensForSale - (raised * saleUnit) / price;
        emit Finalized(raised, first, unsold);

        if (first > 0) raiseToken.safeTransfer(team, first);
        if (unsold > 0) saleToken.safeTransfer(team, unsold);
    }

    /// @notice Claim sale tokens after finalization.
    function claim() external nonReentrant {
        if (!finalized) revert NotFinalized();
        if (tokensClaimed[msg.sender]) revert AlreadyClaimed();
        uint256 contributed = contributionOf[msg.sender];
        if (contributed == 0) revert NothingContributed();

        uint256 tokens = (contributed * saleUnit) / price;
        tokensClaimed[msg.sender] = true;
        emit TokensClaimed(msg.sender, tokens);
        saleToken.safeTransfer(msg.sender, tokens);
    }

    /// @notice Add the caller's contribution to the veto during the timelock.
    /// When the combined weight reaches the threshold the veto passes and the bond is slashed.
    function veto() external nonReentrant {
        if (!finalized) revert NotFinalized();
        if (vetoed) revert AlreadyVetoed();
        if (block.timestamp >= finalizedAt + timelock) revert TimelockOver();
        if (hasVetoed[msg.sender]) revert AlreadyVetoed();
        uint256 weight = contributionOf[msg.sender];
        if (weight == 0) revert NothingContributed();

        hasVetoed[msg.sender] = true;
        uint256 total = vetoWeight + weight;
        vetoWeight = total;
        emit VetoCast(msg.sender, weight, total);

        if (total * BPS >= totalRaised * vetoBps) {
            vetoed = true;
            emit VetoTriggered(total, totalRaised);
            bond.slash();
        }
    }

    /// @notice Pull a pro rata share of the unreleased proceeds after a passed veto.
    function claimVetoRefund() external nonReentrant {
        if (!vetoed) revert VetoNotTriggered();
        if (vetoRefundClaimed[msg.sender]) revert AlreadyClaimed();
        uint256 raised = totalRaised;
        uint256 amount = (contributionOf[msg.sender] * (raised - (raised * firstTrancheBps) / BPS)) / raised;
        if (amount == 0) revert NothingToRefund();

        vetoRefundClaimed[msg.sender] = true;
        totalRefunded += amount;
        emit VetoRefunded(msg.sender, amount);
        raiseToken.safeTransfer(msg.sender, amount);
    }

    /// @notice After the timelock with no veto, pay the remainder to the team and return the bond.
    /// Anyone may call it; funds only go to the team.
    function releaseRemainder() external nonReentrant {
        if (!finalized) revert NotFinalized();
        if (vetoed) revert AlreadyVetoed();
        if (block.timestamp < finalizedAt + timelock) revert TimelockActive();
        if (remainderReleased) revert AlreadyReleased();

        remainderReleased = true;
        uint256 amount = totalRaised - totalReleased;
        totalReleased += amount;
        emit RemainderReleased(amount);
        raiseToken.safeTransfer(team, amount);
        bond.release();
    }

    /// @inheritdoc ISale
    function isSettled() external view returns (bool) {
        return finalized || _failed();
    }

    /// @notice Coarse lifecycle state for UIs and tests.
    function state() external view returns (State) {
        if (finalized) {
            if (vetoed) return State.Vetoed;
            if (remainderReleased) return State.Completed;
            if (block.timestamp < finalizedAt + timelock) return State.Timelocked;
            return State.Releasable;
        }
        if (block.timestamp < start) return State.Upcoming;
        if (_failed()) return State.Failed;
        if (block.timestamp >= end || totalRaised >= hardCap) return State.AwaitingFinalize;
        return State.Live;
    }

    function _failed() private view returns (bool) {
        return !finalized && block.timestamp >= end && totalRaised < softCap;
    }
}
