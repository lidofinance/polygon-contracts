// SPDX-FileCopyrightText: 2021 ShardLabs
// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.7;

import "@maticnetwork/fx-portal/contracts/tunnel/FxBaseChildTunnel.sol";
import "../interfaces/IFxStateChildTunnel.sol";

/// @title FxStateChildTunnel contract.
/// @author 2021 ShardLabs
contract FxStateChildTunnel is IFxStateChildTunnel, FxBaseChildTunnel {
    uint256 public latestStateId;
    address public latestRootMessageSender;
    bytes public latestData;

    constructor(address _fxChild, address _fxRoot) FxBaseChildTunnel(_fxChild) {
        _setFxRootTunnel(_fxRoot);
    }

    function _processMessageFromRoot(
        uint256 stateId,
        address sender,
        bytes memory data
    ) internal override validateSender(sender) {
        latestStateId = stateId;
        latestRootMessageSender = sender;
        latestData = data;
    }

    
    /// @dev Function that returns the amount of stMATIC and MATIC in the PoLido protocol
    /// @return First return value is the number of stMATIC present, second value is MATIC
    function getReserves() external view override returns (uint256, uint256) {
        (uint256 stMATIC, uint256 MATIC) = abi.decode(
            latestData,
            (uint256, uint256)
        );

        return (stMATIC, MATIC);
    }

    /// @dev set fxRootTunnel if not set already
    function _setFxRootTunnel(address _fxRootTunnel) private {
        require(fxRootTunnel == address(0x0), "FxBaseChildTunnel: ROOT_TUNNEL_ALREADY_SET");
        fxRootTunnel = _fxRootTunnel;
    }
}
