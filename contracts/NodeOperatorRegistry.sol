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
    /// @notice stakeManager interface.
    IStakeManager public stakeManager;

    /// @notice stMatic interface.
    IStMATIC public stMATIC;

    /// @notice all the roles.
    bytes32 public constant DAO_ROLE = keccak256("LIDO_DAO");

    /// @notice This stores the operators ids.
    uint256[] public validatorIds;

    /// @notice Mapping of all owners with node operator id. Mapping is used to be able to
    /// extend the struct.
    mapping(uint256 => address) public validatorRewardAddress;

    /// @notice Check if the msg.sender has permission.
    /// @param _role role needed to call function.
    modifier userHasRole(bytes32 _role) {
        require(hasRole(_role, msg.sender), "Unauthorized");
        _;
    }

    /// @notice Initialize the NodeOperatorRegistry contract.
    function initialize(IStakeManager _stakeManager, IStMATIC _stMATIC)
        external
        initializer
    {
        __Pausable_init();
        __AccessControl_init();
        __ReentrancyGuard_init();

        stakeManager = _stakeManager;
        stMATIC = _stMATIC;

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(DAO_ROLE, msg.sender);
    }

    /// @notice Add a new node operator to the system.
    /// ONLY DAO can execute this function.
    /// @param _validatorId the validator id on stakeManager.
    /// @param _rewardAddress the reward address.
    function addNodeOperator(
        uint256 _validatorId,
        address _rewardAddress
    ) external override userHasRole(DAO_ROLE) {
        require(_validatorId != 0, "ValidatorId=0");
        require(
            validatorRewardAddress[_validatorId] == address(0),
            "Validator exists"
        );
        require(_rewardAddress != address(0), "Invalid reward address");

        IStakeManager.Validator memory validator = stakeManager.validators(
            _validatorId
        );

        require(
            validator.status == IStakeManager.Status.Active &&
                validator.deactivationEpoch == 0,
            "Validator isn't ACTIVE"
        );

        require(
            validator.contractAddress != address(0),
            "Validator has no ValidatorShare"
        );

        validatorRewardAddress[_validatorId] = _rewardAddress;
        validatorIds.push(_validatorId);

        emit AddNodeOperator(_validatorId, _rewardAddress);
    }

    /// @notice Remove a new node operator from the system.
    /// ONLY DAO can execute this function.
    /// withdraw delegated tokens from it.
    /// @param _validatorId the validator id on stakeManager.
    function removeNodeOperator(uint256 _validatorId)
        external
        override
        userHasRole(DAO_ROLE)
    {
        address rewardAddress = validatorRewardAddress[_validatorId];
        require(rewardAddress != address(0), "Validator doesn't exist");

        uint256 length = validatorIds.length;
        for (uint256 idx = 0; idx < length - 1; idx++) {
            if (_validatorId == validatorIds[idx]) {
                validatorIds[idx] = validatorIds[validatorIds.length - 1];
                break;
            }
        }

        IStakeManager.Validator memory validator = stakeManager.validators(
            _validatorId
        );
        stMATIC.withdrawTotalDelegated(validator.contractAddress);

        validatorIds.pop();
        delete validatorRewardAddress[_validatorId];

        emit RemoveNodeOperator(_validatorId, rewardAddress);
    }

    /// @notice Set StMatic address.
    /// ONLY DAO can call this function
    /// @param _newStMatic new stMatic address.
    function setStMaticAddress(address _newStMatic)
        external
        override
        userHasRole(DAO_ROLE)
    {
        require(_newStMatic != address(0), "Invalid stMatic address");

        address oldStMATIC = address(stMATIC);
        stMATIC = IStMATIC(_newStMatic);

        emit SetStMaticAddress(oldStMATIC, _newStMatic);
    }

    /// @notice Update the reward address of a Node Operator.
    /// ONLY Operator owner can call this function
    /// @param _validatorId the validator id.
    /// @param _newRewardAddress the new reward address.
    function setRewardAddress(uint256 _validatorId, address _newRewardAddress) external override {
        address oldRewardAddress = validatorRewardAddress[_validatorId];
        require(oldRewardAddress == msg.sender, "Unauthorized");
        require(_newRewardAddress != address(0), "Invalid reward address");

        validatorRewardAddress[_validatorId] = _newRewardAddress;

        emit SetRewardAddress(_validatorId, oldRewardAddress, _newRewardAddress);
    }

    /// @notice List all node operator available in the system.
    /// @return Returns a list of all node operators.
    function listAllNodeOperator()
        external
        view
        override
        returns (NodeOperatorRegistry[] memory)
    {}

    /// @notice List all the ACTIVE operators on the stakeManager.
    /// @return Returns a list of ACTIVE node operator.
    function listActiveNodeOperators() external view override returns (NodeOperatorRegistry[] memory){
        uint256 counter = 0;
        uint256 length = validatorIds.length;
        IStakeManager.Validator memory validator;
        NodeOperatorRegistry[] memory activeNodeOperators = new NodeOperatorRegistry[](length);

        for (uint256 i = 0; i < length; i++) {
            validator = stakeManager.validators(validatorIds[i]);
            if(validator.status == IStakeManager.Status.Active  && validator.deactivationEpoch == 0) {
                activeNodeOperators[counter] = NodeOperatorRegistry(
                    validator.contractAddress, validatorRewardAddress[validatorIds[i]]
                );
                counter++;
            }
        }

        return activeNodeOperators;
    }

    /// @notice List all the operators on the stakeManager that can be withdrawn from this includes ACTIVE, JAILED, and
    /// @notice UNSTAKED operators.
    /// @return Returns a list of ACTIVE, JAILED or UNSTAKED node operator.
    function listWithdrawNodeOperator() external view override returns (NodeOperatorRegistry[] memory){
        uint256 counter = 0;
        uint256 length = validatorIds.length;
        IStakeManager.Validator memory validator;
        NodeOperatorRegistry[] memory activeNodeOperators = new NodeOperatorRegistry[](length);

        for (uint256 i = 0; i < length; i++) {
            validator = stakeManager.validators(validatorIds[i]);
            if( validator.status == IStakeManager.Status.Active  && validator.deactivationEpoch == 0 ||
                validator.status == IStakeManager.Status.Active  && validator.deactivationEpoch != 0 ||
                validator.status == IStakeManager.Status.Locked  && validator.deactivationEpoch == 0
            ) {
                activeNodeOperators[counter] = NodeOperatorRegistry(
                    validator.contractAddress, validatorRewardAddress[validatorIds[i]]
                );
                counter++;
            }
        }

        return activeNodeOperators;
    }

    /// @notice List all the ACTIVE, JAILED and EJECTED operators on the stakeManager.
    /// @return Returns a list of ACTIVE, JAILED and EJECTED node operator.
    function listDelegatedNodeOperator()
        external
        view
        override
        returns (NodeOperatorRegistry[] memory)
    {}

    /// @notice Returns a node operator.
    /// @param _validatorId the validator id on stakeManager.
    /// @return Returns a node operator.
    function getNodeOperator(uint256 _validatorId)
        external
        view
        override
        returns (FullNodeOperatorRegistry memory)
    {}

    /// @notice Returns a node operator.
    /// @param _rewardAddress the reward address.
    /// @return Returns a node operator.
    function getNodeOperator(address _rewardAddress)
        external
        view
        override
        returns (FullNodeOperatorRegistry memory)
    {}

    /// @notice List all the node operator in the system.
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
