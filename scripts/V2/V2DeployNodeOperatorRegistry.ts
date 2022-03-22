import hardhat, { ethers, upgrades } from "hardhat";
import { getUpgradeContext, exportAddresses } from "../utils"

const main = async () => {
    const { deployDetails, filePath } = getUpgradeContext(hardhat)
    console.log("deploy V2 NodeOperatorRegistry...");
    const signers = await ethers.getSigners()
    const signer = signers[0]
    const nodeOperatorRegistryFactory = await ethers.getContractFactory("NodeOperatorRegistry");
    const nodeOperatorRegistry = await upgrades.deployProxy(nodeOperatorRegistryFactory,
        [
            deployDetails.matic_stake_manager_proxy,
            deployDetails.stMATIC_proxy,
            signer
        ]);
    await nodeOperatorRegistry.deployed();

    const nodeOperatorRegistryAddress = await upgrades.erc1967.getImplementationAddress(
        nodeOperatorRegistry.address
    );

    console.log("NodeOperatorRegistry deployed");
    console.log("proxy:", nodeOperatorRegistry.address);
    console.log("Implementation:", nodeOperatorRegistryAddress);

    exportAddresses(filePath, {
        lido_nft_proxy: nodeOperatorRegistry.address,
        lido_nft_implementation: nodeOperatorRegistryAddress
    });
};

main();
