// SPDX-FileCopyrightText: 2021 ShardLabs
// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/ReentrancyGuardUpgradeable.sol";

import "./interfaces/INodeOperatorRegistry.sol";
import "./interfaces/IStMATIC.sol";

/// @title NodeOperatorRegistry
/// @author 2021 ShardLabs.
/// @notice NodeOperatorRegistry is the main contract that manage validators
/// @dev NodeOperatorRegistry is the main contract that manage operators.
contract NodeOperatorRegistry is
    INodeOperatorRegistry,
    PausableUpgradeable,
    AccessControlUpgradeable,
    ReentrancyGuardUpgradeable
{
    /// @notice Add a new node operator registry to the system.
    /// ONLY DAO can execute this function.
    /// @param _validatorId the validator id on stakeManager.
    /// @param _rewardAddress the reward address.
    function addNodeOperatorRegistry(
        uint256 _validatorId,
        address _rewardAddress
    ) external override {}

    /// @notice Remove a new node operator registry from the system and
    /// ONLY DAO can execute this function.
    /// withdraw delegated tokens from it.
    /// @param _validatorId the validator id on stakeManager.
    function removeNodeOperatorRegistry(uint256 _validatorId)
        external
        override
    {}

    /// @notice Set StMatic address.
    /// ONLY DAO can call this function
    /// @param _newStMatic new stMatic address.
    function setStMaticAddress(address _newStMatic) external override {}

    /// @notice Update the reward address of a Node Operator Registry.
    /// ONLY Operator owner can call this function
    /// @param _newRewardAddress the new reward address.
    function setRewardAddress(address _newRewardAddress) external override {}

    /// @notice List all node operator registry available in the system.
    /// @return Returns a list of Active node operator registry.
    function listAllNodeOperatorRegistry()
        external
        view
        override
        returns (NodeOperatorRegistry[] memory)
    {}

    /// @notice List all the ACTIVE operators on the stakeManager.
    /// @return Returns a list of ACTIVE node operator registry.
    function listActiveNodeOperatorRegistry()
        external
        view
        override
        returns (NodeOperatorRegistry[] memory)
    {}

    /// @notice List all the ACTIVE, JAILED and EJECTED operators on the stakeManager.
    /// @return Returns a list of ACTIVE, JAILED and EJECTED node operator registry.
    function listDelegatedNodeOperatorRegistry()
        external
        view
        override
        returns (NodeOperatorRegistry[] memory)
    {}

    /// @notice Returns a node operator registry.
    /// @param _validatorId the validator id on stakeManager.
    /// @return Returns a node operator registry.
    function getNodeOperatorRegistry(uint256 _validatorId)
        external
        view
        override
        returns (NodeOperatorRegistry memory)
    {}

    /// @notice Returns a node operator registry.
    /// @param _rewardAddress the reward address.
    /// @return Returns a node operator registry.
    function getNodeOperatorRegistry(address _rewardAddress)
        external
        view
        override
        returns (NodeOperatorRegistry memory)
    {}

    /// @notice List all the node operator registry in the system.
    /// @return activeNodeOperator the number of active operators.
    /// @return jailedNodeOperator the number of jailed operators.
    /// @return ejectedNodeOperator the number of ejected operators.
    /// @return unstakedNodeOperator the number of unstaked operators.
    function getStats()
        external
        view
        override
        returns (
            uint256 activeNodeOperator,
            uint256 jailedNodeOperator,
            uint256 ejectedNodeOperator,
            uint256 unstakedNodeOperator
        )
    {}
}
