// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title IAllocationSource
/// @notice Supplies per-wallet contribution caps to a Kiln sale and records contribution locks.
interface IAllocationSource {
    /// @notice Maximum total raise-token amount `wallet` may contribute to one sale.
    /// @param wallet The contributor.
    /// @return The cap in raise-token units.
    function maxContribution(address wallet) external view returns (uint256);

    /// @notice Called by a sale the first time `wallet` contributes, so the wallet's stake stays locked.
    /// @param wallet The contributor.
    function lockWallet(address wallet) external;
}
