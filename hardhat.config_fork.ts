import { HardhatUserConfig } from "hardhat/config";

import "@typechain/hardhat";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-ethers";
import "@openzeppelin/hardhat-upgrades";
import "@nomiclabs/hardhat-etherscan";
import "@openzeppelin/hardhat-defender";

import { ROOT_CHAIN_RPC } from "./environment";

const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  solidity: {
    version: "0.8.7",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
    },
  },
  networks: {
    hardhat: {
      forking: {
        url: ROOT_CHAIN_RPC,
      },
    },
  },
  mocha: {
    timeout: 1500000
  },
};

export default config;
