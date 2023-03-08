import { BigNumber } from "@ethersproject/bignumber";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import hre, { ethers } from "hardhat";
import DATA from "../transactionsData.json";
import fs from "fs";
import { StMATIC, ERC20, IAdminUpgradeabilityProxy } from "../../../typechain";
import { describe } from "mocha";

describe("Starting to test StMATIC contract", () => {
  let stMATIC: StMATIC;
  let MATIC: ERC20;
  let DAOSigner: SignerWithAddress;
  let MATIC_WHALE: SignerWithAddress;
  let stMATIC_WHALE: SignerWithAddress;

  const STMATIC_ADDRESS = "0x9ee91f9f426fa633d227f7a9b000e28b9dfd8599";
  const DAO_ADDRESS = "0xd65Fa54F8DF43064dfd8dDF223A446fc638800A9";
  const MATIC_WHALE_ADDRESS = "0x50d669F43b484166680Ecc3670E4766cdb0945CE";
  const STMATIC_WHALE_ADDRESS = "0x40ec5B33f54e0E8A33A975908C5BA1c14e5BbbDf";

  const exportFile = "scripts/06-03-2023/simulateOnFixedMaticContracts.json";

  before(async () => {
    // StMATIC contract
    stMATIC = (await ethers.getContractAt(
      "StMATIC",
      STMATIC_ADDRESS
    )) as StMATIC;

    // Polygon ERC20 MATIC token contract
    MATIC = (await ethers.getContractAt(
      "ERC20",
      "0x7D1AfA7B718fb893dB30A3aBc0Cfc608AaCfeBB0"
    )) as ERC20;

    // DAO signer
    {
      await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [DAO_ADDRESS],
      });

      await hre.network.provider.send("hardhat_setBalance", [
        DAO_ADDRESS,
        ethers.utils.parseEther("1000").toHexString(),
      ]);

      DAOSigner = await ethers.getSigner(DAO_ADDRESS);
    }

    // MATIC whale
    {
      await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [MATIC_WHALE_ADDRESS],
      });

      await hre.network.provider.send("hardhat_setBalance", [
        MATIC_WHALE_ADDRESS,
        ethers.utils.parseEther("1000").toHexString(),
      ]);

      MATIC_WHALE = await ethers.getSigner(MATIC_WHALE_ADDRESS);
    }

    // stMATIC whale
    {
      await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [STMATIC_WHALE_ADDRESS],
      });

      await hre.network.provider.send("hardhat_setBalance", [
        STMATIC_WHALE_ADDRESS,
        ethers.utils.parseEther("1000").toHexString(),
      ]);

      stMATIC_WHALE = await ethers.getSigner(STMATIC_WHALE_ADDRESS);
    }

    // Upgrade stMATIC
    const stMaticFixFactory = await ethers.getContractFactory(
      "StMATIC",
      DAOSigner
    );
    const impl = await stMaticFixFactory.deploy();

    // Polygon stakeManager contract
    const adminProxy = (await ethers.getContractAt(
      "IAdminUpgradeabilityProxy",
      "0x0833f5bD45803E05ef54E119a77E463cE6b1a963"
    )) as IAdminUpgradeabilityProxy;

    await adminProxy.connect(DAOSigner).upgrade(STMATIC_ADDRESS, impl.address);

    expect(
      await adminProxy.getProxyImplementation(STMATIC_ADDRESS),
      "Wrong impl address"
    ).eq(impl.address);
  });

  it("Simulate the transactions in a fixed stMATIC contract", async () => {
    // const updatedData: any = DATA;
    const updatedData: any = [];

    for (let i = 0; i < DATA.length; i++) {
      const data: any = DATA[i];
      console.log(`${data.type} - ${i + 1}/${DATA.length}`);

      // Create user impersonateAccount
      await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [data.userAddress],
      });

      await hre.network.provider.send("hardhat_setBalance", [
        data.userAddress,
        ethers.utils.parseEther("1000").toHexString(),
      ]);

      const userSigner = await ethers.getSigner(data.userAddress);

      if (data.type == "Submit" && data.amountMaticSubmitted != "0") {
        // Event: submit
        // Transfer the submit amount from matic whale to the user.
        await MATIC.connect(MATIC_WHALE).transfer(
          userSigner.address,
          BigNumber.from(data.amountMaticSubmitted)
        );

        // user approve the tokens to stMATIC.
        await MATIC.connect(userSigner).approve(
          stMATIC.address,
          BigNumber.from(data.amountMaticSubmitted)
        );

        const balanceBefore = await stMATIC.balanceOf(userSigner.address);

        const beforeTotalPooledMatic = (
          await stMATIC.getTotalPooledMatic()
        ).toString();
        const beforeTotalSupplyStMatic = (
          await stMATIC.totalSupply()
        ).toString();

        // user submit stMATIC.
        await stMATIC
          .connect(userSigner)
          .submit(
            BigNumber.from(data.amountMaticSubmitted),
            ethers.constants.AddressZero
          );

        const balanceAfter = await stMATIC.balanceOf(userSigner.address);
        updatedData.push({
          ...data,
          shouldReceivedStMATIC: balanceAfter.sub(balanceBefore).toString(),
          beforeTotalPooledMatic,
          beforeTotalSupplyStMatic,
          afterTotalPooledMatic: (
            await stMATIC.getTotalPooledMatic()
          ).toString(),
          afterTotalSupplyStMatic: (await stMATIC.totalSupply()).toString(),
        });
        fs.writeFileSync(exportFile, JSON.stringify(updatedData, null, " "));
      } else if (
        data.type == "Request Withdraw" &&
        data.amountStMaticSubmitted != "0"
      ) {
        // Event: Request Withdraw
        // Transfer the required stmatic.
        await stMATIC
          .connect(stMATIC_WHALE)
          .transfer(
            userSigner.address,
            BigNumber.from(data.amountStMaticSubmitted)
          );

        const shouldReceivedMATIC = await stMATIC.convertStMaticToMatic(
          BigNumber.from(data.amountStMaticSubmitted)
        );

        const beforeTotalPooledMatic = (
          await stMATIC.getTotalPooledMatic()
        ).toString();
        const beforeTotalSupplyStMatic = (
          await stMATIC.totalSupply()
        ).toString();

        updatedData.push({
          ...data,
          shouldReceivedMATIC: shouldReceivedMATIC.amountInMatic.toString(),
          beforeTotalPooledMatic,
          beforeTotalSupplyStMatic,
          totalPooledMatic: (await stMATIC.getTotalPooledMatic()).toString(),
          totalSupplyStMatic: (await stMATIC.totalSupply()).toString(),
        });
        // user submit stMATIC.
        await stMATIC
          .connect(userSigner)
          .requestWithdraw(
            BigNumber.from(data.amountStMaticSubmitted),
            ethers.constants.AddressZero
          );
        fs.writeFileSync(exportFile, JSON.stringify(updatedData, null, " "));
      } else if (data.type == "Distribute Rewards") {
        // Event: Distribute Rewards
        // Transfer the required stmatic to cover the reward distribution.

        const beforeTotalPooledMatic = (
          await stMATIC.getTotalPooledMatic()
        ).toString();
        const beforeTotalSupplyStMatic = (
          await stMATIC.totalSupply()
        ).toString();

        // console.log(await MATIC.balanceOf(stMATIC.address))
        await MATIC.connect(MATIC_WHALE).transfer(
          stMATIC.address,
          BigNumber.from(data.rewards)
        );
        await stMATIC.distributeRewards()
        // console.log(await MATIC.balanceOf(stMATIC.address))

        updatedData.push({
          ...data,
          beforeTotalPooledMatic,
          beforeTotalSupplyStMatic,
          totalPooledMatic: (await stMATIC.getTotalPooledMatic()).toString(),
          totalSupplyStMatic: (await stMATIC.totalSupply()).toString(),
        });
        fs.writeFileSync(exportFile, JSON.stringify(updatedData, null, " "));
      }
    }
  });
});
