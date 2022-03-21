// SPDX-FileCopyrightText: 2021 ShardLabs
// SPDX-License-Identifier: GPL-3.0
pragma solidity 0.8.7;

import "@openzeppelin/contracts-upgradeable/token/ERC20/ERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/access/AccessControlUpgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/IERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/token/ERC20/utils/SafeERC20Upgradeable.sol";
import "@openzeppelin/contracts-upgradeable/security/PausableUpgradeable.sol";

import "./interfaces/IValidatorShare.sol";
import "./interfaces/INodeOperatorRegistry.sol";
import "./interfaces/IStakeManager.sol";
import "./interfaces/IPoLidoNFT.sol";
import "./interfaces/IFxStateRootTunnel.sol";
import "./interfaces/IStMATIC.sol";

/// @title StMATIC
/// @author 2021 ShardLabs.
contract StMATIC is
    IStMATIC,
    ERC20Upgradeable,
    AccessControlUpgradeable,
    PausableUpgradeable
{
    using SafeERC20Upgradeable for IERC20Upgradeable;

    INodeOperatorRegistry public override nodeOperatorRegistry;
    FeeDistribution public override entityFees;
    IStakeManager public override stakeManager;
    IPoLidoNFT public override poLidoNFT;
    IFxStateRootTunnel public override fxStateRootTunnel;

    string public override version;
    address public override dao;
    address public override insurance;
    address public override token;
    uint256 public override lastWithdrawnValidatorId;
    uint256 public override totalBuffered;
    uint256 public override delegationLowerBound;
    uint256 public override rewardDistributionLowerBound;
    uint256 public override reservedFunds;
    uint256 public override submitThreshold;

    bool public override submitHandler;

    mapping(uint256 => RequestWithdraw) public override token2WithdrawRequest;

    bytes32 public constant override DAO = keccak256("DAO");

    mapping(uint256 => RequestWithdraw[]) public token2WithdrawRequests;

    
    /// @param _nodeOperatorRegistry - Address of the node operator registry
    /// @param _token - Address of MATIC token on Ethereum Mainnet
    /// @param _dao - Address of the DAO
    /// @param _insurance - Address of the insurance
    /// @param _stakeManager - Address of the stake manager
    /// @param _poLidoNFT - Address of the stMATIC NFT
    /// @param _fxStateRootTunnel - Address of the FxStateRootTunnel
    /// @param _submitThreshold - Submit for submit function
    function initialize(
        address _nodeOperatorRegistry,
        address _token,
        address _dao,
        address _insurance,
        address _stakeManager,
        address _poLidoNFT,
        address _fxStateRootTunnel,
        uint256 _submitThreshold
    ) external override initializer {
        __AccessControl_init();
        __Pausable_init();
        __ERC20_init("Staked MATIC", "stMATIC");

        _setupRole(DEFAULT_ADMIN_ROLE, msg.sender);
        _setupRole(DAO, _dao);

        nodeOperatorRegistry = INodeOperatorRegistry(_nodeOperatorRegistry);
        stakeManager = IStakeManager(_stakeManager);
        poLidoNFT = IPoLidoNFT(_poLidoNFT);
        fxStateRootTunnel = IFxStateRootTunnel(_fxStateRootTunnel);
        dao = _dao;
        token = _token;
        insurance = _insurance;

        entityFees = FeeDistribution(25, 50, 25);
        submitThreshold = _submitThreshold;
        submitHandler = true;
    }

    
    /// @notice Send funds to StMATIC contract and mints StMATIC to msg.sender
    /// @notice Requires that msg.sender has approved _amount of MATIC to this contract
    /// @param _amount - Amount of MATIC sent from msg.sender to this contract
    /// @return Amount of StMATIC shares generated
    function submit(uint256 _amount)
        external
        override
        whenNotPaused
        returns (uint256)
    {
        require(_amount > 0, "Invalid amount");

        if (submitHandler) {
            require(
                _amount + totalBuffered <= submitThreshold,
                "Submit threshold reached"
            );
        }

        IERC20Upgradeable(token).safeTransferFrom(
            msg.sender,
            address(this),
            _amount
        );

        (
            uint256 amountToMint,
            uint256 totalShares,
            uint256 totalPooledMatic
        ) = convertMaticToStMatic(_amount);

        _mint(msg.sender, amountToMint);

        totalBuffered += _amount;

        fxStateRootTunnel.sendMessageToChild(
            abi.encode(totalShares + amountToMint, totalPooledMatic + _amount)
        );

        emit SubmitEvent(msg.sender, _amount);

        return amountToMint;
    }

    
    /// @notice Stores users request to withdraw into a RequestWithdraw struct
    /// @param _amount - Amount of StMATIC that is requested to withdraw
    function requestWithdraw(uint256 _amount) external override whenNotPaused {
        uint256 totalBalance = balanceOf(msg.sender);
        require(_amount > 0 && totalBalance >= _amount, "Invalid amount");

        (
            INodeOperatorRegistry.NodeOperatorRegistry[]
                memory activeNodeOperators,
            uint256 totalDelegated,
            uint256 bigNodeOperatorLength,
            uint256[] memory bigNodeOperatorIds,
            uint256 smallNodeOperatorLength,
            uint256[] memory smallNodeOperatorIds,
            uint256[] memory operatorAmountCanBeRequested,
            uint256 totalValidatorToWithdrawFrom
        ) = nodeOperatorRegistry.getValidatorsRequestWithdraw(_amount);

        uint256 totalPooledMatic = _getTotalPooledMatic(totalDelegated);
        uint256 totalAmount2WithdrawInMatic = _convertStMaticToMatic(
            _amount,
            totalPooledMatic
        );
        uint256 currentAmount2WithdrawInMatic = totalAmount2WithdrawInMatic;
        uint256 tokenId = poLidoNFT.mint(msg.sender);

        if (totalDelegated != 0) {
            if (totalValidatorToWithdrawFrom != 0) {
                currentAmount2WithdrawInMatic = _requestWithdrawBalanced(
                    tokenId,
                    activeNodeOperators,
                    totalAmount2WithdrawInMatic,
                    totalValidatorToWithdrawFrom,
                    totalDelegated,
                    currentAmount2WithdrawInMatic
                );
            } else {
                // request withdraw from big delegated validators
                currentAmount2WithdrawInMatic = _requestWithdrawUnbalanced(
                    tokenId,
                    activeNodeOperators,
                    bigNodeOperatorLength,
                    bigNodeOperatorIds,
                    operatorAmountCanBeRequested,
                    currentAmount2WithdrawInMatic
                );

                // request withdraw from small delegated validators
                if (currentAmount2WithdrawInMatic != 0) {
                    currentAmount2WithdrawInMatic = _requestWithdrawUnbalanced(
                        tokenId,
                        activeNodeOperators,
                        smallNodeOperatorLength,
                        smallNodeOperatorIds,
                        operatorAmountCanBeRequested,
                        currentAmount2WithdrawInMatic
                    );
                }
            }
        }

        if (_amount > totalDelegated) {
            token2WithdrawRequests[tokenId].push(
                RequestWithdraw(
                    currentAmount2WithdrawInMatic,
                    0,
                    stakeManager.epoch() + stakeManager.withdrawalDelay(),
                    address(0)
                )
            );
            reservedFunds += currentAmount2WithdrawInMatic;
            currentAmount2WithdrawInMatic = 0;
        }

        _burn(msg.sender, _amount);

        fxStateRootTunnel.sendMessageToChild(
            abi.encode(totalBalance - _amount, totalPooledMatic)
        );

        emit RequestWithdrawEvent(msg.sender, _amount);
    }

    /// @notice Request withdraw when system is balanced
    function _requestWithdrawBalanced(
        uint256 tokenId,
        INodeOperatorRegistry.NodeOperatorRegistry[] memory activeNodeOperators,
        uint256 totalAmount2WithdrawInMatic,
        uint256 totalValidatorToWithdrawFrom,
        uint256 totalDelegated,
        uint256 currentAmount2WithdrawInMatic
    ) private returns (uint256) {
        uint256 totalAmount = totalDelegated > totalAmount2WithdrawInMatic
            ? totalAmount2WithdrawInMatic
            : totalDelegated;
        uint256 amount2WithdrawFromValidator = totalAmount /
            totalValidatorToWithdrawFrom;

        for (uint256 idx = 0; idx < totalValidatorToWithdrawFrom; idx++) {
            address validatorShare = activeNodeOperators[idx].validatorShare;

            sellVoucher_new(
                validatorShare,
                amount2WithdrawFromValidator,
                type(uint256).max
            );

            currentAmount2WithdrawInMatic -= amount2WithdrawFromValidator;

            token2WithdrawRequests[tokenId].push(
                RequestWithdraw(
                    0,
                    IValidatorShare(validatorShare).unbondNonces(address(this)),
                    stakeManager.epoch() + stakeManager.withdrawalDelay(),
                    validatorShare
                )
            );
        }
        return currentAmount2WithdrawInMatic;
    }

    /// @notice Request withdraw when system is unbalanced
    function _requestWithdrawUnbalanced(
        uint256 tokenId,
        INodeOperatorRegistry.NodeOperatorRegistry[] memory activeNodeOperators,
        uint256 nodeOperatorLength,
        uint256[] memory nodeOperatorIds,
        uint256[] memory operatorAmountCanBeRequested,
        uint256 currentAmount2WithdrawInMatic
    ) private returns (uint256) {
        for (uint256 idx = 0; idx < nodeOperatorLength; idx++) {
            uint256 id = nodeOperatorIds[idx];
            uint256 amountCanBeRequested = operatorAmountCanBeRequested[id];
            if (amountCanBeRequested == 0) continue;

            uint256 amount2WithdrawFromValidator = amountCanBeRequested >
                currentAmount2WithdrawInMatic
                ? currentAmount2WithdrawInMatic
                : operatorAmountCanBeRequested[id];

            address validatorShare = activeNodeOperators[id].validatorShare;

            sellVoucher_new(
                validatorShare,
                amount2WithdrawFromValidator,
                type(uint256).max
            );

            token2WithdrawRequests[tokenId].push(
                RequestWithdraw(
                    0,
                    IValidatorShare(validatorShare).unbondNonces(address(this)),
                    stakeManager.epoch() + stakeManager.withdrawalDelay(),
                    validatorShare
                )
            );

            currentAmount2WithdrawInMatic -= amount2WithdrawFromValidator;
            if (currentAmount2WithdrawInMatic == 0) break;
        }
        return currentAmount2WithdrawInMatic;
    }

    /// @notice This will be included in the cron job
    /// @notice Delegates tokens to validator share contract
    function delegate() external override whenNotPaused {
        require(
            totalBuffered > delegationLowerBound + reservedFunds,
            "Amount to delegate lower than minimum"
        );

        (
            INodeOperatorRegistry.NodeOperatorRegistry[]
                memory activeNodeOperators,
            uint256 totalActiveNodeOperator,
            uint256[] memory operatorRatios,
            uint256 totalRatio
        ) = nodeOperatorRegistry.getValidatorsDelegationAmount(totalBuffered);

        uint256 remainder;
        uint256 amountDelegated;
        uint256 amountToDelegate = totalBuffered - reservedFunds;

        IERC20Upgradeable(token).safeApprove(address(stakeManager), 0);
        IERC20Upgradeable(token).safeApprove(
            address(stakeManager),
            amountToDelegate
        );

        for (uint256 i = 0; i < totalActiveNodeOperator; i++) {
            uint256 amountToDelegatePerOperator;

            // If the total Ratio is equal to ZERO that means the systemis balanced so we
            // distribute the buffered tokens equally between the validators
            if (totalRatio == 0) {
                amountToDelegatePerOperator =
                    amountToDelegate /
                    totalActiveNodeOperator;
            } else {
                if (operatorRatios[i] == 0) continue;
                amountToDelegatePerOperator =
                    (operatorRatios[i] * amountToDelegate) /
                    totalRatio;
            }

            buyVoucher(
                activeNodeOperators[i].validatorShare,
                amountToDelegatePerOperator,
                0
            );

            amountDelegated += amountToDelegatePerOperator;
        }

        remainder = amountToDelegate - amountDelegated;
        totalBuffered = remainder + reservedFunds;

        emit DelegateEvent(amountDelegated, remainder);
    }

    /// @notice Claims tokens from validator share and sends them to the
    /// user if his request is in the userToWithdrawRequest
    /// @param _tokenId - Id of the token that wants to be claimed
    function claimTokens(uint256 _tokenId) external override whenNotPaused {
        require(poLidoNFT.isApprovedOrOwner(msg.sender, _tokenId), "Not owner");

        if (token2WithdrawRequest[_tokenId].requestEpoch != 0) {
            _claimTokensV1(_tokenId);
        } else if (token2WithdrawRequests[_tokenId].length != 0) {
            _claimTokensV2(_tokenId);
        } else {
            revert("Invalid claim token");
        }
    }

    /// @notice Claims tokens v2
    function _claimTokensV2(uint256 _tokenId) private {
        RequestWithdraw[] memory usersRequest = token2WithdrawRequests[
            _tokenId
        ];
        require(
            stakeManager.epoch() >= usersRequest[0].requestEpoch,
            "Not able to claim yet"
        );

        poLidoNFT.burn(_tokenId);
        uint256 length = usersRequest.length;
        uint256 amountToClaim;

        uint256 balanceBeforeClaim = IERC20Upgradeable(token).balanceOf(
            address(this)
        );

        for (uint256 idx = 0; idx < length; idx++) {
            if (usersRequest[idx].validatorAddress != address(0)) {
                unstakeClaimTokens_new(
                    usersRequest[idx].validatorAddress,
                    usersRequest[idx].validatorNonce
                );
            } else {
                uint256 _amountToClaim = usersRequest[idx].amount2WithdrawFromStMATIC;
                reservedFunds -= _amountToClaim;
                totalBuffered -= _amountToClaim;
                amountToClaim += _amountToClaim;
            }
        }

        amountToClaim +=
            IERC20Upgradeable(token).balanceOf(address(this)) -
            balanceBeforeClaim;

        IERC20Upgradeable(token).safeTransfer(msg.sender, amountToClaim);

        emit ClaimTokensEvent(msg.sender, _tokenId, amountToClaim, 0);
    }

    /// @notice Claims tokens v1
    function _claimTokensV1(uint256 _tokenId) private {
        RequestWithdraw storage usersRequest = token2WithdrawRequest[_tokenId];

        require(
            stakeManager.epoch() >= usersRequest.requestEpoch,
            "Not able to claim yet"
        );

        poLidoNFT.burn(_tokenId);

        uint256 amountToClaim;

        if (usersRequest.validatorAddress != address(0)) {
            uint256 balanceBeforeClaim = IERC20Upgradeable(token).balanceOf(
                address(this)
            );

            unstakeClaimTokens_new(
                usersRequest.validatorAddress,
                usersRequest.validatorNonce
            );

            amountToClaim =
                IERC20Upgradeable(token).balanceOf(address(this)) -
                balanceBeforeClaim;
        } else {
            amountToClaim = usersRequest.amount2WithdrawFromStMATIC;

            reservedFunds -= amountToClaim;
            totalBuffered -= amountToClaim;
        }

        IERC20Upgradeable(token).safeTransfer(msg.sender, amountToClaim);

        emit ClaimTokensEvent(msg.sender, _tokenId, amountToClaim, 0);
    }

    /// @notice Distributes rewards claimed from validator shares based on fees defined
    /// in entityFee.
    function distributeRewards() external override whenNotPaused {
        (
            INodeOperatorRegistry.NodeOperatorRegistry[] memory operatorInfos,
            uint256 totalActiveOperatorInfos
        ) = nodeOperatorRegistry.listDelegatedNodeOperators();

        for (uint256 i = 0; i < totalActiveOperatorInfos; i++) {
            IValidatorShare validatorShare = IValidatorShare(
                operatorInfos[i].validatorShare
            );
            uint256 stMaticReward = validatorShare.getLiquidRewards(
                address(this)
            );
            uint256 rewardThreshold = validatorShare.minAmount();
            if (stMaticReward > rewardThreshold) {
                validatorShare.withdrawRewards();
            }
        }

        uint256 totalRewards = (
            (IERC20Upgradeable(token).balanceOf(address(this)) - totalBuffered)
        ) / 10;

        require(
            totalRewards > rewardDistributionLowerBound,
            "Amount to distribute lower than minimum"
        );

        uint256 balanceBeforeDistribution = IERC20Upgradeable(token).balanceOf(
            address(this)
        );

        uint256 daoRewards = (totalRewards * entityFees.dao) / 100;
        uint256 insuranceRewards = (totalRewards * entityFees.insurance) / 100;
        uint256 operatorsRewards = (totalRewards * entityFees.operators) / 100;
        uint256 operatorReward = operatorsRewards / totalActiveOperatorInfos;

        IERC20Upgradeable(token).safeTransfer(dao, daoRewards);
        IERC20Upgradeable(token).safeTransfer(insurance, insuranceRewards);

        for (uint256 i = 0; i < totalActiveOperatorInfos; i++) {
            IERC20Upgradeable(token).safeTransfer(
                operatorInfos[i].rewardAddress,
                operatorReward
            );
        }

        uint256 currentBalance = IERC20Upgradeable(token).balanceOf(
            address(this)
        );

        uint256 totalDistributed = balanceBeforeDistribution - currentBalance;

        // Add the remainder to totalBuffered
        totalBuffered = currentBalance;

        emit DistributeRewardsEvent(totalDistributed);
    }

    
    /// @notice Only NodeOperatorRegistry can call this function
    /// @notice Withdraws funds from unstaked validator
    /// @param _validatorShare - Address of the validator share that will be withdrawn
    function withdrawTotalDelegated(address _validatorShare) external override {
        require(
            msg.sender == address(nodeOperatorRegistry),
            "Not a node operator"
        );

        (uint256 stakedAmount, ) = getTotalStake(
            IValidatorShare(_validatorShare)
        );

        if (stakedAmount == 0) {
            return;
        }

        _createWithdrawRequest(_validatorShare, stakedAmount);
        emit WithdrawTotalDelegatedEvent(_validatorShare, stakedAmount);
    }
    
    /// @notice Rebalane the system by request withdraw from the validators that contains
    /// more token delegated to them. 
    function rebalanceDelegatedTokens() external override {
        uint256 amountToReDelegate = totalBuffered -
            reservedFunds +
            _calculatePendingBufferedTokens();
        (
            INodeOperatorRegistry.NodeOperatorRegistry[] memory nodeOperators,
            uint256 totalActiveNodeOperator,
            uint256[] memory operatorRatios,
            uint256 totalRatio,
            uint256 totalToWithdraw
        ) = nodeOperatorRegistry.getValidatorsRebalanceAmount(
                amountToReDelegate
            );

        uint256 amountToWithdraw;
        for (uint256 i = 0; i < totalActiveNodeOperator; i++) {
            if (operatorRatios[i] == 0) continue;

            amountToWithdraw =
                (operatorRatios[i] * totalToWithdraw) /
                totalRatio;
            _createWithdrawRequest(
                nodeOperators[i].validatorShare,
                amountToWithdraw
            );
        }
    }

    function _createWithdrawRequest(address _validatorShare, uint256 amount)
        private
    {
        uint256 tokenId = poLidoNFT.mint(address(this));
        sellVoucher_new(_validatorShare, amount, type(uint256).max);

        token2WithdrawRequest[tokenId] = RequestWithdraw(
            0,
            IValidatorShare(_validatorShare).unbondNonces(address(this)),
            stakeManager.epoch() + stakeManager.withdrawalDelay(),
            _validatorShare
        );

        fxStateRootTunnel.sendMessageToChild(
            abi.encode(totalSupply(), getTotalPooledMatic())
        );
    }

    function _calculatePendingBufferedTokens()
        private
        view
        returns (uint256 pendingBufferedTokens)
    {
        uint256[] memory pendingWithdrawalIds = poLidoNFT.getOwnedTokens(
            address(this)
        );
        uint256 pendingWithdrawalIdsLength = pendingWithdrawalIds.length;

        for (uint256 i = 0; i < pendingWithdrawalIdsLength; i++) {
            pendingBufferedTokens += _getMaticFromTokenId(
                pendingWithdrawalIds[i]
            );
        }
        return pendingBufferedTokens;
    }

    
    /// @notice Claims tokens from validator share and sends them to the
    /// StMATIC contract
    /// @param _tokenId - Id of the token that is supposed to be claimed
    function claimTokensFromValidatorToContract(uint256 _tokenId)
        external
        override
        whenNotPaused
    {
        RequestWithdraw storage lidoRequests = token2WithdrawRequest[_tokenId];

        require(
            poLidoNFT.ownerOf(_tokenId) == address(this),
            "Not owner of the NFT"
        );

        poLidoNFT.burn(_tokenId);

        require(
            stakeManager.epoch() >= lidoRequests.requestEpoch,
            "Not able to claim yet"
        );

        uint256 balanceBeforeClaim = IERC20Upgradeable(token).balanceOf(
            address(this)
        );

        unstakeClaimTokens_new(
            lidoRequests.validatorAddress,
            lidoRequests.validatorNonce
        );

        uint256 claimedAmount = IERC20Upgradeable(token).balanceOf(
            address(this)
        ) - balanceBeforeClaim;

        totalBuffered += claimedAmount;

        fxStateRootTunnel.sendMessageToChild(
            abi.encode(totalSupply(), getTotalPooledMatic())
        );

        emit ClaimTokensEvent(address(this), _tokenId, claimedAmount, 0);
    }

    
    /// @notice Flips the pause state
    function togglePause() external override onlyRole(DEFAULT_ADMIN_ROLE) {
        paused() ? _unpause() : _pause();
    }

    ////////////////////////////////////////////////////////////
    /////                                                    ///
    /////             ***ValidatorShare API***               ///
    /////                                                    ///
    ////////////////////////////////////////////////////////////

    
    /// @notice API for delegated buying vouchers from validatorShare
    /// @param _validatorShare - Address of validatorShare contract
    /// @param _amount - Amount of MATIC to use for buying vouchers
    /// @param _minSharesToMint - Minimum of shares that is bought with _amount of MATIC
    /// @return Actual amount of MATIC used to buy voucher, might differ from _amount because of _minSharesToMint
    function buyVoucher(
        address _validatorShare,
        uint256 _amount,
        uint256 _minSharesToMint
    ) private returns (uint256) {
        uint256 amountSpent = IValidatorShare(_validatorShare).buyVoucher(
            _amount,
            _minSharesToMint
        );

        return amountSpent;
    }

    
    /// @notice API for delegated restaking rewards to validatorShare
    /// @param _validatorShare - Address of validatorShare contract
    function restake(address _validatorShare) private {
        IValidatorShare(_validatorShare).restake();
    }

    
    /// @notice API for delegated unstaking and claiming tokens from validatorShare
    /// @param _validatorShare - Address of validatorShare contract
    /// @param _unbondNonce - Unbond nonce
    function unstakeClaimTokens_new(
        address _validatorShare,
        uint256 _unbondNonce
    ) private {
        IValidatorShare(_validatorShare).unstakeClaimTokens_new(_unbondNonce);
    }

    
    /// @notice API for delegated selling vouchers from validatorShare
    /// @param _validatorShare - Address of validatorShare contract
    /// @param _claimAmount - Amount of MATIC to claim
    /// @param _maximumSharesToBurn - Maximum amount of shares to burn
    function sellVoucher_new(
        address _validatorShare,
        uint256 _claimAmount,
        uint256 _maximumSharesToBurn
    ) private {
        IValidatorShare(_validatorShare).sellVoucher_new(
            _claimAmount,
            _maximumSharesToBurn
        );
    }

    
    /// @notice API for getting total stake of this contract from validatorShare
    /// @param _validatorShare - Address of validatorShare contract
    /// @return Total stake of this contract and MATIC -> share exchange rate
    function getTotalStake(IValidatorShare _validatorShare)
        public
        view
        override
        returns (uint256, uint256)
    {
        return _validatorShare.getTotalStake(address(this));
    }

    
    /// @notice API for liquid rewards of this contract from validatorShare
    /// @param _validatorShare - Address of validatorShare contract
    /// @return Liquid rewards of this contract
    function getLiquidRewards(IValidatorShare _validatorShare)
        external
        view
        override
        returns (uint256)
    {
        return _validatorShare.getLiquidRewards(address(this));
    }

    ////////////////////////////////////////////////////////////
    /////                                                    ///
    /////            ***Helpers & Utilities***               ///
    /////                                                    ///
    ////////////////////////////////////////////////////////////

    
    /// @notice Helper function for that returns total pooled MATIC
    /// @return Total pooled MATIC
    function getTotalStakeAcrossAllValidators()
        public
        view
        override
        returns (uint256)
    {
        uint256 totalStake;
        (
            INodeOperatorRegistry.NodeOperatorRegistry[] memory nodeOperators,
            uint256 operatorsLength
        ) = nodeOperatorRegistry.listWithdrawNodeOperators();

        for (uint256 i = 0; i < operatorsLength; i++) {
            (uint256 currValidatorShare, ) = getTotalStake(
                IValidatorShare(nodeOperators[i].validatorShare)
            );

            totalStake += currValidatorShare;
        }

        return totalStake;
    }

    
    /// @notice Function that calculates total pooled Matic
    /// @return Total pooled Matic
    function getTotalPooledMatic() public view override returns (uint256) {
        uint256 totalStaked = getTotalStakeAcrossAllValidators();
        return totalStaked + totalBuffered - reservedFunds;
    }

    function _getTotalPooledMatic(uint256 _totalStaked)
        public
        view
        returns (uint256)
    {
        return _totalStaked + totalBuffered - reservedFunds;
    }

    
    /// @notice Function that converts arbitrary stMATIC to Matic
    /// @param _amountInStMatic - Amount of stMATIC to convert to Matic
    /// @return amountInMatic - Amount of Matic after conversion,
    /// @return totalStMaticAmount - Total StMatic in the contract,
    /// @return totalPooledMatic - Total Matic in the staking pool
    function convertStMaticToMatic(uint256 _amountInStMatic)
        public
        view
        override
        returns (
            uint256 amountInMatic,
            uint256 totalStMaticAmount,
            uint256 totalPooledMatic
        )
    {
        totalStMaticAmount = totalSupply();
        uint256 totalPooledMATIC = getTotalPooledMatic();
        return (
            _convertStMaticToMatic(_amountInStMatic, totalPooledMATIC),
            totalStMaticAmount,
            totalPooledMATIC
        );
    }

    
    /// @notice Function that converts arbitrary amount of stMatic to Matic
    /// @param _stMaticAmount - amount of stMatic to convert to Matic
    /// @return amountInMatic, totalStMaticAmount and totalPooledMatic
    function _convertStMaticToMatic(
        uint256 _stMaticAmount,
        uint256 _totalPooledMatic
    ) private view returns (uint256) {
        uint256 totalStMaticAmount = totalSupply();
        totalStMaticAmount = totalStMaticAmount == 0 ? 1 : totalStMaticAmount;
        _totalPooledMatic = _totalPooledMatic == 0 ? 1 : _totalPooledMatic;
        uint256 amountInMatic = (_stMaticAmount * _totalPooledMatic) /
            totalStMaticAmount;
        return amountInMatic;
    }

    
    /// @notice Function that converts arbitrary Matic to stMATIC
    /// @param _amountInMatic - Amount of Matic to convert to stMatic
    /// @return amountInStMatic - Amount of Matic to converted to stMatic
    /// @return totalStMaticAmount - Total amount of StMatic in the contract
    /// @return totalPooledMatic - Total amount of Matic in the staking pool
    function convertMaticToStMatic(uint256 _amountInMatic)
        public
        view
        override
        returns (
            uint256 amountInStMatic,
            uint256 totalStMaticAmount,
            uint256 totalPooledMatic
        )
    {
        totalStMaticAmount = totalSupply();
        totalPooledMatic = getTotalPooledMatic();
        return (
            _convertMaticToStMatic(_amountInMatic, totalPooledMatic),
            totalStMaticAmount,
            totalPooledMatic
        );
    }

    function getToken2WithdrawRequests(uint256 _tokenId)
        external
        view
        returns (RequestWithdraw[] memory)
    {
        return token2WithdrawRequests[_tokenId];
    }

    
    /// @notice Function that converts arbitrary amount of Matic to stMatic
    /// @param _maticAmount - Amount in Matic to convert to stMatic
    /// @return amountInStMatic , totalStMaticAmount and totalPooledMatic
    function _convertMaticToStMatic(
        uint256 _maticAmount,
        uint256 _totalPooledMatic
    ) private view returns (uint256) {
        uint256 totalStMaticAmount = totalSupply();
        totalStMaticAmount = totalStMaticAmount == 0 ? 1 : totalStMaticAmount;
        _totalPooledMatic = _totalPooledMatic == 0 ? 1 : _totalPooledMatic;
        uint256 amountInStMatic = (_maticAmount * totalStMaticAmount) /
            _totalPooledMatic;
        return amountInStMatic;
    }

    ////////////////////////////////////////////////////////////
    /////                                                    ///
    /////                 ***Setters***                      ///
    /////                                                    ///
    ////////////////////////////////////////////////////////////

    
    /// @notice Function that sets entity fees
    /// @notice Callable only by dao
    /// @param _daoFee - DAO fee in %
    /// @param _operatorsFee - Operator fees in %
    /// @param _insuranceFee - Insurance fee in %
    function setFees(
        uint8 _daoFee,
        uint8 _operatorsFee,
        uint8 _insuranceFee
    ) external override onlyRole(DAO) {
        require(
            _daoFee + _operatorsFee + _insuranceFee == 100,
            "sum(fee)!=100"
        );
        entityFees.dao = _daoFee;
        entityFees.operators = _operatorsFee;
        entityFees.insurance = _insuranceFee;
    }

    
    /// @notice Function that sets new dao address
    /// @notice Callable only by dao
    /// @param _address - New dao address
    function setDaoAddress(address _address) external override onlyRole(DAO) {
        revokeRole(DAO, dao);
        dao = _address;
        _setupRole(DAO, dao);
    }

    
    /// @notice Function that sets new insurance address
    /// @notice Callable only by dao
    /// @param _address - New insurance address
    function setInsuranceAddress(address _address)
        external
        override
        onlyRole(DAO)
    {
        insurance = _address;
        emit SetInsuranceAddress(_address);
    }

    
    /// @notice Function that sets new node operator address
    /// @notice Only callable by dao
    /// @param _address - New node operator address
    function setNodeOperatorRegistryAddress(address _address)
        external
        override
        onlyRole(DAO)
    {
        nodeOperatorRegistry = INodeOperatorRegistry(_address);
        emit SetNodeOperatorRegistryAddress(_address);
    }

    
    /// @notice Function that sets new lower bound for delegation
    /// @notice Only callable by dao
    /// @param _delegationLowerBound - New lower bound for delegation
    function setDelegationLowerBound(uint256 _delegationLowerBound)
        external
        override
        onlyRole(DAO)
    {
        delegationLowerBound = _delegationLowerBound;
        emit SetDelegationLowerBound(_delegationLowerBound);
    }

    
    /// @notice Function that sets new lower bound for rewards distribution
    /// @notice Only callable by dao
    /// @param _rewardDistributionLowerBound - New lower bound for rewards distribution
    function setRewardDistributionLowerBound(
        uint256 _rewardDistributionLowerBound
    ) external override onlyRole(DAO) {
        rewardDistributionLowerBound = _rewardDistributionLowerBound;
    }

    
    /// @notice Function that sets the poLidoNFT address
    /// @param _poLidoNFT new poLidoNFT address
    function setPoLidoNFT(address _poLidoNFT) external override onlyRole(DAO) {
        poLidoNFT = IPoLidoNFT(_poLidoNFT);
    }

    
    /// @notice Function that sets the fxStateRootTunnel address
    /// @param _fxStateRootTunnel address of fxStateRootTunnel
    function setFxStateRootTunnel(address _fxStateRootTunnel)
        external
        override
        onlyRole(DAO)
    {
        fxStateRootTunnel = IFxStateRootTunnel(_fxStateRootTunnel);
    }

    
    /// @notice Function that sets the submitThreshold
    /// @param _submitThreshold new value for submit threshold
    function setSubmitThreshold(uint256 _submitThreshold)
        external
        override
        onlyRole(DAO)
    {
        submitThreshold = _submitThreshold;
    }

    
    /// @notice Function that sets the submitHandler value to its NOT value
    function flipSubmitHandler() external override onlyRole(DAO) {
        submitHandler = !submitHandler;
    }

    
    /// @notice Function that sets the new version
    /// @param _version - New version that will be set
    function setVersion(string calldata _version)
        external
        override
        onlyRole(DEFAULT_ADMIN_ROLE)
    {
        version = _version;
    }

    
    /// @notice Function that retrieves the amount of matic that will be claimed from the NFT token
    /// @param _tokenId - Id of the PolidoNFT
    function getMaticFromTokenId(uint256 _tokenId)
        external
        view
        override
        returns (uint256)
    {
        return _getMaticFromTokenId(_tokenId);
    }

    function _getMaticFromTokenId(uint256 _tokenId)
        private
        view
        returns (uint256)
    {
        RequestWithdraw memory requestData = token2WithdrawRequest[_tokenId];
        IValidatorShare validatorShare = IValidatorShare(
            requestData.validatorAddress
        );
        uint256 validatorId = validatorShare.validatorId();
        uint256 exchangeRatePrecision = validatorId < 8 ? 100 : 10**29;
        uint256 withdrawExchangeRate = validatorShare.withdrawExchangeRate();
        IValidatorShare.DelegatorUnbond memory unbond = validatorShare
            .unbonds_new(address(this), requestData.validatorNonce);

        return (withdrawExchangeRate * unbond.shares) / exchangeRatePrecision;
    }
}
