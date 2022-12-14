import * as fs from "fs";
import { Contract, Wallet } from "ethers";
import { ethers, network, upgrades } from "hardhat";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";

import { predictContractAddress } from "./utils";
import {
    FxStateChildTunnel,
    FxStateRootTunnel,
    NodeOperatorRegistry,
    PoLidoNFT,
    StMATIC,
} from "../typechain";
import {
    CHECKPOINT_MANAGER,
    DAO,
    FX_CHILD,
    FX_ROOT,
    INSURANCE,
    MATIC_TOKEN,
    STAKE_MANAGER
} from "../environment";
import path from "path";

type DeploymentData = {
  Network: string;
  Signer: string;
  Dao: string;
  PoLidoNFT: string;
  StMATIC: string;
  NodeOperatorRegistry: string;
  FxStateRootTunnel: string;
  FxStateChildTunnel: string;
};

type ContractNames =
  | "NodeOperatorRegistry"
  | "PoLidoNFT"
  | "FxStateRootTunnel"
  | "StMATIC"
  | "FxStateChildTunnel";

type RootContractNames = Exclude<ContractNames, "FxStateChildTunnel">;
type ChildContractNames = Extract<ContractNames, "FxStateChildTunnel">;
type ChildDeploymentOrder = Record<ChildContractNames, number>;
type RootDeploymentOrder = Record<RootContractNames, number>;

const childDeploymentOrder: ChildDeploymentOrder = {
    FxStateChildTunnel: 0
};

const rootDeploymentOrder: RootDeploymentOrder = {
    NodeOperatorRegistry: 2,
    PoLidoNFT: 3,
    FxStateRootTunnel: 4,
    StMATIC: 5
};

interface Exportable {
  data: Record<any, string>;
  export(): void;
}

interface Deployable {
  deploy(): void;
}

class BlockchainDeployer {
  signer: Wallet | SignerWithAddress;
  nonce: number;

  constructor (signer: Wallet | SignerWithAddress, nonce: number) {
      this.signer = signer;
      this.nonce = nonce;
  }

  deployContract = async <T extends Contract>(
      contractName: keyof DeploymentData,
      ...args: any[]
  ) => {
      // console.log(`Deploying ${contractName}: ${args}, ${args.length}`);
      const Contract = await ethers.getContractFactory(contractName, this.signer);
      const contract = args.length
          ? ((await Contract.deploy(...args)) as T)
          : ((await Contract.deploy()) as T);
      await contract.deployed();
      // console.log(`Deployed at ${contract.address}`);

      return contract;
  };

  deployProxy = async <T extends Contract>(
      contractName: keyof DeploymentData,
      ...args: any[]
  ) => {
      // console.log(`Deploying ${contractName}: ${args}, ${args.length}`);
      const Contract = await ethers.getContractFactory(contractName, this.signer);
      const contract = args.length
          ? ((await upgrades.deployProxy(Contract, args)) as T)
          : ((await upgrades.deployProxy(Contract)) as T);
      await contract.deployed();
      // console.log(`Deployed at ${contract.address}`);

      return contract;
  };
}

abstract class MultichainDeployer {
  rootDeployer: BlockchainDeployer;
  childDeployer: BlockchainDeployer;

  constructor (
      rootDeployer: BlockchainDeployer,
      childDeployer: BlockchainDeployer
  ) {
      this.rootDeployer = rootDeployer;
      this.childDeployer = childDeployer;
  }

  protected deployContractRoot = async <T extends Contract>(
      contractName: keyof DeploymentData,
      ...args: any[]
  ) => {
      return this.rootDeployer.deployContract<T>(contractName, args);
  };

  protected deployContractChild = async <T extends Contract>(
      contractName: keyof DeploymentData,
      ...args: any[]
  ) => {
      return this.childDeployer.deployContract<T>(contractName, args);
  };

  protected deployProxyRoot = async <T extends Contract>(
      contractName: keyof DeploymentData,
      ...args: any[]
  ) => {
      return this.rootDeployer.deployProxy<T>(contractName, args);
  };

  protected deployProxyChild = async <T extends Contract>(
      contractName: keyof DeploymentData,
      ...args: any[]
  ) => {
      return this.childDeployer.deployProxy<T>(contractName, args);
  };
}

export class PoLidoDeployer
    extends MultichainDeployer
    implements Exportable, Deployable {
  data: Partial<Record<ContractNames, string>> = {};

  public static CreatePoLidoDeployer = async (
      rootSigner: Wallet | SignerWithAddress,
      childSigner: Wallet | SignerWithAddress
  ) => {
      const rootNonce = await rootSigner.getTransactionCount();
      const childNonce = await childSigner.getTransactionCount();
      const rootDeployer = new BlockchainDeployer(rootSigner, rootNonce);
      const childDeployer = new BlockchainDeployer(childSigner, childNonce);
      const poLidoDeployer = new PoLidoDeployer(rootDeployer, childDeployer);

      poLidoDeployer.predictAddresses();

      return poLidoDeployer;
  };

  deploy = async () => {
      await this.deployNodeOperatorRegistry();
      await this.deployPoLidoNFT();
      await this.deployFxStateRootTunnel();
      await this.deployFxStateChildTunnel();
      await this.deployStMATIC();
  };



  private deployNodeOperatorRegistry =  async () => {
      return this.rootDeployer.deployProxy<NodeOperatorRegistry>(
          "NodeOperatorRegistry",
          STAKE_MANAGER,
          this.data.StMATIC,
          DAO,
      );
  };

  private deployPoLidoNFT = async () => {
      return this.rootDeployer.deployProxy<PoLidoNFT>(
          "PoLidoNFT",
          "PoLido",
          "PLO",
          this.data.StMATIC
      );
  };

  private deployFxStateRootTunnel = async () => {
      return this.rootDeployer.deployContract<FxStateRootTunnel>(
          "FxStateRootTunnel",
          CHECKPOINT_MANAGER,
          FX_ROOT,
          this.data.FxStateChildTunnel,
          this.data.StMATIC
      );
  };

  private deployFxStateChildTunnel = async () => {
      return this.childDeployer.deployContract<FxStateChildTunnel>(
          "FxStateChildTunnel",
          FX_CHILD,
          this.data.FxStateRootTunnel
      );
  };

  private deployStMATIC = async () => {
      return this.rootDeployer.deployProxy<StMATIC>(
          "StMATIC",
          this.data.NodeOperatorRegistry,
          MATIC_TOKEN,
          DAO,
          INSURANCE,
          STAKE_MANAGER,
          this.data.PoLidoNFT,
          this.data.FxStateRootTunnel
      );
  };

  export = () => {
      const fileName = path.join(
          __dirname,
          "../",
          `${network.name}-deployment-info.json`
      );
      fs.writeFileSync(fileName, JSON.stringify(this.data));
  };

  private predictAddresses = () => {
      this.calculateRootContractAddresses();
      this.calculateChildContractAddresses();
  };

  private calculateRootContractAddresses = () => {
      (Object.keys(rootDeploymentOrder) as Array<RootContractNames>).forEach(
          (k) => {
              this.data[k] = predictContractAddress(
                  this.rootDeployer.signer.address,
                  this.rootDeployer.nonce + rootDeploymentOrder[k]
              );
          }
      );
  };

  private calculateChildContractAddresses = () => {
      (Object.keys(childDeploymentOrder) as Array<ChildContractNames>).forEach(
          (k) => {
              this.data[k] = predictContractAddress(
                  this.childDeployer.signer.address,
                  this.childDeployer.nonce + childDeploymentOrder[k]
              );
          }
      );
  };
}
