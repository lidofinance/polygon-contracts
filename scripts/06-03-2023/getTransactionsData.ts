import { ethers } from "hardhat";
import fs from "fs";
import { BigNumber } from "ethers";
import { StMATIC } from "../../typechain";

// const transactionsData: any = [];
const exportFile = "scripts/06-03-2023/transactionsData.json";
const transactionsData: any = JSON.parse(fs.readFileSync(exportFile, "utf-8"));
const getTransactionsData = async () => {
  // When a transaction is of type `Submit`,  the event needed `SubmitEvent`
  // https://etherscan.io/tx/0x3098d9fc24cc5a5623d6f5eae8dc71df78af4203db7282f567a4ad0eebaf1012#eventlog

  // When a transaction is of type `RequestWithdraw`,  the event needed `RequestWithdrawEvent`
  // https://etherscan.io/tx/0x29eace88cd13411111059b43aa8ab7ca53948de237c578278188e790862f9adc#eventlog

  const STMATIC_ADDRESS = "0x9ee91F9f426fA633d227f7a9b000E28b9dfd8599";
  const LIDONFT_ADDRESS = "0x60a91e2b7a1568f0848f3d43353c453730082e46";
  // StMATIC contract
  const stMATIC = (await ethers.getContractAt(
    "StMATIC",
    STMATIC_ADDRESS
  )) as StMATIC;

  const transactionsReceipts: any = JSON.parse(
    fs.readFileSync("scripts/06-03-2023/transactionsReceipts.json", "utf-8")
  );

  for (let i = 0; i < transactionsReceipts.length; i++) {
    console.log(`${i + 1}/${transactionsReceipts.length}`);
    const tx = transactionsReceipts[i];

    // Submit transactions
    if (tx.type == "Submit") {
      continue;
      let amountMaticSubmitted: BigNumber = BigNumber.from("0");
      let amountStMaticReceived: BigNumber = BigNumber.from("0");
      for (let j = 0; j < tx.tx.logs.length; j++) {
        const log = tx.tx.logs[j];

        // Transfer Event: mint stMATIC to the user
        if (
          log.address.toLowerCase() == STMATIC_ADDRESS.toLowerCase() &&
          log.topics.length == 3 &&
          log.topics[1].toLowerCase() ==
            "0x0000000000000000000000000000000000000000000000000000000000000000"
        ) {
          amountStMaticReceived = BigNumber.from(
            log.data == "0x" ? "0" : log.data
          );
          continue;
        }

        // SubmitEvent Event: the the amount of matic submitted
        if (
          log.address.toLowerCase() == STMATIC_ADDRESS.toLowerCase() &&
          log.topics.length == 3 &&
          j == tx.tx.logs.length - 1
        ) {
          amountMaticSubmitted = BigNumber.from(
            log.data == "0x" ? "0" : log.data
          );
          continue;
        }
      }

      transactionsData[i] = {
        type: tx.type,
        userAddress: tx.tx.from,
        amountStMaticReceived: amountStMaticReceived.toString(),
        amountMaticSubmitted: amountMaticSubmitted.toString(),
        transactionHash: tx.tx.transactionHash,
      };
      fs.writeFileSync(exportFile, JSON.stringify(transactionsData, null, " "));
    } else if (tx.type == "Request Withdraw") {
      continue;
      let amountStMaticSubmitted: BigNumber = BigNumber.from("0");
      let amountMaticReceived: BigNumber = BigNumber.from("0");
      let lidoNFTMinted: BigNumber = BigNumber.from("0");
      for (let j = 0; j < tx.tx.logs.length; j++) {
        const log = tx.tx.logs[j];

        // Transfer Event: Mint NFT token
        if (
          log.address.toLowerCase() == LIDONFT_ADDRESS.toLowerCase() &&
          log.topics.length == 4
        ) {
          lidoNFTMinted = BigNumber.from(log.topics[3]);
          continue;
        }

        // RequestWithdrawEvent Event: Amount stMatic submitted
        if (
          log.address.toLowerCase() == STMATIC_ADDRESS.toLowerCase() &&
          j == tx.tx.logs.length - 1
        ) {
          amountStMaticSubmitted = BigNumber.from(
            log.data == "0x" ? "0" : log.data
          );
          continue;
        }
      }

      // Get the total amount of MATIC requested from the validators
      const res = await stMATIC.getToken2WithdrawRequests(lidoNFTMinted);

      for (let j = 0; j < res.length; j++) {
        const validatorAddress = res[j].validatorAddress;
        for (let j = 0; j < tx.tx.logs.length; j++) {
          const log = tx.tx.logs[j];
          if (
            log.address.toLowerCase() == validatorAddress.toLowerCase() &&
            log.topics.length == 3
          ) {
            amountMaticReceived = amountMaticReceived.add(
              BigNumber.from(log.data == "0x" ? "0" : log.data)
            );
            continue;
          }
        }
      }

      transactionsData[i] = {
        type: tx.type,
        userAddress: tx.tx.from,
        amountMaticReceived: amountMaticReceived.toString(),
        amountStMaticSubmitted: amountStMaticSubmitted.toString(),
        lidoNFTMinted: lidoNFTMinted.toString(),
        transactionHash: tx.tx.transactionHash,
      };

      fs.writeFileSync(exportFile, JSON.stringify(transactionsData, null, " "));
    } else if (tx.type == "Distribute Rewards") {
      // continue
      let rewards: BigNumber = BigNumber.from("0");

      const log = tx.tx.logs[tx.tx.logs.length - 1];
      rewards = BigNumber.from(log.topics[1]);

      transactionsData[i] = {
        type: tx.type,
        userAddress: tx.tx.from,
        rewards: rewards.mul(10).toString(),
        transactionHash: tx.tx.transactionHash,
      };

      fs.writeFileSync(exportFile, JSON.stringify(transactionsData, null, " "));
    } else {
      console.log("ERROR", i);
    }
  }
};

getTransactionsData()
  .then()
  .catch((e) => {
    console.log("Error", e);
  });
