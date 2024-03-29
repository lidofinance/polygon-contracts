import { BigNumber } from "@ethersproject/bignumber";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import hre, { ethers } from "hardhat";
import DATA from "../scripts/06-03-2023/transactionsData.json";
import fs from "fs";
import { StMATIC, ERC20, IAdminUpgradeabilityProxy } from "../typechain";
import { describe } from "mocha";

describe("Starting to test StMATIC contract", () => {
  let stMATIC: StMATIC;
  let MATIC: ERC20;
  let DAOSigner: SignerWithAddress;
  let stMaticSigner: SignerWithAddress;
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

    // stMATIC signer
    {
      await hre.network.provider.request({
        method: "hardhat_impersonateAccount",
        params: [STMATIC_ADDRESS],
      });

      await hre.network.provider.send("hardhat_setBalance", [
        STMATIC_ADDRESS,
        ethers.utils.parseEther("1000").toHexString(),
      ]);

      stMaticSigner = await ethers.getSigner(STMATIC_ADDRESS);
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

    for (let i = 0; i < 16; i++) {
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

        const validatorAddresses = [
          "0x48d7c8a1ffE179bf4a8eA5aC90574A7D13b0fbfc",
          "0x5DDBeE6aD14852d5F78b6eeb6b040391821ff45C",
          "0xC55D28Ac155C1a43eF2309869b704dF677788E81",
          "0xfBD457afAD934A1Bd9B18285a4D4C108B3f9673c",
          "0x8e60E8fEeEe72cD2EaF8D2E8C50075b79CCE8a58",
          "0x2eD68044CbE901DCC2ac448e1D276B3F928845c0",
        ];

        let totalRewardsAccumulated = BigNumber.from("0");
        for (let i = 0; i < validatorAddresses.length; i++) {
          totalRewardsAccumulated = totalRewardsAccumulated.add(
            await stMATIC.getLiquidRewards(validatorAddresses[i])
          );
        }
        const rewards = BigNumber.from(data.rewards);
        if (totalRewardsAccumulated.gt(rewards)) {
          console.log("11111111111111111111")
          console.log("totalRewardsAccumulated", totalRewardsAccumulated)
          
          await MATIC.connect(stMaticSigner).transfer(
            stMATIC_WHALE.address,
            totalRewardsAccumulated.sub(rewards)
          );
        } else {
          console.log("22222222222222222222")
          //  3654.278285493918186860
          //  5230.341883958365975060
          // 11696.339989862578793683
          console.log("totalRewardsAccumulated", totalRewardsAccumulated)
          console.log("rewards.sub(totalRewardsAccumulated)", rewards.sub(totalRewardsAccumulated))
          await MATIC.connect(MATIC_WHALE).transfer(
            stMATIC.address,
            rewards.sub(totalRewardsAccumulated)
          );
        }

        expect(await stMATIC.distributeRewards()).emit(stMATIC, "DistributeRewardsEvent").withArgs("12");
        // console.log(await MATIC.balanceOf(stMATIC.address))

        updatedData.push({
          ...data,
          beforeTotalPooledMatic,
          beforeTotalSupplyStMatic,
          afterTotalPooledMatic: (
            await stMATIC.getTotalPooledMatic()
          ).toString(),
          afterTotalSupplyStMatic: (await stMATIC.totalSupply()).toString(),
        });
        fs.writeFileSync(exportFile, JSON.stringify(updatedData, null, " "));
      }
    }
  });
});
