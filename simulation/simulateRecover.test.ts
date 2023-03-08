import { BigNumber } from "@ethersproject/bignumber";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import hre, { ethers } from "hardhat";
import { StMATIC, ERC20, IAdminUpgradeabilityProxy } from "../typechain";
import RECOVER_USER from "./recovery_data/users.json";

describe("Starting to test StMATIC contract", () => {
  let stMATIC: StMATIC;
  let MATIC: ERC20;
  let DAOSigner: SignerWithAddress;
  let MATIC_WHALE: SignerWithAddress;
  let accounts: SignerWithAddress[];
  const STMATIC_ADDRESS = "0x9ee91f9f426fa633d227f7a9b000e28b9dfd8599";
  const DAO_ADDRESS = "0xd65Fa54F8DF43064dfd8dDF223A446fc638800A9";
  const MATIC_WHALE_ADDRESS = "0x50d669F43b484166680Ecc3670E4766cdb0945CE";

  before(async () => {
    accounts = await ethers.getSigners();
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

    // DAO signer impersonateAccount
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

    // MATIC whale impersonateAccount
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

    // Admin proxy to upgrade stMATIC
    const adminProxy = (await ethers.getContractAt(
      "IAdminUpgradeabilityProxy",
      "0x0833f5bD45803E05ef54E119a77E463cE6b1a963"
    )) as IAdminUpgradeabilityProxy;

    // Upgrade stMATIC contract.
    const stMaticFixFactory = await ethers.getContractFactory(
      "StMATIC",
      DAOSigner
    );
    const impl = await stMaticFixFactory.deploy();
    await adminProxy.connect(DAOSigner).upgrade(STMATIC_ADDRESS, impl.address);

    expect(
      await adminProxy.getProxyImplementation(STMATIC_ADDRESS),
      "Wrong stMatic impl address"
    ).eq(impl.address);
  });

  it("Simulate recover", async () => {
    // user addresses
    const userAddresses: string[] = [];

    // user balances
    const userBalances: BigNumber[] = [];

    for (let i = 0; i < RECOVER_USER.length; i++) {
      userAddresses.push(RECOVER_USER[i].user);
      userBalances.push(
        ethers.utils.parseUnits(RECOVER_USER[i].stMATIC_to_mint)
      );
    }
    const lostAmount = ethers.utils.parseUnits("1309.42584359816", 18);
    const compensateAmount = ethers.utils.parseUnits("102470.7609", 18);
    const compensateAddress = DAOSigner.address;
    const stMATICBalanceBeforeRecover = await MATIC.balanceOf(stMATIC.address);
    const compensateAddressBalanceBeforeRecover = await MATIC.balanceOf(
      compensateAddress
    );

    // get user balances before the recover.
    const usersBalanceBeforeTheFix = [];
    for (let i = 0; i < RECOVER_USER.length; i++) {
      usersBalanceBeforeTheFix.push(
        await stMATIC.balanceOf(RECOVER_USER[i].user)
      );
    }
    {
      // Exec recover
      await stMATIC
        .connect(DAOSigner)
        .recover(
          userAddresses,
          userBalances,
          compensateAddress,
          compensateAmount
        );

      // transfer lost tokens to stMatic contract.
      await MATIC.connect(MATIC_WHALE).transfer(stMATIC.address, lostAmount);
    }

    // Check if the users received the correct stMatic.
    for (let i = 0; i < userAddresses.length; i++) {
      const balanceAfterRecover = await stMATIC.balanceOf(userAddresses[i]);
      expect(
        balanceAfterRecover.sub(usersBalanceBeforeTheFix[i]),
        "User stMatic balance"
      ).eq(userBalances[i]);
    }

    // Check stMatic contract, Matic balance.
    const stMATICBalanceAfterRecover = await MATIC.balanceOf(stMATIC.address);
    expect(stMATICBalanceAfterRecover, "stMATICBalanceAfterRecover").eq(
      stMATICBalanceBeforeRecover.add(lostAmount).sub(compensateAmount)
    );

    // Check if the compensateAddress received the compensate Amount.
    const compensateAddressBalanceAfterRecover = await MATIC.balanceOf(
      compensateAddress
    );

    expect(
      compensateAddressBalanceAfterRecover,
      "compensateAddressBalanceAfterRecover"
    ).eq(compensateAddressBalanceBeforeRecover.add(compensateAmount));
  });
});
