// SPDX-FileCopyrightText: 2021 ShardLabs
// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "./interfaces/IValidatorShare.sol";
import "./interfaces/INodeOperatorRegistry.sol";
import "./interfaces/IStMATIC.sol";
import "hardhat/console.sol";

/// @title NodeOperatorRegistry
/// @author 2021 ShardLabs.
/// @notice NodeOperatorRegistry is the main contract that manage validators
/// @dev NodeOperatorRegistry is the main contract that manage operators.
contract NodeOperatorRegistry is
    INodeOperatorRegistry,
    PausableUpgradeable,
    AccessControlUpgradeable
{
    /// @notice stakeManager interface.
    IStakeManager public stakeManager;

    /// @notice stMatic interface.
    IStMATIC public stMATIC;

    /// @notice Minimum delegation distance threshold.
    uint256 public MIN_DELEGATE_DISTANCE_THRESHOLD;

    /// @notice Minimum rebalance distance threshold.
    uint256 public MIN_REBALANCE_DISTANCE_THRESHOLD;

    /// @notice Maximum withdraw percentage per rebalance.
    uint256 public MAX_WITHDRAW_PERCENTAGE_PER_REBALANCE;

    /// @notice all the roles.
    bytes32 public constant DAO_ROLE = keccak256("LIDO_DAO");

    /// @notice Minimum request withdraw distance threshold.
    uint8 public MIN_REQUEST_WITHDRAW_DISTANCE_THRESHOLD;

    /// @notice Minimum request withdraw range.
    uint8 public MIN_REQUEST_WITHDRAW_RANGE;

    /// @notice the default commission rate for operators
    uint8 public DEFAULT_COMMISSION_RATE;

    /// @notice This stores the operators ids.
    uint256[] public validatorIds;

    /// @notice Mapping of all owners with node operator id. Mapping is used to be able to
    /// extend the struct.
    mapping(uint256 => address) public validatorIdToRewardAddress;

    /// @notice Mapping of validator reward address to validator Id. Mapping is used to be able to
    /// extend the struct.
    mapping(address => uint256) public validatorRewardAddressToId;

    /// @notice Check if the msg.sender has permission.
    /// @param _role role needed to call function.
    modifier userHasRole(bytes32 _role) {
        require(hasRole(_role, msg.sender), "Unauthorized");
        _;
    }

    /// @notice Initialize the NodeOperatorRegistry contract.
    function initialize(
        IStakeManager _stakeManager,
        IStMATIC _stMATIC,
        address _dao
    ) external initializer {
        __Pausable_init();
        __AccessControl_init();

        stakeManager = _stakeManager;
        stMATIC = _stMATIC;

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(DAO_ROLE, _dao);
    }

    /// @notice Add a new node operator to the system.
    /// ONLY DAO can execute this function.
    /// @param _validatorId the validator id on stakeManager.
    /// @param _rewardAddress the reward address.
    function addNodeOperator(uint256 _validatorId, address _rewardAddress)
        external
        override
        userHasRole(DAO_ROLE)
    {
        require(_validatorId != 0, "ValidatorId=0");
        require(
            validatorIdToRewardAddress[_validatorId] == address(0),
            "Validator exists"
        );
        require(
            validatorRewardAddressToId[_rewardAddress] == 0,
            "Reward Address already used"
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

        require(
            IValidatorShare(validator.contractAddress).delegation(),
            "Delegation is disabled"
        );

        validatorIdToRewardAddress[_validatorId] = _rewardAddress;
        validatorRewardAddressToId[_rewardAddress] = _validatorId;
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
        address rewardAddress = validatorIdToRewardAddress[_validatorId];
        require(rewardAddress != address(0), "Validator doesn't exist");

        IStakeManager.Validator memory validator = stakeManager.validators(
            _validatorId
        );

        _removeOperator(_validatorId, validator.contractAddress, rewardAddress);

        emit RemoveNodeOperator(_validatorId, rewardAddress);
    }

    /// @notice Remove a node operator from the system if it fails to meet certain conditions
    /// 1. If the commission of the Node Operator is less than the standard commission
    /// 2. If the Node Operator is either Unstaked or Ejected
    function removeInvalidNodeOperator(uint256 validatorId) external override {
        address rewardAddress = validatorIdToRewardAddress[validatorId];
        require(rewardAddress != address(0), "Validator doesn't exist");

        (
            NodeOperatorRegistryStatus operatorStatus,
            IStakeManager.Validator memory validator
        ) = _getOperatorStatusAndValidator(validatorId);

        require(
            operatorStatus == NodeOperatorRegistryStatus.UNSTAKED ||
                operatorStatus == NodeOperatorRegistryStatus.EJECTED ||
                validator.commissionRate != DEFAULT_COMMISSION_RATE,
            "Cannot remove valid operator."
        );

        _removeOperator(validatorId, validator.contractAddress, rewardAddress);

        emit RemoveInvalidNodeOperator(validatorId, rewardAddress);
    }

    function _removeOperator(
        uint256 _validatorId,
        address _contractAddress,
        address _rewardAddress
    ) private {
        uint256 length = validatorIds.length;
        for (uint256 idx = 0; idx < length - 1; idx++) {
            if (_validatorId == validatorIds[idx]) {
                validatorIds[idx] = validatorIds[validatorIds.length - 1];
                break;
            }
        }
        validatorIds.pop();
        stMATIC.withdrawTotalDelegated(_contractAddress);
        delete validatorIdToRewardAddress[_validatorId];
        delete validatorRewardAddressToId[_rewardAddress];
    }

    ///@notice Set default commission rate
    /// ONLY DAO can call this function
    ///@param newCommissionRate new commission rate
    function setCommissionRate(uint8 newCommissionRate)
        external
        override
        userHasRole(DAO_ROLE)
    {
        require(
            newCommissionRate != 0 && newCommissionRate <= 100,
            "Invalid commission rate"
        );

        uint256 oldCommissionRate = DEFAULT_COMMISSION_RATE;
        DEFAULT_COMMISSION_RATE = newCommissionRate;
        emit SetCommissionRate(oldCommissionRate, newCommissionRate);
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
    /// @param _newRewardAddress the new reward address.
    function setRewardAddress(address _newRewardAddress) external override {
        uint256 validatorId = validatorRewardAddressToId[msg.sender];
        address oldRewardAddress = validatorIdToRewardAddress[validatorId];
        require(oldRewardAddress == msg.sender, "Unauthorized");
        require(_newRewardAddress != address(0), "Invalid reward address");

        validatorIdToRewardAddress[validatorId] = _newRewardAddress;

        emit SetRewardAddress(validatorId, oldRewardAddress, _newRewardAddress);
    }

    /// @notice set MIN_REBALANCE_DISTANCE_THRESHOLD
    /// ONLY DAO can call this function
    /// @param _minRebalanceDistanceThreshold the min rebalance threshold to include
    /// a validator in the delegation process.
    function setMinRebalanceDistanceThreshold(
        uint256 _minRebalanceDistanceThreshold
    ) public userHasRole(DAO_ROLE) {
        require(
            _minRebalanceDistanceThreshold >= 100,
            "Invalid minRebalanceDistanceThreshold"
        );
        MIN_REBALANCE_DISTANCE_THRESHOLD = _minRebalanceDistanceThreshold;
    }

    /// @notice set MIN_REQUEST_WITHDRAW_DISTANCE_THRESHOLD
    /// ONLY DAO can call this function
    /// @param _minRequestWithdrawDistanceThreshold the min withdraw distance threshold.
    function setMinRequestWithdrawDistanceThreshold(
        uint8 _minRequestWithdrawDistanceThreshold
    ) public userHasRole(DAO_ROLE) {
        require(
            _minRequestWithdrawDistanceThreshold <= 100,
            "Invalid minRebalanceDistanceThreshold"
        );
        MIN_REQUEST_WITHDRAW_DISTANCE_THRESHOLD = _minRequestWithdrawDistanceThreshold;
    }

    /// @notice set MIN_REQUEST_WITHDRAW_RANGE
    /// ONLY DAO can call this function
    /// @param _minRequestWithdrawRange the min request withdraw range.
    function setMinRequestWithdrawRange(uint8 _minRequestWithdrawRange)
        public
        userHasRole(DAO_ROLE)
    {
        require(
            _minRequestWithdrawRange <= 100,
            "Invalid minRebalanceDistanceThreshold"
        );
        MIN_REQUEST_WITHDRAW_RANGE = _minRequestWithdrawRange;
    }

    /// @notice set MAX_WITHDRAW_PERCENTAGE_PER_REBALANCE
    /// ONLY DAO can call this function
    /// @param _maxWithdrawPercentagePerRebalance the max withdraw percentage to
    /// withdraw from a validator per rebalance.
    function setMaxWithdrawPercentagePerRebalance(
        uint256 _maxWithdrawPercentagePerRebalance
    ) public userHasRole(DAO_ROLE) {
        require(
            _maxWithdrawPercentagePerRebalance <= 100,
            "Invalid minRebalanceDistanceThreshold"
        );
        MAX_WITHDRAW_PERCENTAGE_PER_REBALANCE = _maxWithdrawPercentagePerRebalance;
    }

    /// @notice set MIN_DELEGATE_DISTANCE_THRESHOLD
    /// ONLY DAO can call this function
    /// @param _minDelegateDistanceThreshold the min delegation threshold to include
    /// a validator in the delegation process.
    function setMinDelegateDistanceThreshold(
        uint256 _minDelegateDistanceThreshold
    ) public userHasRole(DAO_ROLE) {
        require(
            _minDelegateDistanceThreshold >= 100,
            "Invalid minDelegateDistanceThreshold"
        );
        MIN_DELEGATE_DISTANCE_THRESHOLD = _minDelegateDistanceThreshold;
    }

    /// @notice List all the ACTIVE operators on the stakeManager.
    /// @return Returns a list of ACTIVE node operator.
    function listDelegatedNodeOperators()
        external
        view
        override
        returns (NodeOperatorRegistry[] memory)
    {
        uint256 counter = 0;
        uint256 length = validatorIds.length;
        IStakeManager.Validator memory validator;
        NodeOperatorRegistry[]
            memory activeNodeOperators = new NodeOperatorRegistry[](length);

        for (uint256 i = 0; i < length; i++) {
            validator = stakeManager.validators(validatorIds[i]);
            if (
                validator.status == IStakeManager.Status.Active &&
                validator.deactivationEpoch == 0
            ) {
                if (!IValidatorShare(validator.contractAddress).delegation())
                    continue;

                activeNodeOperators[counter] = NodeOperatorRegistry(
                    validator.contractAddress,
                    validatorIdToRewardAddress[validatorIds[i]]
                );
                counter++;
            }
        }

        if (counter < length) {
            NodeOperatorRegistry[]
                memory filteredActiveNodeOperators = new NodeOperatorRegistry[](
                    counter
                );
            for (uint256 i = 0; i < counter; i++) {
                filteredActiveNodeOperators[i] = activeNodeOperators[i];
            }
            activeNodeOperators = filteredActiveNodeOperators;
        }

        return activeNodeOperators;
    }

    /// @notice List all the operators on the stakeManager that can be withdrawn from this includes ACTIVE, JAILED, and
    /// @notice UNSTAKED operators.
    /// @return Returns a list of ACTIVE, JAILED or UNSTAKED node operator.
    function listWithdrawNodeOperators()
        external
        view
        override
        returns (NodeOperatorRegistry[] memory)
    {
        uint256 length = validatorIds.length;
        IStakeManager.Validator memory validator;
        NodeOperatorRegistry[]
            memory withdrawNodeOperators = new NodeOperatorRegistry[](length);

        for (uint256 i = 0; i < length; i++) {
            validator = stakeManager.validators(validatorIds[i]);
            withdrawNodeOperators[i] = NodeOperatorRegistry(
                validator.contractAddress,
                validatorIdToRewardAddress[validatorIds[i]]
            );
        }

        return withdrawNodeOperators;
    }

    /// @notice Returns operators delegation infos.
    /// @return nodeOperators all active node operators.
    /// @return activeOperatorCount count onlt active validators.
    /// @return stakePerOperator amount staked in each validator.
    /// @return totalStaked the total amount staked in all validators.
    /// @return distanceThreshold the distance between the min and max amount staked in a validator.
    function _getValidatorsDelegationInfos()
        private
        view
        returns (
            NodeOperatorRegistry[] memory nodeOperators,
            uint256 activeOperatorCount,
            uint256[] memory stakePerOperator,
            uint256 totalStaked,
            uint256 distanceThreshold
        )
    {
        uint256 length = validatorIds.length;
        nodeOperators = new NodeOperatorRegistry[](length);
        stakePerOperator = new uint256[](length);

        uint256 validatorId;
        IStakeManager.Validator memory validator;
        NodeOperatorRegistryStatus status;

        uint256 maxAmount;
        uint256 minAmount;

        for (uint256 i = 0; i < length; i++) {
            validatorId = validatorIds[i];
            (status, validator) = _getOperatorStatusAndValidator(validatorId);
            if (status == NodeOperatorRegistryStatus.INACTIVE) continue;

            require(
                !(status == NodeOperatorRegistryStatus.EJECTED),
                "Could not calculate the stake data, an operator was EJECTED"
            );

            require(
                !(status == NodeOperatorRegistryStatus.UNSTAKED),
                "Could not calculate the stake data, an operator was UNSTAKED"
            );

            // Get the total staked tokens by the StMatic contract in a validatorShare.
            (uint256 amount, ) = IValidatorShare(validator.contractAddress)
                .getTotalStake(address(stMATIC));

            totalStaked += amount;

            if (maxAmount < amount) {
                maxAmount = amount;
            }

            if (minAmount > amount || minAmount == 0) {
                minAmount = amount;
            }

            bool delegation = IValidatorShare(validator.contractAddress)
                .delegation();

            if (status == NodeOperatorRegistryStatus.ACTIVE && delegation) {
                stakePerOperator[activeOperatorCount] = amount;

                nodeOperators[activeOperatorCount] = NodeOperatorRegistry(
                    validator.contractAddress,
                    validatorIdToRewardAddress[validatorIds[i]]
                );

                activeOperatorCount++;
            }
        }

        require(activeOperatorCount > 0, "There are no active validator");

        // The max amount is multiplied by 100 to have a precise value.
        minAmount = minAmount == 0 ? 1 : minAmount;
        distanceThreshold = ((maxAmount * 100) / minAmount);
    }

    /// @notice Calculate the ratios to delegate to each validator.
    /// @param _totalBuffered The total amount buffered in stMatic.
    /// @return nodeOperators all active node operators.
    /// @return totalActiveNodeOperator total active node operators.
    /// @return operatorRatios is a list of operator's ratio.
    /// @return totalRatio the total ratio. If ZERO that means the system is balanced.
    function getValidatorsDelegationAmount(uint256 _totalBuffered)
        external
        view
        override
        returns (
            NodeOperatorRegistry[] memory nodeOperators,
            uint256 totalActiveNodeOperator,
            uint256[] memory operatorRatios,
            uint256 totalRatio
        )
    {
        require(validatorIds.length > 0, "Not enough operators to delegate");
        uint256[] memory stakePerOperator;
        uint256 totalStaked;
        uint256 distanceThreshold;
        (
            nodeOperators,
            totalActiveNodeOperator,
            stakePerOperator,
            totalStaked,
            distanceThreshold
        ) = _getValidatorsDelegationInfos();
        // If the system is balanced
        if (distanceThreshold <= MIN_DELEGATE_DISTANCE_THRESHOLD) {
            return (
                nodeOperators,
                totalActiveNodeOperator,
                operatorRatios,
                totalRatio
            );
        }

        // If the system is not balanced calculate ratios
        operatorRatios = new uint256[](totalActiveNodeOperator);
        uint256 rebalanceTarget = (totalStaked + _totalBuffered) /
            totalActiveNodeOperator;

        uint256 operatorRatioToDelegate;

        for (uint256 idx = 0; idx < totalActiveNodeOperator; idx++) {
            operatorRatioToDelegate = stakePerOperator[idx] >= rebalanceTarget
                ? 0
                : rebalanceTarget - stakePerOperator[idx];

            if (operatorRatioToDelegate != 0 && stakePerOperator[idx] != 0) {
                operatorRatioToDelegate = (rebalanceTarget * 100) /
                    stakePerOperator[idx] >=
                    MIN_DELEGATE_DISTANCE_THRESHOLD
                    ? operatorRatioToDelegate
                    : 0;
            }

            operatorRatios[idx] = operatorRatioToDelegate;
            totalRatio += operatorRatioToDelegate;
        }
    }

    /// @notice Calculate the operator ratios to rebalance the system.
    /// @param _totalBuffered The total amount buffered in stMatic.
    /// @return nodeOperators all active node operators.
    /// @return totalActiveNodeOperator total active node operators.
    /// @return operatorRatios is a list of operator's ratio.
    /// @return totalRatio the total ratio. If ZERO that means the system is balanced.
    /// @return totalToWithdraw the total amount to withdraw.
    function getValidatorsRebalanceAmount(uint256 _totalBuffered)
        external
        view
        override
        returns (
            NodeOperatorRegistry[] memory nodeOperators,
            uint256 totalActiveNodeOperator,
            uint256[] memory operatorRatios,
            uint256 totalRatio,
            uint256 totalToWithdraw
        )
    {
        require(validatorIds.length > 1, "Not enough operator to rebalance");
        uint256[] memory stakePerOperator;
        uint256 totalStaked;
        uint256 distanceThreshold;
        (
            nodeOperators,
            totalActiveNodeOperator,
            stakePerOperator,
            totalStaked,
            distanceThreshold
        ) = _getValidatorsDelegationInfos();

        require(
            distanceThreshold >= MIN_REBALANCE_DISTANCE_THRESHOLD &&
                totalStaked > 0,
            "The system is balanced"
        );

        operatorRatios = new uint256[](totalActiveNodeOperator);
        uint256 rebalanceTarget = totalStaked / totalActiveNodeOperator;
        uint256 operatorRatioToRebalance;

        for (uint256 idx = 0; idx < totalActiveNodeOperator; idx++) {
            operatorRatioToRebalance = stakePerOperator[idx] > rebalanceTarget
                ? stakePerOperator[idx] - rebalanceTarget
                : 0;

            operatorRatioToRebalance = (stakePerOperator[idx] * 100) /
                rebalanceTarget >=
                MIN_REBALANCE_DISTANCE_THRESHOLD
                ? operatorRatioToRebalance
                : 0;

            operatorRatios[idx] = operatorRatioToRebalance;
            totalRatio += operatorRatioToRebalance;
        }
        totalToWithdraw = totalRatio > _totalBuffered
            ? totalRatio - _totalBuffered
            : 0;

        require(totalToWithdraw > 0, "Zero total to withdraw");
        totalToWithdraw =
            (totalToWithdraw * MAX_WITHDRAW_PERCENTAGE_PER_REBALANCE) /
            100;
    }

    /// @notice Returns operators info.
    /// @return activeNodeOperators all active node operators.
    /// @return stakePerOperator amount staked in each validator.
    /// @return totalDelegated the total amount delegated to all validators.
    /// @return minAmount the distance between the min and max amount staked in a validator.
    /// @return maxAmount the distance between the min and max amount staked in a validator.
    function _getValidatorsRequestWithdraw()
        private
        view
        returns (
            NodeOperatorRegistry[] memory activeNodeOperators,
            uint256[] memory stakePerOperator,
            uint256 totalDelegated,
            uint256 minAmount,
            uint256 maxAmount
        )
    {
        uint256 length = validatorIds.length;
        activeNodeOperators = new NodeOperatorRegistry[](length);
        stakePerOperator = new uint256[](length);

        uint256 validatorId;
        IStakeManager.Validator memory validator;
        NodeOperatorRegistryStatus status;

        for (uint256 i = 0; i < length; i++) {
            validatorId = validatorIds[i];
            (status, validator) = _getOperatorStatusAndValidator(validatorId);
            if (status == NodeOperatorRegistryStatus.INACTIVE) continue;

            // Get the total staked tokens by the StMatic contract in a validatorShare.
            (uint256 amount, ) = IValidatorShare(validator.contractAddress)
                .getTotalStake(address(stMATIC));

            stakePerOperator[i] = amount;
            totalDelegated += amount;

            if (maxAmount < amount) {
                maxAmount = amount;
            }

            if ((minAmount > amount && amount != 0) || minAmount == 0) {
                minAmount = amount;
            }

            activeNodeOperators[i] = NodeOperatorRegistry(
                validator.contractAddress,
                validatorIdToRewardAddress[validatorIds[i]]
            );
        }
        minAmount = minAmount == 0 ? 1 : minAmount;
    }

    /// @notice Request withdraw algorithm.
    /// @param _withdrawAmount The amount to withdraw.
    /// @return activeNodeOperators all active node operators.
    /// @return totalDelegated total amount delegated.
    /// @return operatorAmountCanBeRequested amount that can be requested from a spécific validator when the system is not balanced.
    /// @return totalValidatorToWithdrawFrom the number of validator to withdraw from when the system is balanced.
    function getValidatorsRequestWithdraw(uint256 _withdrawAmount)
        external
        view
        override
        returns (
            NodeOperatorRegistry[] memory activeNodeOperators,
            uint256 totalDelegated,
            uint256[] memory operatorAmountCanBeRequested,
            uint256 totalValidatorToWithdrawFrom
        )
    {
        if (validatorIds.length == 0) {
            return (
                activeNodeOperators,
                totalDelegated,
                operatorAmountCanBeRequested,
                totalValidatorToWithdrawFrom
            );
        }
        uint256[] memory stakePerOperator;
        uint256 minAmount;
        uint256 maxAmount;

        (
            activeNodeOperators,
            stakePerOperator,
            totalDelegated,
            minAmount,
            maxAmount
        ) = _getValidatorsRequestWithdraw();

        if (totalDelegated == 0) {
            return (
                activeNodeOperators,
                totalDelegated,
                operatorAmountCanBeRequested,
                totalValidatorToWithdrawFrom
            );
        }

        uint256 length = activeNodeOperators.length;
        operatorAmountCanBeRequested = new uint256[](length);
        uint256 distanceThreshold = 100 - ((minAmount * 100) / maxAmount);

        uint256 withdrawAmountPercentage = (_withdrawAmount * 100) /
            totalDelegated;
        withdrawAmountPercentage = withdrawAmountPercentage == 0
            ? 1
            : withdrawAmountPercentage;

        if (distanceThreshold <= MIN_REQUEST_WITHDRAW_DISTANCE_THRESHOLD) {
            totalValidatorToWithdrawFrom =
                ((withdrawAmountPercentage + MIN_REQUEST_WITHDRAW_RANGE) /
                    (100 / length)) +
                1;
            totalValidatorToWithdrawFrom = totalValidatorToWithdrawFrom > length
                ? length
                : totalValidatorToWithdrawFrom;
        } else {
            uint256 rebalanceTarget = totalDelegated > _withdrawAmount
                ? (totalDelegated - _withdrawAmount) / length
                : 0;

            rebalanceTarget = rebalanceTarget > minAmount
                ? minAmount
                : rebalanceTarget;
            uint256 operatorRatioToRebalance;
            for (uint256 idx = 0; idx < length; idx++) {
                operatorRatioToRebalance = stakePerOperator[idx] != 0 &&
                    stakePerOperator[idx] - rebalanceTarget > 0
                    ? stakePerOperator[idx] - rebalanceTarget
                    : 0;
                operatorAmountCanBeRequested[idx] = operatorRatioToRebalance;
            }
        }
    }

    /// @notice Returns a node operator.
    /// @param _validatorId the validator id on stakeManager.
    /// @return nodeOperator Returns a node operator.
    function getNodeOperator(uint256 _validatorId)
        external
        view
        override
        returns (FullNodeOperatorRegistry memory nodeOperator)
    {
        (
            NodeOperatorRegistryStatus operatorStatus,
            IStakeManager.Validator memory validator
        ) = _getOperatorStatusAndValidator(_validatorId);
        nodeOperator.validatorShare = validator.contractAddress;
        nodeOperator.validatorId = _validatorId;
        nodeOperator.rewardAddress = validatorIdToRewardAddress[_validatorId];
        nodeOperator.status = operatorStatus;
        nodeOperator.commissionRate = validator.commissionRate;
        return nodeOperator;
    }

    /// @notice Returns a node operator.
    /// @param _rewardAddress the reward address.
    /// @return nodeOperator Returns a node operator.
    function getNodeOperator(address _rewardAddress)
        external
        view
        override
        returns (FullNodeOperatorRegistry memory nodeOperator)
    {
        uint256 validatorId = validatorRewardAddressToId[_rewardAddress];
        (
            NodeOperatorRegistryStatus operatorStatus,
            IStakeManager.Validator memory validator
        ) = _getOperatorStatusAndValidator(validatorId);

        nodeOperator.status = operatorStatus;
        nodeOperator.rewardAddress = _rewardAddress;
        nodeOperator.validatorId = validatorId;
        nodeOperator.validatorShare = validator.contractAddress;
        nodeOperator.commissionRate = validator.commissionRate;
        return nodeOperator;
    }

    /// @notice Returns a node operator status.
    /// @param  validatorId is the id of the node operator.
    /// @return operatorStatus Returns a node operator status.
    function getNodeOperatorStatus(uint256 validatorId)
        external
        view
        returns (NodeOperatorRegistryStatus operatorStatus)
    {
        (operatorStatus, ) = _getOperatorStatusAndValidator(validatorId);
    }

    /// @notice Returns a node operator status.
    /// @param  _validatorId is the id of the node operator.
    /// @return operatorStatus is the operator status.
    /// @return validator is the validator info.
    function _getOperatorStatusAndValidator(uint256 _validatorId)
        private
        view
        returns (
            NodeOperatorRegistryStatus operatorStatus,
            IStakeManager.Validator memory validator
        )
    {
        address rewardAddress = validatorIdToRewardAddress[_validatorId];
        require(rewardAddress != address(0), "Operator not found");
        validator = stakeManager.validators(_validatorId);

        if (
            validator.status == IStakeManager.Status.Active &&
            validator.deactivationEpoch == 0
        ) {
            operatorStatus = NodeOperatorRegistryStatus.ACTIVE;
        } else if (
            validator.status == IStakeManager.Status.Locked &&
            validator.deactivationEpoch == 0
        ) {
            operatorStatus = NodeOperatorRegistryStatus.JAILED;
        } else if (
            (validator.status == IStakeManager.Status.Active ||
                validator.status == IStakeManager.Status.Locked) &&
            validator.deactivationEpoch != 0
        ) {
            operatorStatus = NodeOperatorRegistryStatus.EJECTED;
        } else if ((validator.status == IStakeManager.Status.Unstaked)) {
            operatorStatus = NodeOperatorRegistryStatus.UNSTAKED;
        } else {
            operatorStatus = NodeOperatorRegistryStatus.INACTIVE;
        }

        return (operatorStatus, validator);
    }

    /// @notice Return a list of all validator ids in the system.
    function getValidatorIds() external view returns (uint256[] memory) {
        return validatorIds;
    }

    /// @notice List all the node operator in the system.
    /// @return inactiveNodeOperator the number of inactive operators.
    /// @return activeNodeOperator the number of active operators.
    /// @return jailedNodeOperator the number of jailed operators.
    /// @return ejectedNodeOperator the number of ejected operators.
    /// @return unstakedNodeOperator the number of unstaked operators.
    function getStats()
        external
        view
        override
        returns (
            uint256 inactiveNodeOperator,
            uint256 activeNodeOperator,
            uint256 jailedNodeOperator,
            uint256 ejectedNodeOperator,
            uint256 unstakedNodeOperator
        )
    {
        uint256[] memory memValidatorIds = validatorIds;
        uint256 length = memValidatorIds.length;
        for (uint256 idx = 0; idx < length; idx++) {
            (
                NodeOperatorRegistryStatus operatorStatus,

            ) = _getOperatorStatusAndValidator(memValidatorIds[idx]);
            if (operatorStatus == NodeOperatorRegistryStatus.ACTIVE) {
                activeNodeOperator++;
            } else if (operatorStatus == NodeOperatorRegistryStatus.JAILED) {
                jailedNodeOperator++;
            } else if (operatorStatus == NodeOperatorRegistryStatus.EJECTED) {
                ejectedNodeOperator++;
            } else if (operatorStatus == NodeOperatorRegistryStatus.UNSTAKED) {
                unstakedNodeOperator++;
            } else {
                inactiveNodeOperator++;
            }
        }
    }
}
