// SPDX-License-Identifier: MIT
pragma solidity ^0.8.24;

/// @title ITeamBond
/// @notice MEZO escrow holding each team's quality bond.
interface ITeamBond {
    /// @notice Escrow `amount` MEZO from `team` for `sale`. Factory only.
    function deposit(address sale, address team, uint256 amount) external;

    /// @notice Return the bond of the calling sale to its team.
    function release() external;

    /// @notice Mark the bond of the calling sale as slashed to its contributors.
    function slash() external;
}
