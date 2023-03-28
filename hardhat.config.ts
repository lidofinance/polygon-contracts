import { HardhatRuntimeEnvironment } from "hardhat/types";
import { HardhatUserConfig, task } from "hardhat/config";

import "@typechain/hardhat";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-ethers";
import "@openzeppelin/hardhat-upgrades";
import "@nomiclabs/hardhat-etherscan";
import '@openzeppelin/hardhat-defender';

// import "hardhat-gas-reporter";
import "hardhat-contract-sizer";

import {
    verify,
    getValidatorDetails
} from "./scripts/tasks";
import {
    DEPLOYER_PRIVATE_KEY,
    ETHERSCAN_API_KEY,
    ROOT_CHAIN_RPC,
    ROOT_GAS_LIMIT,
    ROOT_GAS_PRICE,
    CHILD_CHAIN_RPC,
    CHILD_GAS_LIMIT,
    CHILD_GAS_PRICE,
    DEFENDER_TEAM_API_KEY,
    DEFENDER_TEAM_API_SECRET_KEY
} from "./environment";

task("verifyLido", "StMATIC contracts verification").setAction(
    async (args, hre: HardhatRuntimeEnvironment) => {
        await verify(hre);
    }
);

task("getValidatorDetails", "Get validator details on Polygon stake manager")
    .addParam("id", "validator id")
    .setAction(async (args, hre: HardhatRuntimeEnvironment) => {
        const { id } = args;
        await getValidatorDetails(hre, Number(id));
    });

const config: HardhatUserConfig = {
    defaultNetwork: "hardhat",
    solidity: {
        version: "0.8.7",
        settings: {
            optimizer: {
                enabled: true,
                runs: 200
            }
        }
    },
    networks: {
        localhost: {
            url: "http://127.0.0.1:8545"
        },
        testnet: {
            url: ROOT_CHAIN_RPC,
            accounts: [DEPLOYER_PRIVATE_KEY],
            gasPrice: Number(ROOT_GAS_PRICE),
            gas: Number(ROOT_GAS_LIMIT)
        },
        mainnet: {
            url: ROOT_CHAIN_RPC,
            accounts: [DEPLOYER_PRIVATE_KEY],
            gasPrice: Number(ROOT_GAS_PRICE),
            gas: Number(ROOT_GAS_LIMIT)
        },
        mumbai: {
            url: CHILD_CHAIN_RPC,
            accounts: [DEPLOYER_PRIVATE_KEY],
            gasPrice: Number(CHILD_GAS_PRICE),
            gas: Number(CHILD_GAS_LIMIT)
        },
        polygon: {
            url: CHILD_CHAIN_RPC,
            accounts: [DEPLOYER_PRIVATE_KEY],
            gasPrice: Number(CHILD_GAS_PRICE),
            gas: Number(CHILD_GAS_LIMIT)
        }
    },
    typechain: {
        outDir: "typechain",
        target: "ethers-v5"
    },
    mocha: {
        timeout: 1500000
    },
    etherscan: {
        apiKey: ETHERSCAN_API_KEY
    },
    defender: {
        apiKey: DEFENDER_TEAM_API_KEY,
        apiSecret: DEFENDER_TEAM_API_SECRET_KEY
    }
};

export default config;