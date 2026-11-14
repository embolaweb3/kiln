// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ISale
/// @notice Read surface of a Kiln sale used by the vault and the bond.
interface ISale {
    /// @notice Raise-token amount contributed by `wallet`.
    function contributionOf(address wallet) external view returns (uint256);

    /// @notice Total raise-token amount contributed to the sale.
    function totalRaised() external view returns (uint256);

    /// @notice True once the sale is finalized, or ended below its soft cap.
    function isSettled() external view returns (bool);
}
