// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

import {IERC20} from "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import {SafeERC20} from "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";
import {ReentrancyGuard} from "@openzeppelin/contracts/utils/ReentrancyGuard.sol";
import {Ownable} from "@openzeppelin/contracts/access/Ownable.sol";
import {IAllocationSource} from "./interfaces/IAllocationSource.sol";
import {ISale} from "./interfaces/ISale.sol";

/// @title MezoTierVault
/// @notice Users stake MEZO to raise their per-wallet cap in Kiln sales. Staked MEZO is
/// locked while the wallet has a contribution in a sale that is not yet finalized.
/// The owner can tune the cap curve only; no function moves a user's stake except the user.
contract MezoTierVault is IAllocationSource, ReentrancyGuard, Ownable {
    using SafeERC20 for IERC20;

    uint256 private constant MEZO_UNIT = 1e18;

    /// @notice The staked token (MEZO).
    IERC20 public immutable mezo;
    /// @notice The only account allowed to register sales.
    address public immutable factory;
    /// @notice Ceiling the owner can never raise `maxCap` above.
    uint256 public immutable absoluteMaxCap;

    /// @notice Cap every wallet gets without staking, in raise-token units.
    uint256 public baseCap;
    /// @notice Extra cap per 1e18 staked MEZO, in raise-token units.
    uint256 public capPerMezo;
    /// @notice Upper bound on any wallet's cap.
    uint256 public maxCap;

    /// @notice MEZO staked per wallet.
    mapping(address wallet => uint256) public staked;
    /// @notice Sales created by the factory.
    mapping(address sale => bool) public isSale;
    /// @notice Number of unsettled-sale locks held per wallet.
    mapping(address wallet => uint256) public lockCount;
    /// @notice Whether a wallet is locked by a given sale.
    mapping(address sale => mapping(address wallet => bool)) public lockedBy;

    event Staked(address indexed wallet, uint256 amount, uint256 totalStaked);
    event Unstaked(address indexed wallet, uint256 amount, uint256 totalStaked);
    event SaleRegistered(address indexed sale);
    event WalletLocked(address indexed sale, address indexed wallet);
    event WalletUnlocked(address indexed sale, address indexed wallet);
    event CapParamsUpdated(uint256 baseCap, uint256 capPerMezo, uint256 maxCap);

    error ZeroAmount();
    error OnlyFactory();
    error OnlySale();
    error StakeLocked();
    error InsufficientStake();
    error NotLocked();
    error SaleNotSettled();
    error InvalidCapParams();
    error FeeOnTransferToken();
    error ZeroAddress();

    constructor(
        IERC20 mezo_,
        address factory_,
        address owner_,
        uint256 absoluteMaxCap_,
        uint256 baseCap_,
        uint256 capPerMezo_,
        uint256 maxCap_
    ) Ownable(owner_) {
        if (address(mezo_) == address(0) || factory_ == address(0)) revert ZeroAddress();
        mezo = mezo_;
        factory = factory_;
        absoluteMaxCap = absoluteMaxCap_;
        _setCapParams(baseCap_, capPerMezo_, maxCap_);
    }

    /// @notice Stake MEZO to raise the caller's cap. Needs prior approval.
    /// @param amount MEZO to stake.
    function stake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        uint256 total = staked[msg.sender] + amount;
        staked[msg.sender] = total;
        emit Staked(msg.sender, amount, total);

        uint256 before = mezo.balanceOf(address(this));
        mezo.safeTransferFrom(msg.sender, address(this), amount);
        if (mezo.balanceOf(address(this)) - before != amount) revert FeeOnTransferToken();
    }

    /// @notice Withdraw staked MEZO. Reverts while the caller has a contribution in an unfinalized sale.
    /// @param amount MEZO to withdraw.
    function unstake(uint256 amount) external nonReentrant {
        if (amount == 0) revert ZeroAmount();
        if (lockCount[msg.sender] != 0) revert StakeLocked();
        uint256 current = staked[msg.sender];
        if (amount > current) revert InsufficientStake();
        uint256 total = current - amount;
        staked[msg.sender] = total;
        emit Unstaked(msg.sender, amount, total);
        mezo.safeTransfer(msg.sender, amount);
    }

    /// @inheritdoc IAllocationSource
    function maxContribution(address wallet) public view returns (uint256) {
        uint256 cap = baseCap + (staked[wallet] * capPerMezo) / MEZO_UNIT;
        return cap > maxCap ? maxCap : cap;
    }

    /// @inheritdoc IAllocationSource
    function lockWallet(address wallet) external {
        if (!isSale[msg.sender]) revert OnlySale();
        if (lockedBy[msg.sender][wallet]) return;
        lockedBy[msg.sender][wallet] = true;
        lockCount[wallet] += 1;
        emit WalletLocked(msg.sender, wallet);
    }

    /// @notice Release `wallet`'s lock from `sale` once that sale is finalized or failed.
    /// Anyone may call it, since it only frees the wallet's own stake.
    /// @param sale The sale holding the lock.
    /// @param wallet The locked wallet.
    function unlock(address sale, address wallet) external {
        if (!lockedBy[sale][wallet]) revert NotLocked();
        if (!ISale(sale).isSettled()) revert SaleNotSettled();
        lockedBy[sale][wallet] = false;
        lockCount[wallet] -= 1;
        emit WalletUnlocked(sale, wallet);
    }

    /// @notice Allow a new sale to lock wallets. Factory only.
    /// @param sale The sale address.
    function registerSale(address sale) external {
        if (msg.sender != factory) revert OnlyFactory();
        isSale[sale] = true;
        emit SaleRegistered(sale);
    }

    /// @notice Update the cap curve. Owner only; cannot touch stakes.
    /// @param baseCap_ Cap without any stake.
    /// @param capPerMezo_ Extra cap per 1e18 MEZO staked.
    /// @param maxCap_ Upper bound on any cap, at most `absoluteMaxCap`.
    function setCapParams(uint256 baseCap_, uint256 capPerMezo_, uint256 maxCap_) external onlyOwner {
        _setCapParams(baseCap_, capPerMezo_, maxCap_);
    }

    function _setCapParams(uint256 baseCap_, uint256 capPerMezo_, uint256 maxCap_) private {
        if (maxCap_ > absoluteMaxCap || baseCap_ > maxCap_) revert InvalidCapParams();
        baseCap = baseCap_;
        capPerMezo = capPerMezo_;
        maxCap = maxCap_;
        emit CapParamsUpdated(baseCap_, capPerMezo_, maxCap_);
    }
}
