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
} from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

let accounts: SignerWithAddress[];
let signer: SignerWithAddress;
let user1: SignerWithAddress;
let user2: SignerWithAddress;
let user3: SignerWithAddress;

let nodeOperatorRegistry: NodeOperatorRegistry;
let stMATICMock: StMATICMock;
let stakeManagerMock: StakeManagerMock;

describe("NodeOperator", function () {
    beforeEach(async function () {
        accounts = await ethers.getSigners();
        signer = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        user3 = accounts[3];

        // deploy stake manager mock
        const StakeManagerMock = (await ethers.getContractFactory(
            "StakeManagerMock"
        )) as StakeManagerMock__factory;
        stakeManagerMock = await StakeManagerMock.deploy(
            ethers.constants.AddressZero, // delete later when clean the StakeManagerMocK
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
            stMATICMock.address]
        )) as NodeOperatorRegistry;
        await nodeOperatorRegistry.deployed();

        await stMATICMock.setOperator(nodeOperatorRegistry.address);
    });

    describe("Node Operator", async function () {
        it("Success add a new operator", async function () {
            await stakeOperator(user1)

            const validatorId = await stakeManagerMock.getValidatorId(user1.address)
            expect(await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address))
                .emit(nodeOperatorRegistry, "AddNodeOperator").withArgs(1, user1.address)

            expect((await nodeOperatorRegistry.validatorIds(0))).eq(1)
            expect((await nodeOperatorRegistry.validatorRewardAddress(1))).eq(user1.address)
        });

        it("should return all active operators", async function() {
            await stakeOperator(user1);
            await stakeOperator(user2);
            await stakeOperator(user3);

            const validatorId1 = await stakeManagerMock.getValidatorId(user1.address);
            const validatorId2 = await stakeManagerMock.getValidatorId(user2.address);
            const validatorId3= await stakeManagerMock.getValidatorId(user3.address);

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

        it("should return an array of only active operators", async function() {
            await stakeOperator(user1);
            await stakeOperator(user2);
            await stakeOperator(user3);

            const validatorId1 = await stakeManagerMock.getValidatorId(user1.address);
            const validatorId2 = await stakeManagerMock.getValidatorId(user2.address);
            const validatorId3= await stakeManagerMock.getValidatorId(user3.address);

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

        it("should return an empty array if no operator is active", async function() {
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

        it("should return an empty array if there is no withdrawal operator", async function() {
            await stakeOperator(user1)
            const validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)
            await nodeOperatorRegistry.removeNodeOperator(validatorId);

            const allWithdrawOperators = await nodeOperatorRegistry.listWithdrawNodeOperators();
            expect(allWithdrawOperators).to.be.an("array").that.is.empty;
        });

        it("should return all withdraw node operators", async function() {
            await stakeOperator(user1);
            await stakeOperator(user2);
            await stakeOperator(user3);

            const validatorId1 = await stakeManagerMock.getValidatorId(user1.address);
            await nodeOperatorRegistry.addNodeOperator(validatorId1, user1.address);

            const validatorId2 = await stakeManagerMock.getValidatorId(user2.address);
            await nodeOperatorRegistry.addNodeOperator(validatorId2, user2.address);
            await stakeManagerMock.unstake(validatorId2);

            const validatorId3= await stakeManagerMock.getValidatorId(user3.address);
            await nodeOperatorRegistry.addNodeOperator(validatorId3, user3.address);
            await stakeManagerMock.slash(validatorId3);


            const expectedRewardAddress = [user1.address, user2.address, user3.address];
            const allWithdrawOperators = await nodeOperatorRegistry.listWithdrawNodeOperators();
            expect(allWithdrawOperators.length).to.equal(3);
            allWithdrawOperators.forEach((withdrawOperator, index) => {
                expect(withdrawOperator.rewardAddress).to.equal(expectedRewardAddress[index]);
            })
        });

        it("Success add multiple operators", async function () {
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
            expect((await nodeOperatorRegistry.validatorRewardAddress(1))).eq(user1.address)
            expect((await nodeOperatorRegistry.validatorRewardAddress(2))).eq(user2.address)
            expect((await nodeOperatorRegistry.validatorRewardAddress(3))).eq(user3.address)

        });

        it("Fail add a new operator", async function () {
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

        it("Fail add a jailed operator", async function () {
            // stake a validator
            await stakeOperator(user1)
            // slash the validator
            await stakeManagerMock.slash(1)
            // revert the validator is not active
            const validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await expect(nodeOperatorRegistry.addNodeOperator(validatorId, user1.address))
                .revertedWith("Validator isn't ACTIVE")
        });

        it("Fail add a unstaked operator", async function () {
            // stake a validator
            await stakeOperator(user1)
            // unstake a validator
            await stakeManagerMock.unstake(1)
            // revert the validator is not active
            const validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await expect(nodeOperatorRegistry.addNodeOperator(validatorId, user1.address))
                .revertedWith("Validator isn't ACTIVE")
        });

        it("Fail add operator missing Role", async function () {
            // stake validators
            await stakeOperator(user1)

            // get validator id
            const validatorId = await stakeManagerMock.getValidatorId(user1.address)

            // revert remove operator which not exist
            await expect(nodeOperatorRegistry.connect(user1).addNodeOperator(validatorId, user1.address))
                .revertedWith("Unauthorized")
        })

        it("Success remove an operator", async function () {
            await stakeOperator(user1)
            const validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)
            expect(await nodeOperatorRegistry.removeNodeOperator(validatorId))
                .emit(nodeOperatorRegistry, "RemoveNodeOperator")
                .withArgs(validatorId, user1.address)

            expect((await nodeOperatorRegistry.validatorRewardAddress(1))).eq(ethers.constants.AddressZero)
        });

        it("Success remove multiple operator", async function () {
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
            expect((await nodeOperatorRegistry.validatorRewardAddress(2))).eq(user2.address)

            // add operator 3
            await nodeOperatorRegistry.addNodeOperator(validatorId3, user3.address)

            expect(await nodeOperatorRegistry.validatorIds(0)).eq(2)
            expect(await nodeOperatorRegistry.validatorIds(1)).eq(3)
            expect((await nodeOperatorRegistry.validatorRewardAddress(2))).eq(user2.address)
            expect((await nodeOperatorRegistry.validatorRewardAddress(3))).eq(user3.address)

            // remove operator 2
            expect(await nodeOperatorRegistry.removeNodeOperator(validatorId2))
                .emit(nodeOperatorRegistry, "RemoveNodeOperator")
                .withArgs(validatorId2, user2.address)

            expect(await nodeOperatorRegistry.validatorIds(0)).eq(3)
            expect((await nodeOperatorRegistry.validatorRewardAddress(3))).eq(user3.address)

            // remove operator 3
            expect(await nodeOperatorRegistry.removeNodeOperator(validatorId3))
                .emit(nodeOperatorRegistry, "RemoveNodeOperator")
                .withArgs(validatorId3, user3.address)
        });

        it("Fail remove operator", async function () {
            // stake validators
            await stakeOperator(user1)

            const validatorId = 100
            // revert remove operator which not exist
            await expect(nodeOperatorRegistry.removeNodeOperator(validatorId))
                .revertedWith("Validator doesn't exist")
        })

        it("Fail remove operator missing Role", async function () {
            // stake validators
            await stakeOperator(user1)

            // get validator id
            const validatorId = await stakeManagerMock.getValidatorId(user1.address)

            // revert user1 try no remove an operator
            await expect(nodeOperatorRegistry.connect(user1).removeNodeOperator(validatorId))
                .revertedWith("Unauthorized")
        })

        it("Success set StMatic address", async function () {
            expect(await nodeOperatorRegistry.setStMaticAddress(user1.address))
                .emit(nodeOperatorRegistry, "SetStMaticAddress")
                .withArgs(stMATICMock.address, user1.address)
        })

        it("Fail set StMatic address", async function () {
            // revert zero address
            await expect(nodeOperatorRegistry.setStMaticAddress(ethers.constants.AddressZero))
                .revertedWith("Invalid stMatic address")

            // revert user1 try to set stMatic address
            await expect(nodeOperatorRegistry.connect(user1).setStMaticAddress(user1.address))
                .revertedWith("Unauthorized")
        })

        it("Success set reward address", async function () {
            await stakeOperator(user1)
            const validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)

            expect(await nodeOperatorRegistry.connect(user1).setRewardAddress(validatorId, user2.address))
                .emit(nodeOperatorRegistry, "SetRewardAddress")
                .withArgs(validatorId, user1.address, user2.address)
        })

        it("Fail set reward address", async function () {
            await stakeOperator(user1)
            const validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)

            await expect(nodeOperatorRegistry.connect(user2).setRewardAddress(validatorId, user2.address))
                .revertedWith("Unauthorized")

            await expect(nodeOperatorRegistry.connect(user2).setRewardAddress(validatorId, ethers.constants.AddressZero))
                .revertedWith("Unauthorized")
        })

        it("should get an operator", async function() {
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

        it("should return empty data for a non-existing operator", async function() {
            let nodeOperator = await nodeOperatorRegistry["getNodeOperator(address)"](user1.address);
            expect(nodeOperator.validatorId).to.equal(0);
            expect(nodeOperator.rewardAddress).to.equal(ethers.constants.AddressZero);

            await expect(nodeOperatorRegistry["getNodeOperator(uint256)"](1))
              .revertedWith("Operator not found")

            await stakeOperator(user1)
            const validatorId = await stakeManagerMock.getValidatorId(user1.address)
            await nodeOperatorRegistry.addNodeOperator(validatorId, user1.address)
            await nodeOperatorRegistry.removeNodeOperator(validatorId);

            await expect(nodeOperatorRegistry["getNodeOperator(uint256)"](validatorId))
              .revertedWith("Operator not found")
        });

        it("should return the correct operator status", async function() {
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
    });
});


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
    ACTIVE: 0,
    JAILED: 1,
    EJECTED: 2,
    UNSTAKED: 3
};

// convert a string to ether
function toEth(amount: string): BigNumber {
    return ethers.utils.parseEther(amount);
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