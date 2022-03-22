// SPDX-FileCopyrightText: 2021 ShardLabs
// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

interface IFxStateChildTunnel {
    
    /// @dev Function that returns the amount of stMATIC and MATIC in the PoLido protocol
    /// @return stMATIC return value is the number of stMATIC.
    /// @return MATIC return value is the number of MATIC.
    function getReserves() external view returns (uint256 stMATIC, uint256 MATIC);
}
