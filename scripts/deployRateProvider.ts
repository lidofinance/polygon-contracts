import hardhat, { ethers } from "hardhat";
import { getUpgradeContext } from "./utils";

const main = async () => {
    const { deployDetails } = getUpgradeContext(hardhat);
    const rateProviderFactory = await ethers.getContractFactory("RateProvider");
    const rateProviderContract = await rateProviderFactory
        .deploy(deployDetails.fx_state_child_tunnel);
    await rateProviderContract._deployed();

    console.log(rateProviderContract.address);
};

main();
