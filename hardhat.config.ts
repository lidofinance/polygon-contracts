import { HardhatRuntimeEnvironment } from "hardhat/types";
import { HardhatUserConfig, task } from "hardhat/config";

import "@typechain/hardhat";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-ethers";
import "@openzeppelin/hardhat-upgrades";
import "@nomiclabs/hardhat-etherscan";
import '@openzeppelin/hardhat-defender';

// import "hardhat-gas-reporter";
// import "hardhat-contract-sizer";

import {
    verify,
    getValidatorDetails
} from "./scripts/tasks";
import { OperatorArgs } from "./scripts/types";
import { getPublicKey } from "./scripts/utils";
import {
    DEPLOYER_PRIVATE_KEY,
    ETHERSCAN_API_KEY,
    ROOT_CHAIN_RPC,
    ROOT_GAS_LIMIT,
    ROOT_GAS_PRICE,
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
        }
    },
    typechain: {
        outDir: "typechain",
        target: "ethers-v5"
    },
    mocha: {
        timeout: 100000
    },
    etherscan: {
        apiKey: ETHERSCAN_API_KEY
    }
};

export default config;