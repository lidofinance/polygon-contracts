import hardhat, { ethers, upgrades } from "hardhat";
import { Signer, Contract, BigNumber } from "ethers";
import { expect } from "chai";
import { } from "hardhat/types";
import {
    NodeOperatorRegistry__factory,
    NodeOperatorRegistry,
    StakeManagerMock,
    StMATICMock,
    StakeManagerMock__factory,
    StMATICMock__factory,
    ValidatorShareMock,
    Polygon__factory,
    Polygon
} from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

let accounts: SignerWithAddress[];
let signer: SignerWithAddress;
let user1: SignerWithAddress;
let user2: SignerWithAddress;
let user3: SignerWithAddress;
let user4: SignerWithAddress;

let nodeOperatorRegistry: NodeOperatorRegistry;
let stMATICMock: StMATICMock;
let stakeManagerMock: StakeManagerMock;
let erc20Mock: Polygon;

describe("NodeOperator", function () {
    beforeEach(async function () {
        accounts = await ethers.getSigners();
        signer = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        user3 = accounts[3];
        user4 = accounts[4];

        // deploy erc20 token mock
        const polygonMock = (await ethers.getContractFactory(
            "Polygon"
        )) as Polygon__factory;
        erc20Mock = await polygonMock.deploy();

        // deploy stake manager mock
        const StakeManagerMock = (await ethers.getContractFactory(
            "StakeManagerMock"
        )) as StakeManagerMock__factory;
        stakeManagerMock = await StakeManagerMock.deploy(
            erc20Mock.address,
            ethers.constants.AddressZero // delete later when clean the StakeManagerMocK
        );
        await stakeManagerMock.deployed();

        // deploy stMATIC mock contract
        const StMATICMock = (await ethers.getContractFactory(
            "StMATICMock"
        )) as StMATICMock__factory;
        stMATICMock = await StMATICMock.deploy();
        await stMATICMock.deployed();

        // deploy node operator contract
        const NodeOperatorRegistry = (await ethers.getContractFactory(
            "NodeOperatorRegistry"
        )) as NodeOperatorRegistry__factory;
        nodeOperatorRegistry = (await upgrades.deployProxy(
            NodeOperatorRegistry, [
            stakeManagerMock.address,
            stMATICMock.address,
            100
        ]
        )) as NodeOperatorRegistry;
        await nodeOperatorRegistry.deployed();
        await erc20Mock.connect(signer).mint(toEth("1000000"))

        await stMATICMock.setOperator(nodeOperatorRegistry.address);
    });

    describe("Node Operator", async function () {
        it("Should add a new operator", async function () {
            await stakeOperator(user1)

            const validatorId = await stakeManagerMock.getValidatorId(user1.address)
            expect(await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address))
                .emit(nodeOperatorRegistry, "AddNodeOperator").withArgs(1, user1.address)

            expect((await nodeOperatorRegistry.validatorIds(0))).eq(1)
            expect((await nodeOperatorRegistry.validatorIdToRewardAddress(1))).eq(user1.address)
        });

        it("should return all active operators", async function () {
            await stakeOperator(user1);
            await stakeOperator(user2);
            await stakeOperator(user3);

            const validatorId1 = await stakeManagerMock.getValidatorId(user1.address);
            const validatorId2 = await stakeManagerMock.getValidatorId(user2.address);
            const validatorId3 = await stakeManagerMock.getValidatorId(user3.address);

            await nodeOperatorRegistry.addNodeOperator(validatorId1, user1.address);
            await nodeOperatorRegistry.addNodeOperator(validatorId2, user2.address);
            await nodeOperatorRegistry.addNodeOperator(validatorId3, user3.address);

            const expectedRewardAddress = [user1.address, user2.address, user3.address];
            const allActiveOperators = await nodeOperatorRegistry.listDelegatedNodeOperators();

            expect(allActiveOperators.length).to.equal(3);
            allActiveOperators.forEach((activeOperator, index) => {
                expect(activeOperator.rewardAddress).to.equal(expectedRewardAddress[index]);
            })
        });

        it("should return an array of only active operators", async function () {
            await stakeOperator(user1);
            await stakeOperator(user2);
            await stakeOperator(user3);

            const validatorId1 = await stakeManagerMock.getValidatorId(user1.address);
            const validatorId2 = await stakeManagerMock.getValidatorId(user2.address);
            const validatorId3 = await stakeManagerMock.getValidatorId(user3.address);

            await nodeOperatorRegistry.addNodeOperator(validatorId1, user1.address);
            await nodeOperatorRegistry.addNodeOperator(validatorId2, user2.address);
            await nodeOperatorRegistry.addNodeOperator(validatorId3, user3.address);

            let allActiveOperators = await nodeOperatorRegistry.listDelegatedNodeOperators();
            expect(allActiveOperators.length).to.equal(3);

            let expectedRewardAddress = [user1.address, user2.address, user3.address];
            allActiveOperators.forEach((activeOperator, index) => {
                expect(activeOperator.rewardAddress).to.equal(expectedRewardAddress[index]);
            })

            await stakeManagerMock.unstake(validatorId1);
            allActiveOperators = await nodeOperatorRegistry.listDelegatedNodeOperators();
            expect(allActiveOperators.length).to.equal(2);

            expectedRewardAddress = [user2.address, user3.address];
            allActiveOperators.forEach((activeOperator, index) => {
                expect(activeOperator.rewardAddress).to.equal(expectedRewardAddress[index]);
            })

            await stakeManagerMock.slash(validatorId2);
            allActiveOperators = await nodeOperatorRegistry.listDelegatedNodeOperators();
            expect(allActiveOperators.length).to.equal(1);

            expectedRewardAddress = [user3.address];
            allActiveOperators.forEach((activeOperator, index) => {
                expect(activeOperator.rewardAddress).to.equal(expectedRewardAddress[index]);
            })
        });

        it("should return an empty array if no operator is active", async function () {
            await stakeOperator(user1);
            await stakeOperator(user2);

            const validatorId1 = await stakeManagerMock.getValidatorId(user1.address);
            await nodeOperatorRegistry.addNodeOperator(validatorId1, user1.address);

            const validatorId2 = await stakeManagerMock.getValidatorId(user2.address);
            await nodeOperatorRegistry.addNodeOperator(validatorId2, user2.address);

            await stakeManagerMock.unstake(validatorId1);
            await stakeManagerMock.slash(validatorId2);
            const allActiveOperators = await nodeOperatorRegistry.listDelegatedNodeOperators();
            expect(allActiveOperators).to.be.an("array").that.is.empty;
        });

        it("should return an empty array if there is no withdrawal operator", async function () {
            await stakeOperator(user1)
            const validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)
            await nodeOperatorRegistry.removeNodeOperator(validatorId);

            const allWithdrawOperators = await nodeOperatorRegistry.listWithdrawNodeOperators();
            expect(allWithdrawOperators).to.be.an("array").that.is.empty;
        });

        it("should return all withdraw node operators", async function () {
            await stakeOperator(user1);
            await stakeOperator(user2);
            await stakeOperator(user3);

            const validatorId1 = await stakeManagerMock.getValidatorId(user1.address);
            await nodeOperatorRegistry.addNodeOperator(validatorId1, user1.address);

            const validatorId2 = await stakeManagerMock.getValidatorId(user2.address);
            await nodeOperatorRegistry.addNodeOperator(validatorId2, user2.address);
            await stakeManagerMock.unstake(validatorId2);

            const validatorId3 = await stakeManagerMock.getValidatorId(user3.address);
            await nodeOperatorRegistry.addNodeOperator(validatorId3, user3.address);
            await stakeManagerMock.slash(validatorId3);


            const expectedRewardAddress = [user1.address, user2.address, user3.address];
            const allWithdrawOperators = await nodeOperatorRegistry.listWithdrawNodeOperators();
            expect(allWithdrawOperators.length).to.equal(3);
            allWithdrawOperators.forEach((withdrawOperator, index) => {
                expect(withdrawOperator.rewardAddress).to.equal(expectedRewardAddress[index]);
            })
        });

        it("Should add multiple operators", async function () {
            await stakeOperator(user1)
            await stakeOperator(user2)
            await stakeOperator(user3)

            let validatorId = await stakeManagerMock.getValidatorId(user1.address)
            expect(await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address))
                .emit(nodeOperatorRegistry, "AddNodeOperator").withArgs(1, user1.address)

            validatorId = await stakeManagerMock.getValidatorId(user2.address)
            expect(await nodeOperatorRegistry.addNodeOperator(validatorId, user2.address))
                .emit(nodeOperatorRegistry, "AddNodeOperator").withArgs(2, user2.address)

            validatorId = await stakeManagerMock.getValidatorId(user3.address)
            expect(await nodeOperatorRegistry.addNodeOperator(validatorId, user3.address))
                .emit(nodeOperatorRegistry, "AddNodeOperator").withArgs(3, user3.address)

            expect((await nodeOperatorRegistry.validatorIds(0))).eq(1)
            expect((await nodeOperatorRegistry.validatorIds(1))).eq(2)
            expect((await nodeOperatorRegistry.validatorIds(2))).eq(3)
            expect((await nodeOperatorRegistry.validatorIdToRewardAddress(1))).eq(user1.address)
            expect((await nodeOperatorRegistry.validatorIdToRewardAddress(2))).eq(user2.address)
            expect((await nodeOperatorRegistry.validatorIdToRewardAddress(3))).eq(user3.address)

        });

        it("Should fail add a new operator", async function () {
            let validatorId: BigNumber = BigNumber.from(0)
            // invalid validator id
            await expect(nodeOperatorRegistry.addNodeOperator(validatorId, user1.address))
                .revertedWith("ValidatorId=0")

            validatorId = BigNumber.from(100)
            // invalid reward address
            await expect(nodeOperatorRegistry.addNodeOperator(validatorId, ethers.constants.AddressZero))
                .revertedWith("Invalid reward address")

            // invalid validator not exists in stakeManager
            await expect(nodeOperatorRegistry.addNodeOperator(validatorId, user1.address))
                .revertedWith("Validator isn't ACTIVE")

            // stake a validator
            await stakeOperator(user1)

            // add the validator
            validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)

            // add a validator with the same validatorId
            await expect(nodeOperatorRegistry.addNodeOperator(validatorId, user1.address))
                .revertedWith("Validator exists")
        });

        it("Should fail add a jailed operator", async function () {
            // stake a validator
            await stakeOperator(user1)
            // slash the validator
            await stakeManagerMock.slash(1)
            // revert the validator is not active
            const validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await expect(nodeOperatorRegistry.addNodeOperator(validatorId, user1.address))
                .revertedWith("Validator isn't ACTIVE")
        });

        it("Should fail add a unstaked operator", async function () {
            // stake a validator
            await stakeOperator(user1)
            // unstake a validator
            await stakeManagerMock.unstake(1)
            // revert the validator is not active
            const validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await expect(nodeOperatorRegistry.addNodeOperator(validatorId, user1.address))
                .revertedWith("Validator isn't ACTIVE")
        });

        it("Should fail add operator missing Role", async function () {
            // stake validators
            await stakeOperator(user1)

            // get validator id
            const validatorId = await stakeManagerMock.getValidatorId(user1.address)

            // revert remove operator which not exist
            await expect(nodeOperatorRegistry.connect(user1).addNodeOperator(validatorId, user1.address))
                .revertedWith("Unauthorized")
        })

        it("Should remove an operator", async function () {
            await stakeOperator(user1)
            const validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)
            expect(await nodeOperatorRegistry.removeNodeOperator(validatorId))
                .emit(nodeOperatorRegistry, "RemoveNodeOperator")
                .withArgs(validatorId, user1.address)

            expect((await nodeOperatorRegistry.validatorIdToRewardAddress(1))).eq(ethers.constants.AddressZero)
        });

        it("Should remove multiple operator", async function () {
            // stake validators
            await stakeOperator(user1)
            await stakeOperator(user2)
            await stakeOperator(user3)

            // get validators ids
            const validatorId1 = await stakeManagerMock.getValidatorId(user1.address)
            const validatorId2 = await stakeManagerMock.getValidatorId(user2.address)
            const validatorId3 = await stakeManagerMock.getValidatorId(user3.address)

            // add operator 1 & 2
            await nodeOperatorRegistry.addNodeOperator(validatorId1, user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId2, user2.address)

            // remove operator 1
            expect(await nodeOperatorRegistry.removeNodeOperator(validatorId1))
                .emit(nodeOperatorRegistry, "RemoveNodeOperator")
                .withArgs(validatorId1, user1.address)
            expect(await nodeOperatorRegistry.validatorIds(0)).eq(2)
            expect((await nodeOperatorRegistry.validatorIdToRewardAddress(2))).eq(user2.address)

            // add operator 3
            await nodeOperatorRegistry.addNodeOperator(validatorId3, user3.address)

            expect(await nodeOperatorRegistry.validatorIds(0)).eq(2)
            expect(await nodeOperatorRegistry.validatorIds(1)).eq(3)
            expect((await nodeOperatorRegistry.validatorIdToRewardAddress(2))).eq(user2.address)
            expect((await nodeOperatorRegistry.validatorIdToRewardAddress(3))).eq(user3.address)

            // remove operator 2
            expect(await nodeOperatorRegistry.removeNodeOperator(validatorId2))
                .emit(nodeOperatorRegistry, "RemoveNodeOperator")
                .withArgs(validatorId2, user2.address)

            expect(await nodeOperatorRegistry.validatorIds(0)).eq(3)
            expect((await nodeOperatorRegistry.validatorIdToRewardAddress(3))).eq(user3.address)

            // remove operator 3
            expect(await nodeOperatorRegistry.removeNodeOperator(validatorId3))
                .emit(nodeOperatorRegistry, "RemoveNodeOperator")
                .withArgs(validatorId3, user3.address)
        });

        it("Should fail remove operator", async function () {
            // stake validators
            await stakeOperator(user1)

            const validatorId = 100
            // revert remove operator which not exist
            await expect(nodeOperatorRegistry.removeNodeOperator(validatorId))
                .revertedWith("Validator doesn't exist")
        })

        it("Should fail remove operator missing Role", async function () {
            // stake validators
            await stakeOperator(user1)

            // get validator id
            const validatorId = await stakeManagerMock.getValidatorId(user1.address)

            // revert user1 try no remove an operator
            await expect(nodeOperatorRegistry.connect(user1).removeNodeOperator(validatorId))
                .revertedWith("Unauthorized")
        })

        it("should Shouldfully remove an invalid operator", async function () {
            // stake validators
            await stakeOperator(user1)
            await stakeOperator(user2)
            await stakeOperator(user3)

            const validatorId1 = await stakeManagerMock.getValidatorId(user1.address)
            const validatorId2 = await stakeManagerMock.getValidatorId(user2.address)
            const validatorId3 = await stakeManagerMock.getValidatorId(user3.address)

            await nodeOperatorRegistry.addNodeOperator(validatorId1, user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId2, user2.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId3, user3.address)

            await nodeOperatorRegistry.setCommissionRate(10);

            expect(await nodeOperatorRegistry.removeInvalidNodeOperator(validatorId1))
                .emit(nodeOperatorRegistry, "RemoveInvalidNodeOperator")
                .withArgs(validatorId1, user1.address)
            expect(await nodeOperatorRegistry.validatorIds(0)).eq(3)
            expect(await nodeOperatorRegistry.validatorIds(1)).eq(2)

            await stakeManagerMock.unstake(validatorId2);
            expect(await nodeOperatorRegistry.removeInvalidNodeOperator(validatorId2))
                .emit(nodeOperatorRegistry, "RemoveInvalidNodeOperator")
                .withArgs(validatorId2, user2.address)
            expect(await nodeOperatorRegistry.validatorIds(0)).eq(3)

            await stakeManagerMock.slash(validatorId3);
            await stakeManagerMock.unstake(validatorId3);

            expect(await nodeOperatorRegistry.removeInvalidNodeOperator(validatorId3))
                .emit(nodeOperatorRegistry, "RemoveInvalidNodeOperator")
                .withArgs(validatorId3, user3.address)
        });

        it("should Should fail to remove an invalid node operator", async function () {
            await stakeOperator(user1)
            await stakeOperator(user2)

            const validatorId1 = await stakeManagerMock.getValidatorId(user1.address)
            const validatorId2 = await stakeManagerMock.getValidatorId(user2.address)

            await nodeOperatorRegistry.addNodeOperator(validatorId1, user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId2, user2.address)

            await nodeOperatorRegistry.setCommissionRate(20);

            await stakeManagerMock.updateCommissionRate(validatorId1, 20);
            await expect(nodeOperatorRegistry.removeInvalidNodeOperator(validatorId1))
                .revertedWith("Cannot remove valid operator.")

            await stakeManagerMock.slash(validatorId2);
            await stakeManagerMock.updateCommissionRate(validatorId2, 20);
            await expect(nodeOperatorRegistry.removeInvalidNodeOperator(validatorId2))
                .revertedWith("Cannot remove valid operator.")
        });

        it("should Shouldfully set the commission rate", async function () {
            expect(await nodeOperatorRegistry.setCommissionRate(10))
                .emit(nodeOperatorRegistry, "SetCommissionRate")
                .withArgs(0, 10)
        })

        it("should Should fail to set the commission rate", async function () {
            await expect(nodeOperatorRegistry.setCommissionRate(0))
                .revertedWith("Invalid commission rate")

            await expect(nodeOperatorRegistry.connect(user1).setCommissionRate(10))
                .revertedWith("Unauthorized")
        })

        it("Should set StMatic address", async function () {
            expect(await nodeOperatorRegistry.setStMaticAddress(user1.address))
                .emit(nodeOperatorRegistry, "SetStMaticAddress")
                .withArgs(stMATICMock.address, user1.address)
        })

        it("Should fail set StMatic address", async function () {
            // revert zero address
            await expect(nodeOperatorRegistry.setStMaticAddress(ethers.constants.AddressZero))
                .revertedWith("Invalid stMatic address")

            // revert user1 try to set stMatic address
            await expect(nodeOperatorRegistry.connect(user1).setStMaticAddress(user1.address))
                .revertedWith("Unauthorized")
        })

        it("Should set reward address", async function () {
            await stakeOperator(user1)
            const validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)

            expect(await nodeOperatorRegistry.connect(user1).setRewardAddress(user2.address))
                .emit(nodeOperatorRegistry, "SetRewardAddress")
                .withArgs(validatorId, user1.address, user2.address)
        })

        it("Should fail set reward address", async function () {
            await stakeOperator(user1)
            const validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)

            await expect(nodeOperatorRegistry.connect(user2).setRewardAddress(user2.address))
                .revertedWith("Unauthorized")

            await expect(nodeOperatorRegistry.connect(user2).setRewardAddress(ethers.constants.AddressZero))
                .revertedWith("Unauthorized")
        })

        it("should get an operator", async function () {
            await stakeOperator(user1)
            const validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)

            let nodeOperator = await nodeOperatorRegistry["getNodeOperator(address)"](user1.address);
            expect(nodeOperator.validatorId).to.equal(1);
            expect(nodeOperator.rewardAddress).to.equal(user1.address);

            nodeOperator = await nodeOperatorRegistry["getNodeOperator(uint256)"](1);
            expect(nodeOperator.validatorId).to.equal(1);
            expect(nodeOperator.rewardAddress).to.equal(user1.address);
        });

        it("should return empty data for a non-existing operator", async function () {
            await expect(nodeOperatorRegistry["getNodeOperator(address)"](user1.address))
                .revertedWith("Operator not found");

            await expect(nodeOperatorRegistry["getNodeOperator(uint256)"](1))
                .revertedWith("Operator not found")

            await stakeOperator(user1)
            const validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)
            await nodeOperatorRegistry.removeNodeOperator(validatorId);

            await expect(nodeOperatorRegistry["getNodeOperator(uint256)"](validatorId))
                .revertedWith("Operator not found")
        });

        it("should return the correct operator status", async function () {
            await stakeOperator(user1)
            const validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)

            let operatorStatus = await nodeOperatorRegistry.getNodeOperatorStatus(validatorId);
            expect(operatorStatus).to.equal(OPERATOR_STATUS.ACTIVE);

            await stakeManagerMock.slash(validatorId);
            operatorStatus = await nodeOperatorRegistry.getNodeOperatorStatus(validatorId);
            expect(operatorStatus).to.equal(OPERATOR_STATUS.JAILED);

            await stakeManagerMock.unjail(validatorId);
            operatorStatus = await nodeOperatorRegistry.getNodeOperatorStatus(validatorId);
            expect(operatorStatus).to.equal(OPERATOR_STATUS.ACTIVE);

            await stakeManagerMock.unstake(validatorId)
            operatorStatus = await nodeOperatorRegistry.getNodeOperatorStatus(validatorId);
            expect(operatorStatus).to.equal(OPERATOR_STATUS.EJECTED);
        });

        it("Should getValidatorDelegationAmount first delegation", async function () {
            await stakeOperator(user1)
            await stakeOperator(user2)
            await stakeOperator(user3)

            const validator1Stake = toEth("0")
            const validator2Stake = toEth("0")
            const validator3Stake = toEth("0")
            let validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)

            validatorId = await stakeManagerMock.getValidatorId(user2.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user2.address)

            validatorId = await stakeManagerMock.getValidatorId(user3.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user3.address)

            await nodeOperatorRegistry.setMinDelegateDistanceThreshold(100)
            let res = await nodeOperatorRegistry.getValidatorsDelegationAmount(toEth("0"))
            expect(res.activeNodeOperators.length, "1-res.activeNodeOperators").eq(3)
            expect(res.totalRatio, "1-res.totalRatio").eq(toEth("0"))
            expect(res.operatorRatios[0], "1-res.operatorRatios[1]").eq(toEth("0"))
            expect(res.operatorRatios[1], "1-res.operatorRatios[2]").eq(toEth("0"))
            expect(res.operatorRatios[2], "1-res.operatorRatios[3]").eq(toEth("0"))
        })

        it("Should getValidatorDelegationAmount When not balanced", async function () {
            await stakeOperator(user1)
            await stakeOperator(user2)
            await stakeOperator(user3)
            await stakeOperator(user4)

            const validator1Stake = toEth("1200")
            const validator2Stake = toEth("500")
            const validator3Stake = toEth("100")
            const validator4Stake = toEth("0")
            let validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)
            await increaseStakeFor(validatorId, validator1Stake)

            validatorId = await stakeManagerMock.getValidatorId(user2.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user2.address)
            await increaseStakeFor(validatorId, validator2Stake)

            validatorId = await stakeManagerMock.getValidatorId(user3.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user3.address)
            await increaseStakeFor(validatorId, validator3Stake)

            validatorId = await stakeManagerMock.getValidatorId(user4.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user4.address)
            await increaseStakeFor(validatorId, validator4Stake)

            // Case 1: setMinDelegateDistanceThreshold = 100 this should ignore the validator 1
            await nodeOperatorRegistry.setMinDelegateDistanceThreshold(100)
            await checkGetValidatorDelegationAmount("1", toEth("0"), {
                activeNodeOperatorsLength: 4,
                totalRatio: toEth("800"),
                operatorRatios: [
                    toEth("0"),
                    toEth("0"),
                    toEth("350"),
                    toEth("450"),
                ],
                rewardAddresses: [
                    user1.address, user2.address, user3.address, user4.address
                ]
            })

            // Case 2: setMinDelegateDistanceThreshold = 150 this should ignore the validator 1 & 2
            await nodeOperatorRegistry.setMinDelegateDistanceThreshold(150)
            await checkGetValidatorDelegationAmount("2", toEth("0"), {
                activeNodeOperatorsLength: 4,
                totalRatio: toEth("800"),
                operatorRatios: [
                    toEth("0"),
                    toEth("0"),
                    toEth("350"),
                    toEth("450"),
                ],
                rewardAddresses: [
                    user1.address, user2.address, user3.address, user4.address
                ]
            })

            // Case 3: setMinDelegateDistanceThreshold = 1000 this should ignore the validator 1 & 2 & 3
            await nodeOperatorRegistry.setMinDelegateDistanceThreshold(1000)
            await checkGetValidatorDelegationAmount("3", toEth("0"), {
                activeNodeOperatorsLength: 4,
                totalRatio: toEth("450"),
                operatorRatios: [
                    toEth("0"),
                    toEth("0"),
                    toEth("0"),
                    toEth("450"),
                ],
                rewardAddresses: [
                    user1.address, user2.address, user3.address, user4.address
                ]
            })

            // Case 4: setMinDelegateDistanceThreshold = 100 and slash validator 2
            await stakeManagerMock.slash(2)
            await nodeOperatorRegistry.setMinDelegateDistanceThreshold(100)

            await checkGetValidatorDelegationAmount("4", toEth("0"), {
                activeNodeOperatorsLength: 3,
                totalRatio: toEth("1100"),
                operatorRatios: [
                    toEth("0"),
                    toEth("500"),
                    toEth("600"),
                ],
                rewardAddresses: [
                    user1.address, user3.address, user4.address
                ]
            })
        })

        it("Should getValidatorDelegationAmount when system is balanced", async function () {
            await stakeOperator(user1)
            await stakeOperator(user2)
            await stakeOperator(user3)

            const validator1Stake = toEth("1200")
            const validator2Stake = toEth("1000")
            const validator3Stake = toEth("1000")
            let validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)
            await increaseStakeFor(validatorId, validator1Stake)

            validatorId = await stakeManagerMock.getValidatorId(user2.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user2.address)
            await increaseStakeFor(validatorId, validator2Stake)

            validatorId = await stakeManagerMock.getValidatorId(user3.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user3.address)
            await increaseStakeFor(validatorId, validator3Stake)

            await nodeOperatorRegistry.setMinDelegateDistanceThreshold(120)
            await checkGetValidatorDelegationAmount("1", toEth("0"), {
                activeNodeOperatorsLength: 3,
                totalRatio: toEth("0"),
                operatorRatios: [
                    toEth("0"),
                    toEth("0"),
                    toEth("0")
                ],
                rewardAddresses: [
                    user1.address, user2.address, user3.address
                ]
            })
        })

        it("Should getValidatorDelegationAmount when buffered token", async function () {
            await stakeOperator(user1)
            await stakeOperator(user2)
            await stakeOperator(user3)

            const validator1Stake = toEth("1200")
            const validator2Stake = toEth("500")
            const validator3Stake = toEth("100")
            let validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)
            await increaseStakeFor(validatorId, validator1Stake)

            validatorId = await stakeManagerMock.getValidatorId(user2.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user2.address)
            await increaseStakeFor(validatorId, validator2Stake)

            validatorId = await stakeManagerMock.getValidatorId(user3.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user3.address)
            await increaseStakeFor(validatorId, validator3Stake)

            await nodeOperatorRegistry.setMinDelegateDistanceThreshold(120)
            await checkGetValidatorDelegationAmount("1", toEth("3600"), {
                activeNodeOperatorsLength: 3,
                operatorRatios: [
                    toEth("600"),
                    toEth("1300"),
                    toEth("1700"),
                ],
                rewardAddresses: [
                    user1.address, user2.address, user3.address
                ],
                totalRatio: toEth("3600")
            })
        })

        it("Should getValidatorDelegationAmount lowest validator is jailed", async function () {
            await stakeOperator(user1)
            await stakeOperator(user2)
            await stakeOperator(user3)

            const validator1Stake = toEth("1200")
            const validator2Stake = toEth("500")
            const validator3Stake = toEth("100")
            let validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)
            await increaseStakeFor(validatorId, validator1Stake)

            validatorId = await stakeManagerMock.getValidatorId(user2.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user2.address)
            await increaseStakeFor(validatorId, validator2Stake)

            validatorId = await stakeManagerMock.getValidatorId(user3.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user3.address)
            await increaseStakeFor(validatorId, validator3Stake)

            await stakeManagerMock.slash(3)
            await nodeOperatorRegistry.setMinDelegateDistanceThreshold(120)

            await checkGetValidatorDelegationAmount("1", toEth("0"), {
                activeNodeOperatorsLength: 2,
                totalRatio: toEth("400"),
                operatorRatios: [
                    toEth("0"),
                    toEth("400")
                ],
                rewardAddresses: [
                    user1.address, user2.address
                ]
            })


            await nodeOperatorRegistry.setMinDelegateDistanceThreshold(200)
            await checkGetValidatorDelegationAmount("2", toEth("0"), {
                activeNodeOperatorsLength: 2,
                totalRatio: toEth("0"),
                operatorRatios: [
                    toEth("0"),
                    toEth("0")
                ],
                rewardAddresses: [
                    user1.address, user2.address
                ]
            })
        })

        it("Should fail getValidatorDelegationAmount all validators was slashed", async function () {
            await stakeOperator(user1)
            await stakeOperator(user2)
            await stakeOperator(user3)

            const validator1Stake = toEth("1200")
            const validator2Stake = toEth("500")
            const validator3Stake = toEth("100")

            let validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)
            await increaseStakeFor(validatorId, validator1Stake)

            validatorId = await stakeManagerMock.getValidatorId(user2.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user2.address)
            await increaseStakeFor(validatorId, validator2Stake)

            validatorId = await stakeManagerMock.getValidatorId(user3.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user3.address)
            await increaseStakeFor(validatorId, validator3Stake)

            await stakeManagerMock.slash(1)
            await stakeManagerMock.slash(2)
            await stakeManagerMock.slash(3)

            await expect(nodeOperatorRegistry.getValidatorsDelegationAmount(toEth("0")))
                .revertedWith("There are no active validator")
        })

        it("Should fail getValidatorDelegationAmount", async function () {
            await expect(nodeOperatorRegistry.getValidatorsDelegationAmount(toEth("0")))
                .revertedWith("Not enough operators to get stake infos")

            await stakeOperator(user1)
            await stakeOperator(user2)
            await stakeOperator(user3)

            const validator1Stake = toEth("1200")
            const validator2Stake = toEth("500")
            const validator3Stake = toEth("100")

            let validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)
            await increaseStakeFor(validatorId, validator1Stake)

            validatorId = await stakeManagerMock.getValidatorId(user2.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user2.address)
            await increaseStakeFor(validatorId, validator2Stake)

            validatorId = await stakeManagerMock.getValidatorId(user3.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user3.address)
            await increaseStakeFor(validatorId, validator3Stake)

            await stakeManagerMock.unstake(1)
            await expect(nodeOperatorRegistry.getValidatorsDelegationAmount(toEth("0")))
                .revertedWith("Could not calculate the stake data, an operator was EJECTED")

            await nodeOperatorRegistry.removeNodeOperator(1)
            await stakeManagerMock.slash(2)
            await stakeManagerMock.unstake(2)
            await expect(nodeOperatorRegistry.getValidatorsDelegationAmount(toEth("0")))
                .revertedWith("Could not calculate the stake data, an operator was EJECTED")

            await nodeOperatorRegistry.removeNodeOperator(2)
            await stakeManagerMock.unstakeClaim(3)
            await expect(nodeOperatorRegistry.getValidatorsDelegationAmount(toEth("0")))
                .revertedWith("Could not calculate the stake data, an operator was UNSTAKED")
        });

        it("Should getValidatorRebalanceAmount When not balanced", async function () {
            await stakeOperator(user1)
            await stakeOperator(user2)
            await stakeOperator(user3)

            const validator1Stake = toEth("20000")
            const validator2Stake = toEth("60000")
            const validator3Stake = toEth("1000")
            let validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)
            await increaseStakeFor(validatorId, validator1Stake)

            validatorId = await stakeManagerMock.getValidatorId(user2.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user2.address)
            await increaseStakeFor(validatorId, validator2Stake)

            validatorId = await stakeManagerMock.getValidatorId(user3.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user3.address)
            await increaseStakeFor(validatorId, validator3Stake)

            await nodeOperatorRegistry.setMinRebalanceDistanceThreshold(100)
            await nodeOperatorRegistry.setMaxWithdrawPercentagePerRebalance(100)

            await checkGetValidatorRebalanceAmount("case-1", toEth("0"), {
                activeNodeOperatorsLength: 3,
                totalRatio: toEth("33000"),
                operatorRatios: [
                    toEth("0"),
                    toEth("33000"),
                    toEth("0"),
                ],
                rewardAddresses: [
                    user1.address, user2.address, user3.address
                ],
                totalToWithdraw: toEth("33000")
            })

            await nodeOperatorRegistry.setMinRebalanceDistanceThreshold(100)
            await nodeOperatorRegistry.setMaxWithdrawPercentagePerRebalance(100)

            await checkGetValidatorRebalanceAmount("case-1", toEth("30000"), {
                activeNodeOperatorsLength: 3,
                totalRatio: toEth("33000"),
                operatorRatios: [
                    toEth("0"),
                    toEth("33000"),
                    toEth("0"),
                ],
                rewardAddresses: [
                    user1.address, user2.address, user3.address
                ],
                totalToWithdraw: toEth("3000")
            })

            await nodeOperatorRegistry.setMaxWithdrawPercentagePerRebalance(50)

            await checkGetValidatorRebalanceAmount("case-1", toEth("30000"), {
                activeNodeOperatorsLength: 3,
                totalRatio: toEth("33000"),
                operatorRatios: [
                    toEth("0"),
                    toEth("33000"),
                    toEth("0"),
                ],
                rewardAddresses: [
                    user1.address, user2.address, user3.address
                ],
                totalToWithdraw: toEth("1500")
            })
        })

        it("Should fail getValidatorsRebalanceAmount not enough operators", async function () {
            await nodeOperatorRegistry.setMinRebalanceDistanceThreshold(120)
            await expect(nodeOperatorRegistry.getValidatorsRebalanceAmount(toEth("0")))
                .revertedWith("Not enough operator to rebalance")
        })

        it("Should fail getValidatorsRebalanceAmount totalStaked == 0", async function () {
            await stakeOperator(user1)
            await stakeOperator(user2)
            await stakeOperator(user3)

            const validator1Stake = toEth("0")
            const validator2Stake = toEth("0")
            const validator3Stake = toEth("0")

            let validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)

            validatorId = await stakeManagerMock.getValidatorId(user2.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user2.address)

            validatorId = await stakeManagerMock.getValidatorId(user3.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user3.address)

            await nodeOperatorRegistry.setMinRebalanceDistanceThreshold(120)
            await expect(nodeOperatorRegistry.getValidatorsRebalanceAmount(toEth("0")))
                .revertedWith("The system is balanced")
        })

        it("Should fail getValidatorsRebalanceAmount distanceThreshold < MIN_REBALANCE_DISTANCE_THRESHOLD", async function () {
            await stakeOperator(user1)
            await stakeOperator(user2)
            await stakeOperator(user3)

            const validator1Stake = toEth("100")
            const validator2Stake = toEth("90")
            const validator3Stake = toEth("95")

            let validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)
            await increaseStakeFor(validatorId, validator1Stake)

            validatorId = await stakeManagerMock.getValidatorId(user2.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user2.address)
            await increaseStakeFor(validatorId, validator2Stake)

            validatorId = await stakeManagerMock.getValidatorId(user3.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user3.address)
            await increaseStakeFor(validatorId, validator3Stake)

            await nodeOperatorRegistry.setMinRebalanceDistanceThreshold(120)
            await expect(nodeOperatorRegistry.getValidatorsRebalanceAmount(toEth("0")))
                .revertedWith("The system is balanced")
        })

        it("Should fail getValidatorsRebalanceAmount Zero total to withdraw", async function () {
            await stakeOperator(user1)
            await stakeOperator(user2)
            await stakeOperator(user3)

            const validator1Stake = toEth("1000")
            const validator2Stake = toEth("700")
            const validator3Stake = toEth("100")

            let validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)
            await increaseStakeFor(validatorId, validator1Stake)

            validatorId = await stakeManagerMock.getValidatorId(user2.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user2.address)
            await increaseStakeFor(validatorId, validator2Stake)

            validatorId = await stakeManagerMock.getValidatorId(user3.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user3.address)
            await increaseStakeFor(validatorId, validator3Stake)

            await nodeOperatorRegistry.setMinRebalanceDistanceThreshold(100)
            await expect(nodeOperatorRegistry.getValidatorsRebalanceAmount(toEth("1000")))
                .revertedWith("Zero total to withdraw")
        })

        it("Should fail getValidatorsRebalanceAmount totalToWithdraw", async function () {
            await stakeOperator(user1)
            await stakeOperator(user2)
            await stakeOperator(user3)

            const validator1Stake = toEth("1000")
            const validator2Stake = toEth("700")
            const validator3Stake = toEth("100")

            let validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)
            await increaseStakeFor(validatorId, validator1Stake)

            validatorId = await stakeManagerMock.getValidatorId(user2.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user2.address)
            await increaseStakeFor(validatorId, validator2Stake)

            validatorId = await stakeManagerMock.getValidatorId(user3.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user3.address)
            await increaseStakeFor(validatorId, validator3Stake)


            let totalBuffered = toEth("100")
            const maxWithdrawPercentagePerRebalance = [50, 100]
            const minRebalanceDistanceThreshold = [100, 120]
            const expectedTotalRatios = ["500", "400"]
            const operatorRatiosSteps = [
                [
                    toEth("400"),
                    toEth("100"),
                    toEth("0"),
                ],
                [
                    toEth("400"),
                    toEth("0"),
                    toEth("0"),
                ]
            ]
            for (let idx = 0; idx < maxWithdrawPercentagePerRebalance.length; idx++) {
                await nodeOperatorRegistry.setMinRebalanceDistanceThreshold(minRebalanceDistanceThreshold[idx])
                await nodeOperatorRegistry.setMaxWithdrawPercentagePerRebalance(maxWithdrawPercentagePerRebalance[idx])

                let expectedTotalRatio = toEth(expectedTotalRatios[idx])
                let totalToWithdraw = expectedTotalRatio.sub(totalBuffered).mul(maxWithdrawPercentagePerRebalance[idx]).div(100)

                await checkGetValidatorRebalanceAmount("case-" + idx, totalBuffered, {
                    activeNodeOperatorsLength: 3,
                    totalRatio: expectedTotalRatio,
                    operatorRatios: operatorRatiosSteps[idx],
                    rewardAddresses: [
                        user1.address, user2.address, user3.address
                    ],
                    totalToWithdraw: totalToWithdraw
                })
            }
        })

        it("getValidatorsRequestWithdraw when system is balanced", async function () {
            await stakeOperator(user1)
            await stakeOperator(user2)
            await stakeOperator(user3)

            const validator1Stake = toEth("1000")
            const validator2Stake = toEth("1000")
            const validator3Stake = toEth("1000")

            let validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)
            await increaseStakeFor(validatorId, validator1Stake)

            validatorId = await stakeManagerMock.getValidatorId(user2.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user2.address)
            await increaseStakeFor(validatorId, validator2Stake)

            validatorId = await stakeManagerMock.getValidatorId(user3.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user3.address)
            await increaseStakeFor(validatorId, validator3Stake)

            await nodeOperatorRegistry.setMinRequestWithdrawDistanceThreshold(0)
            await nodeOperatorRegistry.setMinRequestWithdrawRange(20)
            await checkRequestWithdraw("1", false, toEth("100"), {
                activeNodeOperatorsLength: 3,
                operatorAmountCanBeRequested: [toEth("0"), toEth("0"), toEth("0")],
                rewardAddresses: [user1.address, user2.address, user3.address],
                totalAmountCanBeRequested: toEth("0"),
                totalValidatorToWithdrawFrom: 1,
            })
        })

        it("getValidatorsRequestWithdraw when system is balanced and MinRequestWithdrawRange = 100%", async function () {
            await stakeOperator(user1)
            await stakeOperator(user2)
            await stakeOperator(user3)

            const validator1Stake = toEth("1000")
            const validator2Stake = toEth("1000")
            const validator3Stake = toEth("1000")

            let validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)
            await increaseStakeFor(validatorId, validator1Stake)

            validatorId = await stakeManagerMock.getValidatorId(user2.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user2.address)
            await increaseStakeFor(validatorId, validator2Stake)

            validatorId = await stakeManagerMock.getValidatorId(user3.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user3.address)
            await increaseStakeFor(validatorId, validator3Stake)

            await nodeOperatorRegistry.setMinRequestWithdrawDistanceThreshold(0)
            await nodeOperatorRegistry.setMinRequestWithdrawRange(100)
            await checkRequestWithdraw("1", false, toEth("3"), {
                activeNodeOperatorsLength: 3,
                operatorAmountCanBeRequested: [toEth("0"), toEth("0"), toEth("0")],
                rewardAddresses: [user1.address, user2.address, user3.address],
                totalAmountCanBeRequested: toEth("0"),
                totalValidatorToWithdrawFrom: 3,
            })
        })

        it("getValidatorsRequestWithdraw when system is not balanced", async function () {
            await stakeOperator(user1)
            await stakeOperator(user2)
            await stakeOperator(user3)

            const validator1Stake = toEth("1000")
            const validator2Stake = toEth("1000")
            const validator3Stake = toEth("400")

            let validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)
            await increaseStakeFor(validatorId, validator1Stake)

            validatorId = await stakeManagerMock.getValidatorId(user2.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user2.address)
            await increaseStakeFor(validatorId, validator2Stake)

            validatorId = await stakeManagerMock.getValidatorId(user3.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user3.address)
            await increaseStakeFor(validatorId, validator3Stake)

            await nodeOperatorRegistry.setMinRequestWithdrawDistanceThreshold(0)
            await checkRequestWithdraw("1", false, toEth("100"), {
                activeNodeOperatorsLength: 3,
                operatorAmountCanBeRequested: [toEth("600"), toEth("600"), toEth("0")],
                rewardAddresses: [user1.address, user2.address, user3.address],
                totalAmountCanBeRequested: toEth("1200"),
                totalValidatorToWithdrawFrom: 0,
            })
        })

        it("getValidatorsRequestWithdraw when system is not balanced with operator has zero", async function () {
            await stakeOperator(user1)
            await stakeOperator(user2)
            await stakeOperator(user3)

            const validator1Stake = toEth("1000")
            const validator2Stake = toEth("800")
            const validator3Stake = toEth("0")

            let validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)
            await increaseStakeFor(validatorId, validator1Stake)

            validatorId = await stakeManagerMock.getValidatorId(user2.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user2.address)
            await increaseStakeFor(validatorId, validator2Stake)

            validatorId = await stakeManagerMock.getValidatorId(user3.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user3.address)
            await increaseStakeFor(validatorId, validator3Stake)

            await nodeOperatorRegistry.setMinRequestWithdrawDistanceThreshold(0)
            await checkRequestWithdraw("1", false, toEth("300"), {
                activeNodeOperatorsLength: 3,
                operatorAmountCanBeRequested: [toEth("500"), toEth("300"), toEth("0")],
                rewardAddresses: [user1.address, user2.address, user3.address],
                totalAmountCanBeRequested: toEth("800"),
                totalValidatorToWithdrawFrom: 0,
            })
        })

        it.only("getValidatorsRequestWithdraw when system is balanced with MinRequestWithdrawDistanceThreshold = 50%", async function () {
            await stakeOperator(user1)
            await stakeOperator(user2)
            await stakeOperator(user3)

            const validator1Stake = toEth("1000")
            const validator2Stake = toEth("900")
            const validator3Stake = toEth("500")

            let validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)
            await increaseStakeFor(validatorId, validator1Stake)

            validatorId = await stakeManagerMock.getValidatorId(user2.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user2.address)
            await increaseStakeFor(validatorId, validator2Stake)

            validatorId = await stakeManagerMock.getValidatorId(user3.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user3.address)
            await increaseStakeFor(validatorId, validator3Stake)

            await nodeOperatorRegistry.setMinRequestWithdrawDistanceThreshold(50)
            await nodeOperatorRegistry.setMinRequestWithdrawRange(25)

            await checkRequestWithdraw("1", false, toEth("300"), {
                activeNodeOperatorsLength: 3,
                operatorAmountCanBeRequested: [toEth("0"), toEth("0"), toEth("0")],
                rewardAddresses: [user1.address, user2.address, user3.address],
                totalAmountCanBeRequested: toEth("0"),
                totalValidatorToWithdrawFrom: 2,
            })
        })

        it.only("getValidatorsRequestWithdraw when system is balanced with amount requested = 80%", async function () {
            await stakeOperator(user1)
            await stakeOperator(user2)
            await stakeOperator(user3)

            const validator1Stake = toEth("1000")
            const validator2Stake = toEth("900")
            const validator3Stake = toEth("500")

            let validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)
            await increaseStakeFor(validatorId, validator1Stake)

            validatorId = await stakeManagerMock.getValidatorId(user2.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user2.address)
            await increaseStakeFor(validatorId, validator2Stake)

            validatorId = await stakeManagerMock.getValidatorId(user3.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user3.address)
            await increaseStakeFor(validatorId, validator3Stake)

            await nodeOperatorRegistry.setMinRequestWithdrawDistanceThreshold(20)
            await nodeOperatorRegistry.setMinRequestWithdrawRange(25)

            await checkRequestWithdraw("1", false, toEth("1920"), {
                activeNodeOperatorsLength: 3,
                operatorAmountCanBeRequested: [toEth("840"), toEth("740"), toEth("340")],
                rewardAddresses: [user1.address, user2.address, user3.address],
                totalAmountCanBeRequested: toEth("1920"),
                totalValidatorToWithdrawFrom: 0,
            })
        })
    });
});

async function checkRequestWithdraw(id: string, log: boolean, withdrawAmount: BigNumber, data: {
    activeNodeOperatorsLength: number,
    operatorAmountCanBeRequested: Array<BigNumber>,
    rewardAddresses: Array<string>,
    totalAmountCanBeRequested: BigNumber,
    totalValidatorToWithdrawFrom: number,
}) {
    const res = await nodeOperatorRegistry.getValidatorsRequestWithdraw(withdrawAmount)
    if (log) {
        console.log(res)
    }
    expect(res.activeNodeOperators.length, `${id}--activeNodeOperators`).eq(data.activeNodeOperatorsLength)
    expect(res.totalValidatorToWithdrawFrom, `${id}--totalValidatorToWithdrawFrom`).eq(data.totalValidatorToWithdrawFrom)

    expect(res.operatorAmountCanBeRequested.length, `${id}--res.operatorAmountCanBeRequested.length`).eq(data.operatorAmountCanBeRequested.length)
    for (let idx = 0; idx < res.operatorAmountCanBeRequested.length; idx++) {
        expect(res.operatorAmountCanBeRequested[idx], `${id}--${idx}--operatorAmountCanBeRequested`).eq(data.operatorAmountCanBeRequested[idx])
    }

    expect(res.activeNodeOperators.length, `${id}--res.activeNodeOperators.length`).eq(data.rewardAddresses.length)
    for (let idx = 0; idx < res.activeNodeOperators.length; idx++) {
        expect(res.activeNodeOperators[idx].rewardAddress, `${id}--${idx}--rewardAddress[1]`).eq(data.rewardAddresses[idx])
    }
    expect(res.totalValidatorToWithdrawFrom, `${id}--res.totalValidatorToWithdrawFrom.length`).eq(data.totalValidatorToWithdrawFrom)
}

async function checkGetValidatorRebalanceAmount(id: string, totalBuffered: BigNumber, data: {
    activeNodeOperatorsLength: number,
    totalRatio: BigNumber,
    operatorRatios: Array<BigNumber>,
    rewardAddresses: Array<string>,
    totalToWithdraw: BigNumber,
}) {
    let res = await nodeOperatorRegistry.getValidatorsRebalanceAmount(totalBuffered)
    expect(res.activeNodeOperators.length, `${id}--activeNodeOperators`).eq(data.activeNodeOperatorsLength)
    expect(res.totalRatio, `${id}--totalRatio`).eq(data.totalRatio)

    expect(res.operatorRatios.length, `${id}--res.operatorRatios.length`).eq(data.operatorRatios.length)
    for (let idx = 0; idx < res.operatorRatios.length; idx++) {
        expect(res.operatorRatios[idx], `${id}--operatorRatios[1]`).eq(data.operatorRatios[idx])
    }

    expect(res.activeNodeOperators.length, `${id}--res.activeNodeOperators.length`).eq(data.rewardAddresses.length)
    for (let idx = 0; idx < res.activeNodeOperators.length; idx++) {
        expect(res.activeNodeOperators[idx].rewardAddress, `${id}--${idx}--rewardAddress[1]`).eq(data.rewardAddresses[idx])
    }
    expect(res.totalToWithdraw, `${id}--res.totalToWithdraw.length`).eq(data.totalToWithdraw)
}

async function checkGetValidatorDelegationAmount(id: string, totalBuffered: BigNumber, data: {
    activeNodeOperatorsLength: number,
    totalRatio: BigNumber,
    operatorRatios: Array<BigNumber>,
    rewardAddresses: Array<string>
}) {
    let res = await nodeOperatorRegistry.getValidatorsDelegationAmount(totalBuffered)
    expect(res.activeNodeOperators.length, `${id}--activeNodeOperators`).eq(data.activeNodeOperatorsLength)
    expect(res.totalRatio, `${id}--totalRatio`).eq(data.totalRatio)

    expect(res.operatorRatios.length, `${id}--res.operatorRatios.length`).eq(data.operatorRatios.length)
    for (let idx = 0; idx < res.operatorRatios.length; idx++) {
        expect(res.operatorRatios[idx], `${id}--operatorRatios[1]`).eq(data.operatorRatios[idx])
    }

    expect(res.activeNodeOperators.length, `${id}--res.activeNodeOperators.length`).eq(data.rewardAddresses.length)
    for (let idx = 0; idx < res.activeNodeOperators.length; idx++) {
        expect(res.activeNodeOperators[idx].rewardAddress, `${id}--${idx}--rewardAddress[1]`).eq(data.rewardAddresses[idx])
    }
}

async function increaseStakeFor(validatorId: BigNumber, amount: BigNumber) {
    let validatorShareAddress = await stakeManagerMock.getValidatorContract(validatorId)

    await erc20Mock.connect(signer).transfer(validatorShareAddress, toEth("1000"))

    let validatorShareMock: ValidatorShareMock = (await ethers
        .getContractAt("ValidatorShareMock", validatorShareAddress)) as ValidatorShareMock
    await validatorShareMock.increaseStakeFor(amount)
}

async function stakeOperator(user: SignerWithAddress) {
    await stakeManagerMock.connect(user)
        .stakeFor(
            user.address,
            toEth("10"),
            toEth("10"),
            true,
            ethers.utils.hexZeroPad("0x01", 64)
        )
}

const OPERATOR_STATUS = {
    INACTIVE: 0,
    ACTIVE: 1,
    JAILED: 2,
    EJECTED: 3,
    UNSTAKED: 4
};

// convert a string to ether
function toEth(amount: string): BigNumber {
    return ethers.utils.parseEther(amount);
}

function toBigNumber(amount: String): BigNumber {
    return ethers.BigNumber.from(amount);
}

async function checkOperator(
    this: any,
    id: number,
    no: {
        status?: number;
        rewardAddress?: string;
        validatorId?: BigNumber;
        validatorShare?: string;
    }
) {
    const res = await nodeOperatorRegistry["getNodeOperator(uint256)"].call(
        this,
        id
    );
    console.log(res)
    if (no.status) {
        expect(res.status, "status").equal(no.status);
    }
    if (no.rewardAddress) {
        expect(res.rewardAddress, "rewardAddress").equal(no.rewardAddress);
    }
    if (no.validatorId) {
        expect(res.validatorId, "validatorId").equal(no.validatorId);
    }
    if (no.validatorShare) {
        expect(res.validatorShare, "validatorShare").equal(no.validatorShare);
    }
}