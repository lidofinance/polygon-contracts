import { ethers } from "hardhat";
import TRANSACTIONS from "./simulateOnFixedMaticContracts.json";
import fs from "fs";
import { BigNumber } from "ethers";

const processTransactions = async () => {
  let amountStMatic = BigNumber.from("0");
  let amountMatic = BigNumber.from("0");

  for (let i = 0; i < 14; i++) {
    const tx = TRANSACTIONS[i];
    if (tx.type == "Submit") {
      const shouldReceivedStMATIC = BigNumber.from(tx.shouldReceivedStMATIC);
      const amountStMaticReceived = BigNumber.from(tx.amountStMaticReceived);
      amountStMatic = amountStMatic.add(
        shouldReceivedStMATIC.sub(amountStMaticReceived)
      );
    } else if (tx.type == "Request Withdraw") {
      const shouldReceivedMATIC = BigNumber.from(tx.shouldReceivedMATIC);
      const amountMaticReceived = BigNumber.from(tx.amountMaticReceived);
      amountMatic = amountMatic.add(
        shouldReceivedMATIC.sub(amountMaticReceived)
      );
    }
  }
  console.log("amountStMatic", amountStMatic.toString())
  console.log("amountMatic", amountMatic.toString())
};

processTransactions()
  .then()
  .catch((e) => {
    console.log("Error", e);
  });
