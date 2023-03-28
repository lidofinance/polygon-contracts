import { ethers } from "hardhat";
import TRANSACTIONS from "./transactions.json";
import fs from "fs";

const exportFile = "scripts/06-03-2023/transactionsReceipts.json";
const processTransactions = async () => {
  const transactionsReceipts = [];
  // const transactionsReceipts = JSON.parse(
  //   fs.readFileSync("transactionsReceipts.json", "utf-8")
  // );
  for (let index = 0; index < TRANSACTIONS.length; index++) {
    console.log(`Transaction: ${index + 1}/${TRANSACTIONS.length}`);
    const tx = await ethers.provider.getTransactionReceipt(
      TRANSACTIONS[index].hash
    );
    transactionsReceipts.push({ type: TRANSACTIONS[index].type, tx });
    fs.writeFileSync(
      exportFile,
      JSON.stringify(transactionsReceipts, null, "  ")
    );
  }
  console.log("Txs exported");
};

processTransactions()
  .then()
  .catch((e) => {
    console.log("Error", e);
  });
