import hardhat, { ethers, upgrades } from "hardhat";
import { Signer, Contract, BigNumber } from "ethers";
import { expect } from "chai";
import { } from "hardhat/types";
import {
    ValidatorFactory,
    ValidatorFactory__factory,
    NodeOperatorRegistry__factory,
    NodeOperatorRegistry,
    ValidatorProxy,
    ERC721Test,
    StakeManagerMock,
    ValidatorFactoryV2,
    NodeOperatorRegistryV2,
    StMATICMock,
    Polygon,
    ValidatorShareMock,
    Polygon__factory,
    ERC721Test__factory,
    StakeManagerMock__factory,
    Validator__factory,
    StMATICMock__factory,
    ValidatorV2__factory
} from "../typechain";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

let accounts: SignerWithAddress[];
let signer: SignerWithAddress;
let user1: SignerWithAddress;
let user2: SignerWithAddress;
let user3: SignerWithAddress;

let nodeOperatorRegistry: NodeOperatorRegistry;
let stMATICMock: StMATICMock;
let polygonERC20: Polygon;
let stakeManagerMock: StakeManagerMock;

describe("NodeOperator", function () {
    beforeEach(async function () {
        accounts = await ethers.getSigners();
        signer = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        user3 = accounts[3];

        // deploy ERC20 token
        const PolygonERC20 = (await ethers.getContractFactory(
            "Polygon"
        )) as Polygon__factory;
        polygonERC20 = await PolygonERC20.deploy();
        await polygonERC20.deployed();

        // deploy stake manager mock
        const StakeManagerMock = (await ethers.getContractFactory(
            "StakeManagerMock"
        )) as StakeManagerMock__factory;
        stakeManagerMock = await StakeManagerMock.deploy(
            polygonERC20.address,
            ethers.constants.AddressZero
        );
        await stakeManagerMock.deployed();

        // deploy node operator contract
        const NodeOperatorRegistry = (await ethers.getContractFactory(
            "NodeOperatorRegistry"
        )) as NodeOperatorRegistry__factory;
        nodeOperatorRegistry = (await upgrades.deployProxy(
            NodeOperatorRegistry, [])) as NodeOperatorRegistry;
        await nodeOperatorRegistry.deployed();

        // deploy stMATIC mock contract
        const StMATICMock = (await ethers.getContractFactory(
            "StMATICMock"
        )) as StMATICMock__factory;
        stMATICMock = await StMATICMock.deploy();
        await stMATICMock.deployed();

        await nodeOperatorRegistry.setStMaticAddress(stMATICMock.address);
        await stMATICMock.setOperator(nodeOperatorRegistry.address);

        // transfer some funds to the stake manager, so we can use it to withdraw rewards.
        await polygonERC20.mint(ethers.utils.parseEther("130000"));
        await polygonERC20.transfer(
            stakeManagerMock.address,
            ethers.utils.parseEther("10000")
        );

        await polygonERC20.transfer(user1.address, toEth("1000"));
        await polygonERC20.transfer(user2.address, toEth("1000"));
        await polygonERC20.transfer(user3.address, toEth("1000"));
    });

    describe("Node Operator", async function () {
    });
});

// convert a string to ether
function toEth(amount: string): BigNumber {
    return ethers.utils.parseEther(amount);
}