// SPDX-FileCopyrightText: 2021 ShardLabs
// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.7;

import "@maticnetwork/fx-portal/contracts/tunnel/FxBaseRootTunnel.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IFxStateRootTunnel.sol";

/// @title FxStateRootTunnel contract.
/// @author 2021 ShardLabs
contract FxStateRootTunnel is IFxStateRootTunnel, FxBaseRootTunnel, Ownable {
    bytes public latestData;
    address public stMATIC;

    constructor(
        address _checkpointManager,
        address _fxRoot,
        address _fxChildTunnel,
        address _stMATIC
    ) FxBaseRootTunnel(_checkpointManager, _fxRoot) {
        setFxChildTunnel(_fxChildTunnel);
        stMATIC = _stMATIC;
    }

    function _processMessageFromChild(bytes memory data) internal override {
        latestData = data;
    }

    /// @notice send message to child
    /// @param _message message
    function sendMessageToChild(bytes memory _message) public override {
        require(msg.sender == stMATIC, "Not stMATIC");
        _sendMessageToChild(_message);
    }

    /// @notice Set stMatic address
    /// @param _newStMATIC new address.
    function setStMATIC(address _newStMATIC) external override onlyOwner {
        stMATIC = _newStMATIC;
    }
}
