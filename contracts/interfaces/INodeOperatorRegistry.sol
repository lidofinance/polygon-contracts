// SPDX-FileCopyrightText: 2021 ShardLabs
// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

/// @title INodeOperatorRegistry
/// @author 2021 ShardLabs
/// @notice Node operator registry interface
interface INodeOperatorRegistry {
    /// @notice Node Operator Registry Statuses
    /// StakeManager statuses: https://github.com/maticnetwork/contracts/blob/v0.3.0-backport/contracts/staking/stakeManager/StakeManagerStorage.sol#L13
    /// ACTIVE: (validator.status == status.Active && validator.deactivationEpoch == 0)
    /// JAILED: (validator.status == status.Locked && validator.deactivationEpoch == 0)
    /// EJECTED: ((validator.status == status.Active || validator.status == status.Locked) && validator.deactivationEpoch != 0)
    /// UNSTAKED: (validator.status == status.Unstaked)
    enum NodeOperatorRegistryStatus {
        INACTIVE,
        ACTIVE,
        JAILED,
        EJECTED,
        UNSTAKED
    }

    /// @notice The full node operator struct.
    /// @param commission rate of each operator
    /// @param validatorId the validator id on stakeManager.
    /// @param validatorShare the validator share address of the validator.
    /// @param rewardAddress the reward address.
    /// @param status the status of the node operator in the stake manager.
    struct FullNodeOperatorRegistry {
        uint256 validatorId;
        uint256 commissionRate;
        address validatorShare;
        address rewardAddress;
        NodeOperatorRegistryStatus status;
    }

    /// @notice The node operator struct
    /// @param validatorShare the validator share address of the validator.
    /// @param rewardAddress the reward address.
    struct NodeOperatorRegistry {
        address validatorShare;
        address rewardAddress;
    }

    /// @notice Add a new node operator to the system.
    /// ONLY DAO can execute this function.
    /// @param _validatorId the validator id on stakeManager.
    /// @param _rewardAddress the reward address.
    function addNodeOperator(uint256 _validatorId, address _rewardAddress)
        external;

    /// @notice Remove a new node operator from the system.
    /// ONLY DAO can execute this function.
    /// withdraw delegated tokens from it.
    /// @param _validatorId the validator id on stakeManager.
    function removeNodeOperator(uint256 _validatorId) external;

    /// @notice Remove an invalid node operator from the system if it fails to meet certain conditions
    /// 1. If the commission of the Node Operator is less than the standard commission
    /// 2. If the Node Operator is either Unstaked or Ejected
    /// @param validatorId the validator id on stakeManager.
    function removeInvalidNodeOperator(uint256 validatorId) external;

    /// @notice Set the new commission rate
    /// ONLY DAO can call this function
    /// @param newCommissionRate the new commission rate
    function setCommissionRate(uint256 newCommissionRate) external;

    /// @notice Set StMatic address.
    /// ONLY DAO can call this function
    /// @param _newStMatic new stMatic address.
    function setStMaticAddress(address _newStMatic) external;

    /// @notice Update reward address of a Node Operator.
    /// ONLY Operator owner can call this function
    /// @param _newRewardAddress the new reward address.
    function setRewardAddress(address _newRewardAddress) external;

    /// @notice List all the operators on the stakeManager that can be withdrawn from this includes ACTIVE, JAILED, and
    /// @notice UNSTAKED operators.
    /// @return Returns a list of ACTIVE, JAILED or UNSTAKED node operator.
    function listWithdrawNodeOperators()
        external
        view
        returns (NodeOperatorRegistry[] memory);

    /// @notice List all the ACTIVE operators on the stakeManager.
    /// @return Returns a list of ACTIVE node operator registry.
    function listDelegatedNodeOperators()
        external
        view
        returns (NodeOperatorRegistry[] memory);

    /// @notice Returns a node operator.
    /// @param _validatorId the validator id on stakeManager.
    /// @return Returns a node operator.
    function getNodeOperator(uint256 _validatorId)
        external
        view
        returns (FullNodeOperatorRegistry memory);

    /// @notice Returns a node operator.
    /// @param _rewardAddress the reward address.
    /// @return Returns a node operator.
    function getNodeOperator(address _rewardAddress)
        external
        view
        returns (FullNodeOperatorRegistry memory);

    /// @notice List all the node operator registry in the system.
    /// @return activeNodeOperator the number of active operators.
    /// @return jailedNodeOperator the number of jailed operators.
    /// @return ejectedNodeOperator the number of ejected operators.
    /// @return unstakedNodeOperator the number of unstaked operators.
    function getStats()
        external
        view
        returns (
            uint256 activeNodeOperator,
            uint256 jailedNodeOperator,
            uint256 ejectedNodeOperator,
            uint256 unstakedNodeOperator
        );

    /// @notice Calculate the ratios to delegate to each validator.
    /// @param _totalBuffred The total amount buffered in stMatic.
    /// @return activeNodeOperators all active node operators.
    /// @return operatorRatios is a list of operator's ratio.
    /// @return totalRatio the total ratio. If ZERO that means the system is balanced.
    function getValidatorsDelegationAmount(uint256 _totalBuffred)
        external
        view
        returns (
            NodeOperatorRegistry[] memory activeNodeOperators,
            uint256[] memory operatorRatios,
            uint256 totalRatio
        );

    /// @notice Calculate the ratios to withdraw from each validator.
    /// @param _totalBuffered The total amount buffered in stMatic.
    /// @return activeNodeOperators all active node operators.
    /// @return operatorRatios is a list of operator's ratio.
    /// @return totalRatio the total ratio. If ZERO that means the system is balanced.
    /// @return totalToWithdraw the total amount to withdraw.
    function getValidatorsRebalanceAmount(uint256 _totalBuffered)
        external
        view
        returns (
            NodeOperatorRegistry[] memory activeNodeOperators,
            uint256[] memory operatorRatios,
            uint256 totalRatio,
            uint256 totalToWithdraw
        );

    // ***********************************EVENTS***********************************
    /// @notice Add Node Operator event
    /// @param validatorId validator id.
    /// @param rewardAddress reward address.
    event AddNodeOperator(uint256 validatorId, address rewardAddress);

    /// @notice Remove Node Operator event.
    /// @param validatorId validator id.
    /// @param rewardAddress reward address.
    event RemoveNodeOperator(uint256 validatorId, address rewardAddress);

    /// @notice Remove Invalid Node Operator event.
    /// @param validatorId validator id.
    /// @param rewardAddress reward address.
    event RemoveInvalidNodeOperator(uint256 validatorId, address rewardAddress);

    /// @notice Set StMatic address event.
    /// @param oldStMatic old stMatic address.
    /// @param newStMatic new stMatic address.
    event SetStMaticAddress(address oldStMatic, address newStMatic);

    /// @notice Set reward address event.
    /// @param validatorId the validator id.
    /// @param oldRewardAddress old reward address.
    /// @param newRewardAddress new reward address.
    event SetRewardAddress(
        uint256 validatorId,
        address oldRewardAddress,
        address newRewardAddress
    );

    /// @notice Emit when the default commission rate is changed.
    /// @param oldCommissionRate the old commission rate.
    /// @param newCommissionRate the new commission rate.
    event SetCommissionRate(
        uint256 oldCommissionRate,
        uint256 newCommissionRate
    );
}
