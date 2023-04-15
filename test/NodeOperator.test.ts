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
            erc20Mock.address
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
            accounts[0].address
        ]
        )) as NodeOperatorRegistry;
        await nodeOperatorRegistry.deployed();
        await erc20Mock.connect(signer).mint(toEth("1000000"))

        await stMATICMock.setOperator(nodeOperatorRegistry.address);
        await nodeOperatorRegistry.setDistanceThreshold(100)
    });

    describe("Add Operator", async function () {
        it("Should add a new operator", async function () {
            await stakeOperator(user1)

            const validatorId = await stakeManagerMock.getValidatorId(user1.address)
            expect(await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address))
                .emit(nodeOperatorRegistry, "AddNodeOperator").withArgs(1, user1.address)

            expect((await nodeOperatorRegistry.validatorIds(0))).eq(1)
            expect((await nodeOperatorRegistry.validatorIdToRewardAddress(1))).eq(user1.address)
            expect((await nodeOperatorRegistry.getValidatorIds()).length).eq(1)
            await checkStats("1", {
                inactiveNodeOperator: 0,
                activeNodeOperator: 1,
                jailedNodeOperator: 0,
                ejectedNodeOperator: 0,
                unstakedNodeOperator: 0,
            }, false)
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
            await stakeOperator(user2)

            // add the validator
            validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)

            // add a validator with the same validatorId
            await expect(nodeOperatorRegistry.addNodeOperator(validatorId, user1.address))
                .revertedWith("Validator exists")

            validatorId = await stakeManagerMock.getValidatorId(user2.address)
            // add a validator with the same validatorId
            await expect(nodeOperatorRegistry.addNodeOperator(validatorId, user1.address))
                .revertedWith("Reward Address already used")

            validatorId = await stakeManagerMock.getValidatorId(user2.address)
            // add a validator with the same reward address
            await expect(nodeOperatorRegistry.addNodeOperator(validatorId, user1.address))
                .revertedWith("Reward Address already used")

            const validatorShareContract = await getValidatorShare(validatorId)
            await validatorShareContract.updateDelegation(false)

            // add a validator with the same validatorId
            await expect(nodeOperatorRegistry.addNodeOperator(validatorId, user2.address))
                .revertedWith("Delegation is disabled")
        });

        it("Should add multiple operators", async function () {
            await stakeOperator(user1)
            await stakeOperator(user2)
            await stakeOperator(user3)

            let validatorId = await stakeManagerMock.getValidatorId(user1.address)
            expect(await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address))
                .emit(nodeOperatorRegistry, "AddNodeOperator").withArgs(1, user1.address)
            expect((await nodeOperatorRegistry.getValidatorIds()).length).eq(1)

            validatorId = await stakeManagerMock.getValidatorId(user2.address)
            expect(await nodeOperatorRegistry.addNodeOperator(validatorId, user2.address))
                .emit(nodeOperatorRegistry, "AddNodeOperator").withArgs(2, user2.address)
            expect((await nodeOperatorRegistry.getValidatorIds()).length).eq(2)

            validatorId = await stakeManagerMock.getValidatorId(user3.address)
            expect(await nodeOperatorRegistry.addNodeOperator(validatorId, user3.address))
                .emit(nodeOperatorRegistry, "AddNodeOperator").withArgs(3, user3.address)
            expect((await nodeOperatorRegistry.getValidatorIds()).length).eq(3)

            expect((await nodeOperatorRegistry.validatorIds(0))).eq(1)
            expect((await nodeOperatorRegistry.validatorIds(1))).eq(2)
            expect((await nodeOperatorRegistry.validatorIds(2))).eq(3)
            expect((await nodeOperatorRegistry.validatorIdToRewardAddress(1))).eq(user1.address)
            expect((await nodeOperatorRegistry.validatorIdToRewardAddress(2))).eq(user2.address)
            expect((await nodeOperatorRegistry.validatorIdToRewardAddress(3))).eq(user3.address)

            await checkStats("1", {
                inactiveNodeOperator: 0,
                activeNodeOperator: 3,
                jailedNodeOperator: 0,
                ejectedNodeOperator: 0,
                unstakedNodeOperator: 0,
            }, false)
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
                .reverted
        })
    })

    describe("Exit Node Operator Registry", async function () {
        it("should successfully exit the node operator", async function () {
            await stakeOperator(user1)
            const validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)

            expect(await nodeOperatorRegistry.connect(user1).exitNodeOperatorRegistry())
                .emit(stMATICMock, "WithdrawTotalDelegated")
                .emit(nodeOperatorRegistry, "ExitNodeOperator")
                .withArgs(validatorId, user1.address);

        });

        it("should fail to exit the node operator", async function () {
            await stakeOperator(user1)
            const validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)

            await expect(nodeOperatorRegistry.exitNodeOperatorRegistry())
                .reverted;

        });
    })
    describe("Remove Operator", async function () {
        it("Should remove an operator", async function () {
            await stakeOperator(user1)
            const validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)

            expect(await nodeOperatorRegistry.removeNodeOperator(validatorId))
                .emit(stMATICMock, "WithdrawTotalDelegated")
                .emit(nodeOperatorRegistry, "RemoveNodeOperator")
                .withArgs(validatorId, user1.address)

            await expect(nodeOperatorRegistry["getNodeOperator(uint256)"](validatorId))
                .revertedWith("Operator not found");

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
                .emit(stMATICMock, "WithdrawTotalDelegated")
                .emit(nodeOperatorRegistry, "RemoveNodeOperator")
                .withArgs(validatorId1, user1.address)
            expect(await nodeOperatorRegistry.validatorIds(0)).eq(2)
            expect((await nodeOperatorRegistry.getValidatorIds()).length).eq(1)
            expect((await nodeOperatorRegistry.validatorIdToRewardAddress(2))).eq(user2.address)

            // add operator 3
            await nodeOperatorRegistry.addNodeOperator(validatorId3, user3.address)

            expect(await nodeOperatorRegistry.validatorIds(0)).eq(2)
            expect(await nodeOperatorRegistry.validatorIds(1)).eq(3)
            expect((await nodeOperatorRegistry.getValidatorIds()).length).eq(2)
            expect((await nodeOperatorRegistry.validatorIdToRewardAddress(2))).eq(user2.address)
            expect((await nodeOperatorRegistry.validatorIdToRewardAddress(3))).eq(user3.address)

            // remove operator 2
            expect(await nodeOperatorRegistry.removeNodeOperator(validatorId2))
                .emit(stMATICMock, "WithdrawTotalDelegated")
                .emit(nodeOperatorRegistry, "RemoveNodeOperator")
                .withArgs(validatorId2, user2.address)

            expect(await nodeOperatorRegistry.validatorIds(0)).eq(3)
            expect((await nodeOperatorRegistry.getValidatorIds()).length).eq(1)
            expect((await nodeOperatorRegistry.validatorIdToRewardAddress(3))).eq(user3.address)

            // remove operator 3
            expect(await nodeOperatorRegistry.removeNodeOperator(validatorId3))
                .emit(stMATICMock, "WithdrawTotalDelegated")
                .emit(nodeOperatorRegistry, "RemoveNodeOperator")
                .withArgs(validatorId3, user3.address)
            expect((await nodeOperatorRegistry.getValidatorIds()).length).eq(0)
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
                .reverted
        })
    })

    describe("Remove Invalid Operator", async function () {
        it("Should fail to remove an operator that does not exist", async function () {
            // stake validators
            await stakeOperator(user1)

            const validatorId = 100
            // revert remove operator which not exist
            await expect(nodeOperatorRegistry.removeInvalidNodeOperator(validatorId))
                .revertedWith("Operator not found")
        })

        it("should fully remove an invalid operator", async function () {
            // stake validators
            await stakeOperator(user1)
            await stakeOperator(user2)
            await stakeOperator(user3)

            const validatorId1 = await stakeManagerMock.getValidatorId(user1.address)
            const validatorId2 = await stakeManagerMock.getValidatorId(user2.address)

            await nodeOperatorRegistry.addNodeOperator(validatorId1, user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId2, user2.address)

            await stakeManagerMock.unstake(validatorId1);
            expect(await nodeOperatorRegistry.removeInvalidNodeOperator(validatorId1))
                .emit(stMATICMock, "WithdrawTotalDelegated")
                .emit(nodeOperatorRegistry, "RemoveInvalidNodeOperator")
                .withArgs(validatorId1, user1.address)
            expect(await nodeOperatorRegistry.validatorIds(0)).eq(2)

            await stakeManagerMock.slash(validatorId2);
            await stakeManagerMock.unstake(validatorId2);

            expect(await nodeOperatorRegistry.removeInvalidNodeOperator(validatorId2))
                .emit(stMATICMock, "WithdrawTotalDelegated")
                .emit(nodeOperatorRegistry, "RemoveInvalidNodeOperator")
                .withArgs(validatorId2, user2.address)
        });

        it("should fail to remove an valid node operator", async function () {
            await stakeOperator(user1)
            await stakeOperator(user2)

            const validatorId1 = await stakeManagerMock.getValidatorId(user1.address)
            const validatorId2 = await stakeManagerMock.getValidatorId(user2.address)

            await nodeOperatorRegistry.addNodeOperator(validatorId1, user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId2, user2.address)

            await stakeManagerMock.updateCommissionRate(validatorId1, 20);
            await expect(nodeOperatorRegistry.removeInvalidNodeOperator(validatorId1))
                .revertedWith("Cannot remove valid operator.")

            await stakeManagerMock.slash(validatorId2);
            await stakeManagerMock.updateCommissionRate(validatorId2, 20);
            await expect(nodeOperatorRegistry.removeInvalidNodeOperator(validatorId2))
                .revertedWith("Cannot remove valid operator.")
        });
    })

    describe("St Matic Address", async function () {
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
                .reverted
        })
    })

    describe("Set Reward Address", async function () {
        it("Should set reward address", async function () {
            await stakeOperator(user1)
            const validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)

            expect(await nodeOperatorRegistry.connect(user1).setRewardAddress(user2.address))
                .emit(nodeOperatorRegistry, "SetRewardAddress")
                .withArgs(validatorId, user1.address, user2.address)
            expect(await nodeOperatorRegistry.validatorRewardAddressToId(user2.address))
                .eq(validatorId)
            expect(await nodeOperatorRegistry.validatorIdToRewardAddress(validatorId))
                .eq(user2.address)
            expect(await nodeOperatorRegistry.validatorRewardAddressToId(user1.address))
                .eq(0)
        })

        it("Should fail set reward address", async function () {
            await stakeOperator(user1)
            const validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)

            await expect(nodeOperatorRegistry.connect(user2).setRewardAddress(user2.address))
                .reverted

            await expect(nodeOperatorRegistry.connect(user1).setRewardAddress(user1.address))
                .revertedWith("Invalid reward address")

            await expect(nodeOperatorRegistry.connect(user1).setRewardAddress(ethers.constants.AddressZero))
                .revertedWith("Invalid reward address")

            await nodeOperatorRegistry.pause();
            await expect(nodeOperatorRegistry.connect(user1).setRewardAddress(user2.address))
                    .revertedWith("Pausable: paused")
        })
    })

    describe("List Delegated Node Operators", async function () {
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

            let allActiveOperators = await nodeOperatorRegistry.listDelegatedNodeOperators();
            expect(allActiveOperators.length).to.equal(3);

            const expectedRewardAddress = [user1.address, user2.address, user3.address];
            expect(allActiveOperators.length).to.equal(3);
            for (let idx = 0; idx < allActiveOperators.length; idx++) {
                expect(allActiveOperators[idx].rewardAddress).to.equal(expectedRewardAddress[idx]);
            }
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
            for (let idx = 0; idx < allActiveOperators.length; idx++) {
                expect(allActiveOperators[idx].rewardAddress).to.equal(expectedRewardAddress[idx]);
            }

            await stakeManagerMock.unstake(validatorId1);
            allActiveOperators = await nodeOperatorRegistry.listDelegatedNodeOperators();
            expect(allActiveOperators.length).to.equal(2);

            expectedRewardAddress = [user2.address, user3.address];
            for (let idx = 0; idx < allActiveOperators.length; idx++) {
                expect(allActiveOperators[idx].rewardAddress).to.equal(expectedRewardAddress[idx]);
            }

            await stakeManagerMock.slash(validatorId2);
            allActiveOperators = await nodeOperatorRegistry.listDelegatedNodeOperators();
            expect(allActiveOperators.length).to.equal(1);

            expectedRewardAddress = [user3.address];
            for (let idx = 0; idx < allActiveOperators.length; idx++) {
                expect(allActiveOperators[idx].rewardAddress).to.equal(expectedRewardAddress[idx]);
            }
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
            expect(allActiveOperators.length).eq(0);
        });

    })

    describe("List Withdraw Node Operators", async function () {
        it("should return an empty array if there is no withdrawal operator", async function () {
            await stakeOperator(user1)
            const validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)
            await nodeOperatorRegistry.removeNodeOperator(validatorId);

            const withdrawValidators = await nodeOperatorRegistry.listWithdrawNodeOperators();
            // const withdrawValidators = res[0]
            // const totalNodeOperators = res[1]
            expect(withdrawValidators.length).eq(0)
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
            const nodeOperators = await nodeOperatorRegistry.listWithdrawNodeOperators();
            expect(nodeOperators.length).to.equal(3);

            for (let idx = 0; idx < nodeOperators.length; idx++) {
                expect(nodeOperators[idx].rewardAddress).to.equal(expectedRewardAddress[idx]);
            }
        });
    })

    describe("Get Node Operator", async function () {
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
    })

    describe("Get Node Operator Status", async function () {
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
    })

    describe("Get Validator Delegation Amount", async function () {
        it("Should getValidatorDelegationAmount first delegation", async function () {
            await stakeOperator(user1)
            await stakeOperator(user2)
            await stakeOperator(user3)

            let validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)

            validatorId = await stakeManagerMock.getValidatorId(user2.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user2.address)

            validatorId = await stakeManagerMock.getValidatorId(user3.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user3.address)

            await nodeOperatorRegistry.setDistanceThreshold(100)
            await checkGetValidatorDelegationAmount("1", toEth("0"), {
                activeNodeOperatorsLength: 3,
                totalRatio: toEth("0"),
                operatorRatios: [],
                rewardAddresses: [
                    user1.address, user2.address, user3.address
                ]
            }, false)
        })

        it("Should getValidatorDelegationAmount When a validator has no delegation between validators with delegation", async function () {
            await stakeOperator(user1)
            await stakeOperator(user2)
            await stakeOperator(user3)
            await stakeOperator(user4)

            const validator1Stake = toEth("1200")
            const validator2Stake = toEth("500")
            const validator3Stake = toEth("0")
            const validator4Stake = toEth("100")

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

            await checkGetValidatorDelegationAmount("1", toEth("0"), {
                activeNodeOperatorsLength: 4,
                totalRatio: toEth("800"),
                operatorRatios: [
                    toEth("0"),
                    toEth("0"),
                    toEth("450"),
                    toEth("350"),
                ],
                rewardAddresses: [
                    user1.address, user2.address, user3.address, user4.address
                ]
            }, false)
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

            // Case 1: setDistanceThreshold = 100 this will ignore the validator 1 & 2
            await nodeOperatorRegistry.setDistanceThreshold(100)
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
            }, false)

            // Case 2: setDistanceThreshold = 150 this should ignore the validator 1 & 2
            await nodeOperatorRegistry.setDistanceThreshold(150)
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
            }, false)

            // Case 3: setDistanceThreshold = 1000 this should ignore the validator 1 & 2
            await nodeOperatorRegistry.setDistanceThreshold(1000)
            await checkGetValidatorDelegationAmount("3", toEth("0"), {
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
            }, false)

            // Case 4: setDistanceThreshold = 100 and slash validator 2
            await stakeManagerMock.slash(2)
            await nodeOperatorRegistry.setDistanceThreshold(100)

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
            }, false)
        })

        it("Should getValidatorDelegationAmount when system is balanced", async function () {
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

            await nodeOperatorRegistry.setDistanceThreshold(100)
            await checkGetValidatorDelegationAmount("1", toEth("0"), {
                activeNodeOperatorsLength: 3,
                totalRatio: toEth("0"),
                operatorRatios: [],
                rewardAddresses: [
                    user1.address, user2.address, user3.address
                ]
            }, false)
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

            await nodeOperatorRegistry.setDistanceThreshold(120)
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
            }, false)
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
            await nodeOperatorRegistry.setDistanceThreshold(120)

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
            }, false)

            // setDistanceThreshold to 200
            await nodeOperatorRegistry.setDistanceThreshold(200)
            await checkGetValidatorDelegationAmount("2", toEth("0"), {
                activeNodeOperatorsLength: 2,
                totalRatio: toEth("400"),
                operatorRatios: [
                    toEth("0"),
                    toEth("400")
                ],
                rewardAddresses: [
                    user1.address, user2.address
                ]
            }, false)
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

        it("Should fail getValidatorDelegationAmount when validators disable delegation", async function () {
            await stakeOperator(user1)
            await stakeOperator(user2)
            await stakeOperator(user3)

            let validatorShare: ValidatorShareMock;
            const validator1Stake = toEth("1200")
            const validator2Stake = toEth("500")
            const validator3Stake = toEth("100")

            let validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)
            await increaseStakeFor(validatorId, validator1Stake)

            validatorShare = await getValidatorShare(validatorId);
            await validatorShare.updateDelegation(false);

            validatorId = await stakeManagerMock.getValidatorId(user2.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user2.address)
            await increaseStakeFor(validatorId, validator2Stake)

            validatorShare = await getValidatorShare(validatorId);
            await validatorShare.updateDelegation(false);

            validatorId = await stakeManagerMock.getValidatorId(user3.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user3.address)
            await increaseStakeFor(validatorId, validator3Stake)

            validatorShare = await getValidatorShare(validatorId);
            await validatorShare.updateDelegation(false);

            await expect(nodeOperatorRegistry.getValidatorsDelegationAmount(toEth("0")))
                .revertedWith("There are no active validator")
        })

        it("Should fail getValidatorDelegationAmount", async function () {
            await expect(nodeOperatorRegistry.getValidatorsDelegationAmount(toEth("0")))
                .revertedWith("Not enough operators to delegate")

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
    })

    describe("Get Validator Rebalance Amount", async function () {
        it("Should getValidatorsRebalanceAmount When not balanced", async function () {
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

            await nodeOperatorRegistry.setDistanceThreshold(100)
            await nodeOperatorRegistry.setMaxWithdrawPercentagePerRebalance(100)

            await checkgetValidatorsRebalanceAmount("case-1", toEth("0"), {
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

            await nodeOperatorRegistry.setDistanceThreshold(100)
            await nodeOperatorRegistry.setMaxWithdrawPercentagePerRebalance(100)

            await checkgetValidatorsRebalanceAmount("case-1", toEth("30000"), {
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

            await checkgetValidatorsRebalanceAmount("case-1", toEth("30000"), {
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

        it("Should not getValidatorsRebalanceAmount When validator delegation is false ", async function () {
            await stakeOperator(user1)
            await stakeOperator(user2)
            await stakeOperator(user3)

            let validatorShare: ValidatorShareMock;
            const validator1Stake = toEth("20000")
            const validator2Stake = toEth("60000")
            const validator3Stake = toEth("1000")
            let validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)
            await increaseStakeFor(validatorId, validator1Stake)

            validatorShare = await getValidatorShare(validatorId);
            await validatorShare.updateDelegation(false);

            validatorId = await stakeManagerMock.getValidatorId(user2.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user2.address)
            await increaseStakeFor(validatorId, validator2Stake)

            validatorShare = await getValidatorShare(validatorId);
            await validatorShare.updateDelegation(false);

            validatorId = await stakeManagerMock.getValidatorId(user3.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user3.address)
            await increaseStakeFor(validatorId, validator3Stake)

            validatorShare = await getValidatorShare(validatorId);
            await validatorShare.updateDelegation(false);

            await nodeOperatorRegistry.setDistanceThreshold(100)
            await nodeOperatorRegistry.setMaxWithdrawPercentagePerRebalance(100)

            await expect(checkgetValidatorsRebalanceAmount("case-1", toEth("0"), {
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
            })).revertedWith("There are no active validator");
        })

        it("Should getValidatorsRebalanceAmount When validator delegation is false ", async function () {
            await stakeOperator(user1)
            await stakeOperator(user2)
            await stakeOperator(user3)

            let validatorShare: ValidatorShareMock;
            const validator1Stake = toEth("100")
            const validator2Stake = toEth("103")
            const validator3Stake = toEth("100")
            let validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)
            await increaseStakeFor(validatorId, validator1Stake)

            validatorShare = await getValidatorShare(validatorId);
            validatorId = await stakeManagerMock.getValidatorId(user2.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user2.address)
            await increaseStakeFor(validatorId, validator2Stake)

            validatorShare = await getValidatorShare(validatorId);

            validatorId = await stakeManagerMock.getValidatorId(user3.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user3.address)
            await increaseStakeFor(validatorId, validator3Stake)

            validatorShare = await getValidatorShare(validatorId);
            await nodeOperatorRegistry.setDistanceThreshold(103)
            await nodeOperatorRegistry.setMaxWithdrawPercentagePerRebalance(100)

            await expect(checkgetValidatorsRebalanceAmount("case-1", toEth("0"), {
                activeNodeOperatorsLength: 3,
                totalRatio: toEth("303"),
                operatorRatios: [
                    toEth("0"),
                    toEth("1"),
                    toEth("0"),
                ],
                rewardAddresses: [
                    user1.address, user2.address, user3.address
                ],
                totalToWithdraw: toEth("2")
            })).revertedWith("The system is balanced");
        })

        it("Should fail getValidatorsRebalanceAmount not enough operators", async function () {
            await nodeOperatorRegistry.setDistanceThreshold(120)
            await expect(nodeOperatorRegistry.getValidatorsRebalanceAmount(toEth("0")))
                .revertedWith("Not enough operator to rebalance")
        })

        it("Should fail getValidatorsRebalanceAmount totalStaked == 0", async function () {
            await stakeOperator(user1)
            await stakeOperator(user2)
            await stakeOperator(user3)

            let validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)

            validatorId = await stakeManagerMock.getValidatorId(user2.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user2.address)

            validatorId = await stakeManagerMock.getValidatorId(user3.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user3.address)

            await nodeOperatorRegistry.setDistanceThreshold(120)
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

            await nodeOperatorRegistry.setDistanceThreshold(120)
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

            await nodeOperatorRegistry.setDistanceThreshold(100)
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
                await nodeOperatorRegistry.setDistanceThreshold(minRebalanceDistanceThreshold[idx])
                await nodeOperatorRegistry.setMaxWithdrawPercentagePerRebalance(maxWithdrawPercentagePerRebalance[idx])

                let expectedTotalRatio = toEth(expectedTotalRatios[idx])
                let totalToWithdraw = expectedTotalRatio.sub(totalBuffered).mul(maxWithdrawPercentagePerRebalance[idx]).div(100)

                await checkgetValidatorsRebalanceAmount("case-" + idx, totalBuffered, {
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
    })

    describe("Get Validators Request Withdraw", async function () {
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

            await nodeOperatorRegistry.setDistanceThreshold(100)
            await nodeOperatorRegistry.setMinRequestWithdrawRange(20)
            await checkRequestWithdraw("1", false, toEth("100"), {
                activeNodeOperatorsLength: 3,
                totalDelegated: toEth("3000"),
                operatorAmountCanBeRequested: [],
                bigNodeOperatorIds: [],
                smallNodeOperatorIds: [],
                rewardAddresses: [user1.address, user2.address, user3.address],
                totalValidatorToWithdrawFrom: 1,
            })
        })

        it("getValidatorsRequestWithdraw when system is unbalanced", async function () {
            const stakePerValidator = [toEth("1500"), toEth("1100"), toEth("1200"), toEth("1000"), toEth("1200"), toEth("1300")]
            for (let i = 0; i < 6; i++) {
                await stakeOperator(accounts[i])
                let validatorId = await stakeManagerMock.getValidatorId(accounts[i].address)
                await nodeOperatorRegistry.addNodeOperator(validatorId, accounts[i].address)
                await increaseStakeFor(validatorId, stakePerValidator[i])
            }           

            await nodeOperatorRegistry.setDistanceThreshold(102)
            await nodeOperatorRegistry.setMinRequestWithdrawRange(20)
            await checkRequestWithdraw("1", false, toEth("700"), {
                activeNodeOperatorsLength: 6,
                totalDelegated: toEth("7300"),
                operatorAmountCanBeRequested: [
                    toEth("500"),
                    toEth("100"),
                    toEth("200"),
                    toEth("0"),
                    toEth("200"),
                    toEth("300")
                ],
                bigNodeOperatorIds: [0, 5],
                smallNodeOperatorIds: [1, 2, 3, 4],
                rewardAddresses: [
                    accounts[0].address,
                    accounts[1].address,
                    accounts[2].address,
                    accounts[3].address,
                    accounts[4].address,
                    accounts[5].address,
                ],
                totalValidatorToWithdrawFrom: 0,
            })
        })

        it("getValidatorsRequestWithdraw when system is unbalanced", async function () {
            const stakePerValidator = [toEth("1500"), toEth("1100"), toEth("1300")]
            for (let i = 0; i < stakePerValidator.length; i++) {
                await stakeOperator(accounts[i])
                let validatorId = await stakeManagerMock.getValidatorId(accounts[i].address)
                await nodeOperatorRegistry.addNodeOperator(validatorId, accounts[i].address)
                await increaseStakeFor(validatorId, stakePerValidator[i])
            }           

            await nodeOperatorRegistry.setDistanceThreshold(100)
            await nodeOperatorRegistry.setMinRequestWithdrawRange(20)
            await checkRequestWithdraw("1", false, toEth("900"), {
                activeNodeOperatorsLength: 3,
                totalDelegated: toEth("3900"),
                operatorAmountCanBeRequested: [
                    toEth("500"),
                    toEth("100"),
                    toEth("300"),
                ],
                bigNodeOperatorIds: [0],
                smallNodeOperatorIds: [1, 2],
                rewardAddresses: [
                    accounts[0].address,
                    accounts[1].address,
                    accounts[2].address,
                ],
                totalValidatorToWithdrawFrom: 0,
            })
        })

        it("getValidatorsRequestWithdraw when user request huge amount when protocol not balances", async function () {
            const stakePerValidator = [toEth("1150"), toEth("1400"), toEth("1200"), toEth("1250"), toEth("1200"), toEth("1300")]
            for (let i = 0; i < 6; i++) {
                await stakeOperator(accounts[i])
                let validatorId = await stakeManagerMock.getValidatorId(accounts[i].address)
                await nodeOperatorRegistry.addNodeOperator(validatorId, accounts[i].address)
                await increaseStakeFor(validatorId, stakePerValidator[i])
            }           

            await nodeOperatorRegistry.setDistanceThreshold(102)
            await nodeOperatorRegistry.setMinRequestWithdrawRange(20)
            await checkRequestWithdraw("1", false, toEth("3300"), {
                activeNodeOperatorsLength: 6,
                totalDelegated: toEth("7500"),
                operatorAmountCanBeRequested: [
                    toEth("450"),
                    toEth("700"),
                    toEth("500"),
                    toEth("550"),
                    toEth("500"),
                    toEth("600")
                ],
                bigNodeOperatorIds: [1, 5],
                smallNodeOperatorIds: [0, 2, 3, 4],
                rewardAddresses: [
                    accounts[0].address,
                    accounts[1].address,
                    accounts[2].address,
                    accounts[3].address,
                    accounts[4].address,
                    accounts[5].address,
                ],
                totalValidatorToWithdrawFrom: 0,
            })
        })

        it("getValidatorsRequestWithdraw when user request huge amount but validators are balanced", async function () {
            const stakePerValidator = [toEth("1200"), toEth("1220"), toEth("1230"), toEth("1240"), toEth("1210"), toEth("1220")]
            for (let i = 0; i < 6; i++) {
                await stakeOperator(accounts[i])
                let validatorId = await stakeManagerMock.getValidatorId(accounts[i].address)
                await nodeOperatorRegistry.addNodeOperator(validatorId, accounts[i].address)
                await increaseStakeFor(validatorId, stakePerValidator[i])
            }           

            await nodeOperatorRegistry.setDistanceThreshold(102)
            await nodeOperatorRegistry.setMinRequestWithdrawRange(20)

            await checkRequestWithdraw("1", false, toEth("4320"), {
                activeNodeOperatorsLength: 6,
                totalDelegated: toEth("7320"),
                operatorAmountCanBeRequested:[
                    toEth("700"),
                    toEth("720"),
                    toEth("730"),
                    toEth("740"),
                    toEth("710"),
                    toEth("720")
                ],
                bigNodeOperatorIds: [2, 3],
                smallNodeOperatorIds: [0, 1, 4, 5],
                rewardAddresses: [
                    accounts[0].address,
                    accounts[1].address,
                    accounts[2].address,
                    accounts[3].address,
                    accounts[4].address,
                    accounts[5].address,
                ],
                totalValidatorToWithdrawFrom: 0,
            }, (res:any, withdrawAmount:any) => checkIfCover(res, withdrawAmount))

        })

        it("getValidatorsRequestWithdraw when system is balanced by setDistanceThreshold", async function () {
            await stakeOperator(user1)
            await stakeOperator(user2)
            await stakeOperator(user3)

            const validator1Stake = toEth("1000")
            const validator2Stake = toEth("1200")
            const validator3Stake = toEth("1100")

            let validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)
            await increaseStakeFor(validatorId, validator1Stake)

            validatorId = await stakeManagerMock.getValidatorId(user2.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user2.address)
            await increaseStakeFor(validatorId, validator2Stake)

            validatorId = await stakeManagerMock.getValidatorId(user3.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user3.address)
            await increaseStakeFor(validatorId, validator3Stake)

            await nodeOperatorRegistry.setDistanceThreshold(125)
            await nodeOperatorRegistry.setMinRequestWithdrawRange(25)
            await checkRequestWithdraw("1", false, toEth("3150"), {
                activeNodeOperatorsLength: 3,
                totalDelegated: toEth("3300"),
                operatorAmountCanBeRequested: [toEth("950"), toEth("1150"), toEth("1050")],
                bigNodeOperatorIds: [1],
                smallNodeOperatorIds: [0, 2],
                rewardAddresses: [user1.address, user2.address, user3.address],
                totalValidatorToWithdrawFrom: 0,
            }, (res:any, withdrawAmount:any) => checkIfCover(res, withdrawAmount))
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

            await nodeOperatorRegistry.setDistanceThreshold(100)
            await nodeOperatorRegistry.setMinRequestWithdrawRange(100)
            await checkRequestWithdraw("1", false, toEth("3"), {
                activeNodeOperatorsLength: 3,
                totalDelegated: toEth("3000"),
                bigNodeOperatorIds: [],
                smallNodeOperatorIds: [],
                operatorAmountCanBeRequested: [],
                rewardAddresses: [user1.address, user2.address, user3.address],
                totalValidatorToWithdrawFrom: 3,
            }, (res:any, withdrawAmount:any) => checkIfCover(res, withdrawAmount))
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

            await nodeOperatorRegistry.setDistanceThreshold(100)
            await checkRequestWithdraw("1", false, toEth("100"), {
                activeNodeOperatorsLength: 3,
                totalDelegated: toEth("2400"),
                bigNodeOperatorIds: [0, 1],
                smallNodeOperatorIds: [2],
                operatorAmountCanBeRequested: [toEth("600"), toEth("600"), toEth("0")],
                rewardAddresses: [user1.address, user2.address, user3.address],
                totalValidatorToWithdrawFrom: 0,
            }, (res:any, withdrawAmount:any) => checkIfCover(res, withdrawAmount))
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

            await nodeOperatorRegistry.setDistanceThreshold(100)
            await checkRequestWithdraw("1", false, toEth("300"), {
                activeNodeOperatorsLength: 3,
                totalDelegated: toEth("1800"),
                bigNodeOperatorIds: [0, 1],
                smallNodeOperatorIds: [2],
                operatorAmountCanBeRequested: [toEth("1000"), toEth("800"), toEth("0")],
                rewardAddresses: [user1.address, user2.address, user3.address],
                totalValidatorToWithdrawFrom: 0,
            }, (res:any, withdrawAmount:any) => checkIfCover(res, withdrawAmount))
        })

        it("getValidatorsRequestWithdraw when there is one no active validator", async function () {
            await stakeOperator(user1)
            await stakeOperator(user2)
            await stakeOperator(user3)

            const validator1Stake = toEth("1000")
            const validator2Stake = toEth("0")
            const validator3Stake = toEth("800")

            let validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)
            await increaseStakeFor(validatorId, validator1Stake)

            validatorId = await stakeManagerMock.getValidatorId(user2.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user2.address)
            await increaseStakeFor(validatorId, validator2Stake)

            validatorId = await stakeManagerMock.getValidatorId(user3.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user3.address)
            await increaseStakeFor(validatorId, validator3Stake)

            await stakeManagerMock.setValidatorStatus(2, 0)
            expect((await stakeManagerMock.validators(2)).status).eq(0)

            await nodeOperatorRegistry.setDistanceThreshold(100)
            await checkRequestWithdraw("1", false, toEth("300"), {
                activeNodeOperatorsLength: 2,
                totalDelegated: toEth("1800"),
                bigNodeOperatorIds: [0],
                smallNodeOperatorIds: [1],
                operatorAmountCanBeRequested: [toEth("250"), toEth("50")],
                rewardAddresses: [user1.address, user3.address],
                totalValidatorToWithdrawFrom: 0,
            }, (res:any, withdrawAmount:any) => checkIfCover(res, withdrawAmount))
        })

        it("getValidatorsRequestWithdraw when there is one validator with zero delegation", async function () {
            await stakeOperator(user1)
            await stakeOperator(user2)
            await stakeOperator(user3)

            const validator1Stake = toEth("1000")
            const validator2Stake = toEth("0")
            const validator3Stake = toEth("800")

            let validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)
            await increaseStakeFor(validatorId, validator1Stake)

            validatorId = await stakeManagerMock.getValidatorId(user2.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user2.address)
            await increaseStakeFor(validatorId, validator2Stake)

            validatorId = await stakeManagerMock.getValidatorId(user3.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user3.address)
            await increaseStakeFor(validatorId, validator3Stake)

            await nodeOperatorRegistry.setDistanceThreshold(100)
            await checkRequestWithdraw("1", false, toEth("300"), {
                activeNodeOperatorsLength: 3,
                totalDelegated: toEth("1800"),
                bigNodeOperatorIds: [0, 2],
                smallNodeOperatorIds: [1],
                operatorAmountCanBeRequested: [toEth("1000"), toEth("0"), toEth("800")],
                rewardAddresses: [user1.address, user2.address, user3.address],
                totalValidatorToWithdrawFrom: 0,
            }, (res:any, withdrawAmount:any) => checkIfCover(res, withdrawAmount))
        })

        it("getValidatorsRequestWithdraw when system is balanced with MinRequestWithdrawDistanceThreshold = 50%", async function () {
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

            await nodeOperatorRegistry.setDistanceThreshold(200)
            await nodeOperatorRegistry.setMinRequestWithdrawRange(25)

            await checkRequestWithdraw("1", false, toEth("300"), {
                activeNodeOperatorsLength: 3,
                totalDelegated: toEth("2400"),
                bigNodeOperatorIds: [],
                smallNodeOperatorIds: [],
                operatorAmountCanBeRequested: [],
                rewardAddresses: [user1.address, user2.address, user3.address],
                totalValidatorToWithdrawFrom: 2,
            }, (res:any, withdrawAmount:any) => checkIfCover(res, withdrawAmount))
        })

        it("getValidatorsRequestWithdraw when system is balanced with amount requested = 80%", async function () {
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

            await nodeOperatorRegistry.setDistanceThreshold(120)
            await nodeOperatorRegistry.setMinRequestWithdrawRange(25)

            await checkRequestWithdraw("1", false, toEth("1920"), {
                activeNodeOperatorsLength: 3,
                totalDelegated: toEth("2400"),
                bigNodeOperatorIds: [0, 1],
                smallNodeOperatorIds: [2],
                operatorAmountCanBeRequested: [toEth("840"), toEth("740"), toEth("340")],
                rewardAddresses: [user1.address, user2.address, user3.address],
                totalValidatorToWithdrawFrom: 0,
            }, (res:any, withdrawAmount:any) => checkIfCover(res, withdrawAmount))
        })

        it("getValidatorsRequestWithdraw when system is balanced with a jailed an unstaked validator", async function () {
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
            await stakeManagerMock.slash(1)
            await stakeManagerMock.unstake(2)

            await nodeOperatorRegistry.setDistanceThreshold(120)
            await nodeOperatorRegistry.setMinRequestWithdrawRange(25)

            await checkRequestWithdraw("1", false, toEth("300"), {
                activeNodeOperatorsLength: 3,
                totalDelegated: toEth("3000"),
                bigNodeOperatorIds: [],
                smallNodeOperatorIds: [],
                operatorAmountCanBeRequested: [],
                rewardAddresses: [user1.address, user2.address, user3.address],
                totalValidatorToWithdrawFrom: 2,
            }, (res:any, withdrawAmount:any) => checkIfCover(res, withdrawAmount))
        })

        it("getValidatorsRequestWithdraw when system is not balanced with a jailed an unstaked validator", async function () {
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
            await stakeManagerMock.slash(1)
            await stakeManagerMock.unstake(2)

            await nodeOperatorRegistry.setDistanceThreshold(120)
            await nodeOperatorRegistry.setMinRequestWithdrawRange(25)

            await checkRequestWithdraw("1", false, toEth("900"), {
                activeNodeOperatorsLength: 3,
                totalDelegated: toEth("2400"),
                bigNodeOperatorIds: [0, 1],
                smallNodeOperatorIds: [2],
                operatorAmountCanBeRequested: [toEth("500"), toEth("400"), toEth("0")],
                rewardAddresses: [user1.address, user2.address, user3.address],
                totalValidatorToWithdrawFrom: 0,
            }, (res:any, withdrawAmount:any) => checkIfCover(res, withdrawAmount))
        })

        it("getValidatorsRequestWithdraw when system there are no operators", async function () {
            await checkRequestWithdraw("1", false, toEth("100"), {
                activeNodeOperatorsLength: 0,
                totalDelegated: toEth("0"),
                bigNodeOperatorIds: [],
                smallNodeOperatorIds: [],
                operatorAmountCanBeRequested: [],
                rewardAddresses: [],
                totalValidatorToWithdrawFrom: 0,
            })
        })

        it("getValidatorsRequestWithdraw when system there are no delegation", async function () {
            await stakeOperator(user1)
            await stakeOperator(user2)
            await stakeOperator(user3)

            const validator1Stake = toEth("0")
            const validator2Stake = toEth("0")
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

            await nodeOperatorRegistry.setDistanceThreshold(120)
            await nodeOperatorRegistry.setMinRequestWithdrawRange(25)

            await checkRequestWithdraw("1", false, toEth("100"), {
                activeNodeOperatorsLength: 3,
                totalDelegated: toEth("0"),
                bigNodeOperatorIds: [],
                smallNodeOperatorIds: [],
                operatorAmountCanBeRequested: [],
                rewardAddresses: [user1.address, user2.address, user3.address],
                totalValidatorToWithdrawFrom: 0,
            })
        })

        it("getValidatorsRequestWithdraw when withdraw more than delegated in balanced system", async function () {
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

            await nodeOperatorRegistry.setDistanceThreshold(120)
            await nodeOperatorRegistry.setMinRequestWithdrawRange(25)

            await checkRequestWithdraw("1", false, toEth("5000"), {
                activeNodeOperatorsLength: 3,
                totalDelegated: toEth("3000"),
                bigNodeOperatorIds: [],
                smallNodeOperatorIds: [0, 1, 2],
                operatorAmountCanBeRequested: [toEth("1000"), toEth("1000"), toEth("1000")],
                rewardAddresses: [user1.address, user2.address, user3.address],
                totalValidatorToWithdrawFrom: 0,
            })
        })

        it("getValidatorsRequestWithdraw withdraw all the delegated tokens from validators when the protocol is not balanced", async function () {
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

            await nodeOperatorRegistry.setDistanceThreshold(120)

            await checkRequestWithdraw("1", false, toEth("2400"), {
                activeNodeOperatorsLength: 3,
                totalDelegated: toEth("2400"),
                bigNodeOperatorIds: [0, 1],
                smallNodeOperatorIds: [2],
                operatorAmountCanBeRequested: [toEth("1000"), toEth("900"), toEth("500")],
                rewardAddresses: [user1.address, user2.address, user3.address],
                totalValidatorToWithdrawFrom: 0,
            }, (res:any, withdrawAmount:any) => checkIfCover(res, withdrawAmount))
        })

        it("getValidatorsRequestWithdraw when withdraw more than delegated in not balanced system", async function () {
            await stakeOperator(user1)
            await stakeOperator(user2)
            await stakeOperator(user3)
            await stakeOperator(user4)

            const validator1Stake = toEth("200")
            const validator2Stake = toEth("600")
            const validator3Stake = toEth("1000")
            const validator4Stake = toEth("1000")

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

            await nodeOperatorRegistry.setDistanceThreshold(120)

            await checkRequestWithdraw("1", false, toEth("10000"), {
                activeNodeOperatorsLength: 4,
                totalDelegated: toEth("2800"),
                bigNodeOperatorIds: [2, 3],
                smallNodeOperatorIds: [0, 1],
                operatorAmountCanBeRequested: [toEth("200"), toEth("600"), toEth("1000"), toEth("1000")],
                rewardAddresses: [user1.address, user2.address, user3.address, user4.address],
                totalValidatorToWithdrawFrom: 0,
            })
        })
    })

    describe("Check Stats", async function () {
        it("Should checkStats", async function () {
            await stakeOperator(user1)
            await stakeOperator(user3)
            await stakeOperator(user2)
            await stakeOperator(user4)

            let validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)

            validatorId = await stakeManagerMock.getValidatorId(user2.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user2.address)

            validatorId = await stakeManagerMock.getValidatorId(user3.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user3.address)

            validatorId = await stakeManagerMock.getValidatorId(user4.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user4.address)

            await checkStats("1", {
                inactiveNodeOperator: 0,
                activeNodeOperator: 4,
                jailedNodeOperator: 0,
                ejectedNodeOperator: 0,
                unstakedNodeOperator: 0,
            }, false)

            // unstake a validator
            await stakeManagerMock.unstake(1)
            await checkStats("2", {
                inactiveNodeOperator: 0,
                activeNodeOperator: 3,
                jailedNodeOperator: 0,
                ejectedNodeOperator: 1,
                unstakedNodeOperator: 0,
            }, false)

            // slash a validator
            await stakeManagerMock.slash(2)
            await checkStats("3", {
                inactiveNodeOperator: 0,
                activeNodeOperator: 2,
                jailedNodeOperator: 1,
                ejectedNodeOperator: 1,
                unstakedNodeOperator: 0,
            }, false)

            // slash a validator
            await stakeManagerMock.unstakeClaim(3)
            await checkStats("4", {
                inactiveNodeOperator: 0,
                activeNodeOperator: 1,
                jailedNodeOperator: 1,
                ejectedNodeOperator: 1,
                unstakedNodeOperator: 1,
            }, false)

            // unstake a jailed validator
            await stakeManagerMock.unstake(2)
            await checkStats("5", {
                inactiveNodeOperator: 0,
                activeNodeOperator: 1,
                jailedNodeOperator: 0,
                ejectedNodeOperator: 2,
                unstakedNodeOperator: 1,
            }, false)

            // claim all validators
            await stakeManagerMock.unstakeClaim(1)
            await stakeManagerMock.unstakeClaim(2)
            await stakeManagerMock.unstakeClaim(4)
            await checkStats("6", {
                inactiveNodeOperator: 0,
                activeNodeOperator: 0,
                jailedNodeOperator: 0,
                ejectedNodeOperator: 0,
                unstakedNodeOperator: 4,
            }, false)
        })
    })

    describe("Roles", async function () {
        it("Should check roles", async function () {
            const DAO_ROLE = await nodeOperatorRegistry.DAO_ROLE()
            const DEFAULT_ADMIN_ROLE = await nodeOperatorRegistry.DEFAULT_ADMIN_ROLE()
            const PAUSE_ROLE = await nodeOperatorRegistry.PAUSE_ROLE()
            expect(await nodeOperatorRegistry.hasRole(DAO_ROLE, accounts[0].address), "1-DAO_ROLE").true
            expect(await nodeOperatorRegistry.hasRole(DEFAULT_ADMIN_ROLE, accounts[0].address), "2-DEFAULT_ADMIN_ROLE").true
            expect(await nodeOperatorRegistry.hasRole(PAUSE_ROLE, accounts[0].address), "2-PAUSE_ROLE").true
        })

        it("Should grant/revoke roles", async function () {
            const DAO_ROLE = await nodeOperatorRegistry.DAO_ROLE()
            const DEFAULT_ADMIN_ROLE = await nodeOperatorRegistry.DEFAULT_ADMIN_ROLE()
            const PAUSE_ROLE = await nodeOperatorRegistry.PAUSE_ROLE()
            expect(await nodeOperatorRegistry.hasRole(DAO_ROLE, accounts[0].address), "1-DAO_ROLE").true
            expect(await nodeOperatorRegistry.hasRole(DEFAULT_ADMIN_ROLE, accounts[0].address), "1-DEFAULT_ADMIN_ROLE").true
            expect(await nodeOperatorRegistry.hasRole(PAUSE_ROLE, accounts[0].address), "1-PAUSE_ROLE").true

            await nodeOperatorRegistry.grantRole(DAO_ROLE, user1.address)
            await nodeOperatorRegistry.grantRole(DEFAULT_ADMIN_ROLE, user2.address)
            await nodeOperatorRegistry.grantRole(PAUSE_ROLE, user3.address)

            expect(await nodeOperatorRegistry.hasRole(DAO_ROLE, user1.address), "2-DAO_ROLE").true
            expect(await nodeOperatorRegistry.hasRole(DEFAULT_ADMIN_ROLE, user2.address), "2-DEFAULT_ADMIN_ROLE").true
            expect(await nodeOperatorRegistry.hasRole(PAUSE_ROLE, user3.address), "1-PAUSE_ROLE").true

            await nodeOperatorRegistry.revokeRole(DAO_ROLE, user1.address)
            await nodeOperatorRegistry.revokeRole(DEFAULT_ADMIN_ROLE, user2.address)
            await nodeOperatorRegistry.revokeRole(PAUSE_ROLE, user3.address)

            expect(await nodeOperatorRegistry.hasRole(DAO_ROLE, user1.address), "3-DAO_ROLE").false
            expect(await nodeOperatorRegistry.hasRole(DEFAULT_ADMIN_ROLE, user2.address), "3-DEFAULT_ADMIN_ROLE").false
            expect(await nodeOperatorRegistry.hasRole(PAUSE_ROLE, user3.address), "3-PAUSE_ROLE").false
        })

        it("Should fail grant/revoke roles", async function () {
            const DAO_ROLE = await nodeOperatorRegistry.DAO_ROLE()
            const DEFAULT_ADMIN_ROLE = await nodeOperatorRegistry.DEFAULT_ADMIN_ROLE()
            expect(await nodeOperatorRegistry.hasRole(DEFAULT_ADMIN_ROLE, user1.address), "1-DEFAULT_ADMIN_ROLE").false

            await expect(nodeOperatorRegistry.connect(user1).grantRole(DEFAULT_ADMIN_ROLE, user2.address)).reverted
            await expect(nodeOperatorRegistry.connect(user1).revokeRole(DEFAULT_ADMIN_ROLE, accounts[0].address)).reverted
        })
    })

    describe("Get Protocol Stats", async function () {
        it("Get Protocol Stats when protocol not balanced", async function () {
            await stakeOperator(user1)
            await stakeOperator(user3)
            await stakeOperator(user2)
            await stakeOperator(user4)

            const validator1Stake = toEth("200")
            const validator2Stake = toEth("600")
            const validator3Stake = toEth("1000")
            const validator4Stake = toEth("900")

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

            await nodeOperatorRegistry.setDistanceThreshold(120)
            const res = await nodeOperatorRegistry.getProtocolStats()
            expect(res.isBalanced, "isBalanced").eq(false)
            expect(res.maxAmount, "maxAmount").eq(validator3Stake)
            expect(res.minAmount, "minAmount").eq(validator1Stake)
            expect(res.distanceMinMaxStake, "minAmount")
                .eq(validator3Stake.mul(100).div(validator1Stake))
        })

        it("Get Protocol Stats when protocol is balanced", async function () {
            await stakeOperator(user1)
            await stakeOperator(user3)
            await stakeOperator(user2)
            await stakeOperator(user4)

            const validator1Stake = toEth("990")
            const validator2Stake = toEth("1000")
            const validator3Stake = toEth("1050")
            const validator4Stake = toEth("1000")

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

            await nodeOperatorRegistry.setDistanceThreshold(120)
            const res = await nodeOperatorRegistry.getProtocolStats()
            expect(res.isBalanced, "isBalanced").eq(true)
            expect(res.maxAmount, "maxAmount").eq(validator3Stake)
            expect(res.minAmount, "minAmount").eq(validator1Stake)
            expect(res.distanceMinMaxStake, "minAmount")
                .eq(validator3Stake.mul(100).div(validator1Stake))
        })

        it("Get Protocol Stats when protocol is not balanced with empty validator", async function () {
            await stakeOperator(user1)
            await stakeOperator(user3)
            await stakeOperator(user2)
            await stakeOperator(user4)

            const validator1Stake = toEth("990")
            const validator2Stake = toEth("1000")
            const validator3Stake = toEth("0")
            const validator4Stake = toEth("1200")

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

            await nodeOperatorRegistry.setDistanceThreshold(120)
            const res = await nodeOperatorRegistry.getProtocolStats()
            expect(res.isBalanced, "isBalanced").eq(false)
            expect(res.maxAmount, "maxAmount").eq(validator4Stake)
            expect(res.minAmount, "minAmount").eq(0)
            expect(res.distanceMinMaxStake, "minAmount").eq(validator4Stake.mul(100))
        })
    })

    describe("Pause Unpause", async function () {
        it("Should pause/unpause the contract", async function () {
            await stakeOperator(user1)
            await stakeOperator(user2)

            let validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)
            await stakeManagerMock.unstake(validatorId)

            validatorId = await stakeManagerMock.getValidatorId(user2.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user2.address)
            await stakeManagerMock.unstake(validatorId)
            await nodeOperatorRegistry.removeInvalidNodeOperator(1)

            expect(await nodeOperatorRegistry.paused()).false
            await nodeOperatorRegistry.pause()
            expect(await nodeOperatorRegistry.paused()).true
            await expect(nodeOperatorRegistry.removeInvalidNodeOperator(2)).revertedWith("Pausable: paused")

            await nodeOperatorRegistry.unpause()
            expect(await nodeOperatorRegistry.paused()).false
            await nodeOperatorRegistry.removeInvalidNodeOperator(2)
        })

        it("Should fail pause/unpause the contract", async function () {
            const PAUSE_ROLE = await nodeOperatorRegistry.PAUSE_ROLE()
            expect(await nodeOperatorRegistry.paused()).false
            await expect(nodeOperatorRegistry.connect(user1).pause()).revertedWith("AccessControl")
            await nodeOperatorRegistry.grantRole(PAUSE_ROLE, user1.address)
            await nodeOperatorRegistry.pause()
            expect(await nodeOperatorRegistry.paused()).true
            await nodeOperatorRegistry.revokeRole(PAUSE_ROLE, user1.address)
            await expect(nodeOperatorRegistry.connect(user1).pause()).revertedWith("AccessControl")
        })
    })

    describe("DAO setters", async () => {
        it("Should set setDistanceThreshold", async function () {
            const newDistanceThreshold = 123
            expect(await nodeOperatorRegistry.setDistanceThreshold(newDistanceThreshold))
                .emit(nodeOperatorRegistry, "SetDistanceThreshold")
                .withArgs(100, newDistanceThreshold)
        })

        it("Should fail set setDistanceThreshold", async function () {
            const newDistanceThreshold = 50
            await expect(nodeOperatorRegistry.setDistanceThreshold(newDistanceThreshold))
                .revertedWith("Invalid distance threshold")
        })

        it("Should setMinRequestWithdrawRange", async function () {
            const newMinRequestWithdrawRange = 25
            expect(await nodeOperatorRegistry.setMinRequestWithdrawRange(newMinRequestWithdrawRange))
                .emit(nodeOperatorRegistry, "SetMinRequestWithdrawRange")
                .withArgs(15, newMinRequestWithdrawRange)
        })

        it("Should fail setMinRequestWithdrawRange", async function () {
            const newMinRequestWithdrawRange = 150
            await expect(nodeOperatorRegistry.setMinRequestWithdrawRange(newMinRequestWithdrawRange))
                .revertedWith("Invalid minRequestWithdrawRange")
        })

        it("Should setMaxWithdrawPercentagePerRebalance", async function () {
            const newMaxWithdrawPercentagePerRebalance = 80
            expect(await nodeOperatorRegistry.setMaxWithdrawPercentagePerRebalance(newMaxWithdrawPercentagePerRebalance))
                .emit(nodeOperatorRegistry, "SetMaxWithdrawPercentagePerRebalance")
                .withArgs(20, newMaxWithdrawPercentagePerRebalance)
        })

        it("Should fail setMaxWithdrawPercentagePerRebalance", async function () {
            const newMaxWithdrawPercentagePerRebalance = 150
            await expect(nodeOperatorRegistry.setMaxWithdrawPercentagePerRebalance(newMaxWithdrawPercentagePerRebalance))
                .revertedWith("Invalid maxWithdrawPercentagePerRebalance")
        })

        it("Should set version", async function () {
            const oldVersion = "2.0.0"
            const newVersion = "2.0.1"
            expect(await nodeOperatorRegistry.setVersion(newVersion))
                .emit(nodeOperatorRegistry, "SetVersion")
                .withArgs(oldVersion, newVersion)
        })

        it("Should fail to set version", async function () {
            const newVersion = "2.0.1"
            await expect(nodeOperatorRegistry.connect(user2).setVersion(newVersion))
                .reverted
        })
    })
});

async function checkStats(id: string, data: {
    inactiveNodeOperator: number,
    activeNodeOperator: number,
    jailedNodeOperator: number,
    ejectedNodeOperator: number,
    unstakedNodeOperator: number,
}, log: boolean) {
    const res = await nodeOperatorRegistry.getStats()
    if (log) {
        console.log(res)
    }
    expect(res.inactiveNodeOperator, id + "--inactiveNodeOperator").eq(data.inactiveNodeOperator)
    expect(res.activeNodeOperator, id + "--activeNodeOperator").eq(data.activeNodeOperator)
    expect(res.jailedNodeOperator, id + "--jailedNodeOperator").eq(data.jailedNodeOperator)
    expect(res.ejectedNodeOperator, id + "--ejectedNodeOperator").eq(data.ejectedNodeOperator)
    expect(res.unstakedNodeOperator, id + "--unstakedNodeOperator").eq(data.unstakedNodeOperator)
}

async function checkRequestWithdraw(id: string, log: boolean, withdrawAmount: BigNumber, data: {
    activeNodeOperatorsLength: number,
    operatorAmountCanBeRequested: Array<BigNumber>,
    totalDelegated: BigNumber,
    bigNodeOperatorIds: Array<number>,
    smallNodeOperatorIds: Array<number>,
    rewardAddresses: Array<string>,
    totalValidatorToWithdrawFrom: number,
}, callback?: Function) {
    const res = await nodeOperatorRegistry.getValidatorsRequestWithdraw(withdrawAmount)
    if (log) {
        console.log(res)
    }
    expect(res.validators.length, `${id}--nodeOperators`).eq(data.activeNodeOperatorsLength)
    expect(res.bigNodeOperatorIds.length, `${id}--bigNodeOperatorLength`).eq(data.bigNodeOperatorIds.length)
    expect(res.smallNodeOperatorIds.length, `${id}--smallNodeOperatorLength`).eq(data.smallNodeOperatorIds.length)

    for (let idx = 0; idx < res.bigNodeOperatorIds.length; idx++) {
        expect(res.bigNodeOperatorIds[idx], `${id}--${idx}--bigNodeOperatorIds`).eq(data.bigNodeOperatorIds[idx])
    }

    for (let idx = 0; idx < res.smallNodeOperatorIds.length; idx++) {
        expect(res.smallNodeOperatorIds[idx], `${id}--${idx}--smallNodeOperatorIds`).eq(data.smallNodeOperatorIds[idx])
    }

    expect(res.totalValidatorToWithdrawFrom, `${id}--totalValidatorToWithdrawFrom`).eq(data.totalValidatorToWithdrawFrom)
    expect(res.totalDelegated, `${id}--totalDelegated`).eq(data.totalDelegated)

    expect(res.operatorAmountCanBeRequested.length, `${id}--res.operatorAmountCanBeRequested.length`).eq(data.operatorAmountCanBeRequested.length)
    for (let idx = 0; idx < res.operatorAmountCanBeRequested.length; idx++) {
        expect(res.operatorAmountCanBeRequested[idx], `${id}--${idx}--operatorAmountCanBeRequested`).eq(data.operatorAmountCanBeRequested[idx])
    }

    expect(res.validators.length, `${id}--res.nodeOperators.length`).eq(data.rewardAddresses.length)
    for (let idx = 0; idx < res.validators.length; idx++) {
        expect(res.validators[idx].rewardAddress, `${id}--${idx}--rewardAddress[1]`).eq(data.rewardAddresses[idx])
    }
    expect(res.totalValidatorToWithdrawFrom, `${id}--res.totalValidatorToWithdrawFrom.length`).eq(data.totalValidatorToWithdrawFrom)

    if (callback && res.totalValidatorToWithdrawFrom.eq(0)) {
        callback(res, withdrawAmount)
    }
}

async function checkgetValidatorsRebalanceAmount(id: string, totalBuffered: BigNumber, data: {
    activeNodeOperatorsLength: number,
    totalRatio: BigNumber,
    operatorRatios: Array<BigNumber>,
    rewardAddresses: Array<string>,
    totalToWithdraw: BigNumber,
}) {
    let res = await nodeOperatorRegistry.getValidatorsRebalanceAmount(totalBuffered)
    expect(res.validators.length, `${id}--nodeOperators`).eq(data.activeNodeOperatorsLength)
    expect(res.totalRatio, `${id}--totalRatio`).eq(data.totalRatio)

    expect(res.operatorRatiosToRebalance.length, `${id}--res.operatorRatios.length`).eq(data.operatorRatios.length)
    for (let idx = 0; idx < res.operatorRatiosToRebalance.length; idx++) {
        expect(res.operatorRatiosToRebalance[idx], `${id}--operatorRatios[1]`).eq(data.operatorRatios[idx])
    }

    expect(res.validators.length, `${id}--res.nodeOperators.length`).eq(data.rewardAddresses.length)
    for (let idx = 0; idx < res.validators.length; idx++) {
        expect(res.validators[idx].rewardAddress, `${id}--${idx}--rewardAddress[1]`).eq(data.rewardAddresses[idx])
    }
    expect(res.totalToWithdraw, `${id}--res.totalToWithdraw.length`).eq(data.totalToWithdraw)
}

async function checkGetValidatorDelegationAmount(id: string, totalBuffered: BigNumber, data: {
    activeNodeOperatorsLength: number,
    totalRatio: BigNumber,
    operatorRatios: Array<BigNumber>,
    rewardAddresses: Array<string>
}, log: boolean) {
    let res = await nodeOperatorRegistry.getValidatorsDelegationAmount(totalBuffered)
    if (log) {
        console.log(res)
    }
    expect(res.validators.length, `${id}--totalActiveNodeOperator`).eq(data.activeNodeOperatorsLength)
    expect(res.totalRatio, `${id}--totalRatio`).eq(data.totalRatio)

    expect(res.operatorRatiosToDelegate.length, `${id}--res.operatorRatios.length`).eq(data.operatorRatios.length)
    for (let idx = 0; idx < res.operatorRatiosToDelegate.length; idx++) {
        expect(res.operatorRatiosToDelegate[idx], `${id}--operatorRatios[1]`).eq(data.operatorRatios[idx])
    }

    expect(res.validators.length, `${id}--res.totalActiveNodeOperator`).eq(data.rewardAddresses.length)
    for (let idx = 0; idx < res.validators.length; idx++) {
        expect(res.validators[idx].rewardAddress, `${id}--${idx}--rewardAddress[i]`).eq(data.rewardAddresses[idx])
    }
}

async function getValidatorShare(validatorId: BigNumber) {
    let validatorShareAddress = await stakeManagerMock.getValidatorContract(validatorId)
    let validatorShareMock: Promise<ValidatorShareMock> = (ethers
        .getContractAt("ValidatorShareMock", validatorShareAddress)) as Promise<ValidatorShareMock>
    return validatorShareMock
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

const checkIfCover = (res: any, withdrawAmount: any) => {
    let totalCanWithdraw = BigNumber.from("0")
    for (let i = 0; i < res.operatorAmountCanBeRequested.length; i++) {
        totalCanWithdraw = totalCanWithdraw.add(res.operatorAmountCanBeRequested[i])
    }
    expect(totalCanWithdraw, "Total can withdraw doesn't cover th request").gte(withdrawAmount)
}