// SPDX-FileCopyrightText: 2021 ShardLabs
// SPDX-License-Identifier: GPL-3.0
pragma solidity ^0.8.7;

import "@maticnetwork/fx-portal/contracts/tunnel/FxBaseRootTunnel.sol";
import "@openzeppelin/contracts/access/Ownable.sol";
import "../interfaces/IFxStateRootTunnel.sol";

/**
 * @title FxStateRootTunnel
 */
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

    function sendMessageToChild(bytes memory message) public override {
        require(msg.sender == stMATIC, "Not stMATIC");
        _sendMessageToChild(message);
    }

    function setStMATIC(address _stMATIC) external override onlyOwner {
        stMATIC = _stMATIC;
    }
}
