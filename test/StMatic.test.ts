import { BigNumber, BigNumberish } from "@ethersproject/bignumber";
import { SignerWithAddress } from "@nomiclabs/hardhat-ethers/signers";
import { expect } from "chai";
import { ethers, upgrades } from "hardhat";
import {
    StMATIC,
    PoLidoNFT,
    ValidatorShareMock,
    NodeOperatorRegistry,
    Polygon,
    StakeManagerMock,
    FxBaseRootMock,
    FxBaseRootMock__factory,
    SelfDestructor,
    ERC721Test
} from "../typechain";
import { describe } from "mocha";

describe("Starting to test StMATIC contract", () => {
    let deployer: SignerWithAddress;
    let testers: SignerWithAddress[] = [];
    let insurance: SignerWithAddress;
    let stMATIC: StMATIC;
    let poLidoNFT: PoLidoNFT;
    let nodeOperatorRegistry: NodeOperatorRegistry;
    let mockStakeManager: StakeManagerMock;
    let mockERC20: Polygon;
    let fxBaseRootMock: FxBaseRootMock;
    let erc721Contract: ERC721Test;

    let accounts: SignerWithAddress[];
    let signer: SignerWithAddress;
    let user1: SignerWithAddress;
    let user2: SignerWithAddress;
    let user3: SignerWithAddress;

    let submit: (
        signer: SignerWithAddress,
        amount: BigNumberish,
        referral: string
    ) => Promise<void>;

    let requestWithdraw: (
        signer: SignerWithAddress,
        amount: BigNumberish,
        referral: string
    ) => Promise<void>;

    let claimTokens: (
        signer: SignerWithAddress,
        tokenId: BigNumberish
    ) => Promise<void>;

    let addOperator: (
        validatorId: string,
        rewardAddress: string,
    ) => Promise<void>;

    let stakeOperator: (
        user: SignerWithAddress,
    ) => Promise<void>;

    let removeOperator: (
        validatorId: string
    ) => Promise<void>;

    let mint: (signer: SignerWithAddress, amount: BigNumberish) => Promise<void>;

    let slash: (
        validatorId: BigNumberish,
        percentage: BigNumberish
    ) => Promise<void>;

    let getValidatorShare: (validatorId: BigNumberish) => Promise<ValidatorShareMock>
    let getValidatorShareAddress: (validatorId: BigNumberish) => Promise<string>;

    let stopOperator: (id: BigNumberish) => Promise<void>;

    let increaseStakeFor: (validatorId: BigNumber, amount: BigNumber) => Promise<void>

    before(async () => {
        accounts = await ethers.getSigners();
        signer = accounts[0];
        user1 = accounts[1];
        user2 = accounts[2];
        user3 = accounts[3];

        mint = async (signer, amount) => {
            const signerERC = mockERC20.connect(signer);
            await signerERC.mint(amount);
        };

        submit = async (signer, amount, referral) => {
            const signerERC20 = mockERC20.connect(signer);
            await signerERC20.approve(stMATIC.address, amount);

            const signerStMATIC = stMATIC.connect(signer);
            await signerStMATIC.submit(amount, referral);
        };

        requestWithdraw = async (signer, amount, referral) => {
            const signerStMATIC = stMATIC.connect(signer);
            await signerStMATIC.approve(stMATIC.address, amount);
            expect(await signerStMATIC.requestWithdraw(amount, referral))
                .emit(stMATIC, "RequestWithdrawEvent")
                .withArgs(signer.address, amount, referral);
        };

        claimTokens = async (signer, tokenId) => {
            const signerStMATIC = stMATIC.connect(signer);
            await signerStMATIC.claimTokens(tokenId);
        };

        slash = async (validatorId, percentage) => {
            const validatorShareAddress = (
                await nodeOperatorRegistry["getNodeOperator(uint256)"](validatorId)
            ).validatorShare;

            const ValidatorShareMock = await ethers.getContractFactory(
                "ValidatorShareMock"
            );
            const validatorShare = ValidatorShareMock.attach(
                validatorShareAddress
            ) as ValidatorShareMock;

            const validatorShareBalance = await mockERC20.balanceOf(
                validatorShareAddress
            );

            await validatorShare.slash(
                validatorShareBalance.mul(percentage).div(100)
            );
        };

        addOperator = async (validatorId, rewardAddress) => {
            await nodeOperatorRegistry.addNodeOperator(
                validatorId,
                rewardAddress
            );
        };

        removeOperator = async (validatorId) => {
            await nodeOperatorRegistry.removeNodeOperator(validatorId);
        };

        getValidatorShare = async (validatorId) => {
            const validatorShareAddress = (
                await nodeOperatorRegistry["getNodeOperator(uint256)"](validatorId)
            ).validatorShare;

            const ValidatorShareMock = await ethers.getContractFactory("ValidatorShareMock");
            return ValidatorShareMock.attach(validatorShareAddress) as ValidatorShareMock;
        };

        getValidatorShareAddress = async (validatorId) => {
            const { validatorShare } = await nodeOperatorRegistry[
                "getNodeOperator(uint256)"
            ].call(this, validatorId);
            return validatorShare;
        };

        stakeOperator = async (user) => {
            await mockStakeManager.connect(user)
                .stakeFor(
                    user.address,
                    toEth("10"),
                    toEth("10"),
                    true,
                    ethers.utils.hexZeroPad("0x01", 64)
                )
        };
    });

    beforeEach(async () => {
        [deployer, ...testers] = await ethers.getSigners();

        insurance = testers[9];

        mockERC20 = (await (
            await ethers.getContractFactory("Polygon")
        ).deploy()) as Polygon;
        await mockERC20.deployed();

        poLidoNFT = (await upgrades.deployProxy(
            await ethers.getContractFactory("PoLidoNFT"),
            ["PoLidoNFT", "LN", ethers.constants.AddressZero]
        )) as PoLidoNFT;
        await poLidoNFT.deployed();

        erc721Contract = (await (
            await ethers.getContractFactory("ERC721Test")
        ).deploy()) as ERC721Test;
        await erc721Contract.deployed();

        mockStakeManager = (await (
            await ethers.getContractFactory("StakeManagerMock")
        ).deploy(mockERC20.address)) as StakeManagerMock;
        await mockStakeManager.deployed();


        nodeOperatorRegistry = (await upgrades.deployProxy(
            await ethers.getContractFactory("NodeOperatorRegistry"),
            [
                mockStakeManager.address,
                mockERC20.address,
                accounts[0].address
            ]
        )) as NodeOperatorRegistry;
        await nodeOperatorRegistry.deployed();

        fxBaseRootMock = await (
            (await ethers.getContractFactory(
                "FxBaseRootMock"
            )) as FxBaseRootMock__factory
        ).deploy();
        await fxBaseRootMock.deployed();

        stMATIC = (await upgrades.deployProxy(
            await ethers.getContractFactory("StMATIC"),
            [
                nodeOperatorRegistry.address,
                mockERC20.address,
                deployer.address,
                insurance.address,
                mockStakeManager.address,
                poLidoNFT.address,
                ethers.constants.AddressZero,
            ]
        )) as StMATIC;
        await stMATIC.deployed();

        await stMATIC.setFxStateRootTunnel(fxBaseRootMock.address);
        await stMATIC.setProtocolFee(10)
        await poLidoNFT.setStMATIC(stMATIC.address);
        await nodeOperatorRegistry.setStMaticAddress(stMATIC.address);

    });

    describe("Submit tokens", function () {
        it("Should submit successfully", async () => {
            const amount = ethers.utils.parseEther("1");
            await mint(user1, amount);
            await mockERC20.connect(user1).approve(stMATIC.address, amount)
            expect(await stMATIC.connect(user1).submit(amount, testers[2].address))
                .emit(stMATIC, "SubmitEvent")
                .withArgs(user1.address, amount, testers[2].address);

            const testerBalance = await stMATIC.balanceOf(user1.address);
            expect(testerBalance.eq(amount)).to.be.true;
        });

        it("Should revert Mint ZERO", async () => {
            await stakeOperator(user1);
            const validatorId = await mockStakeManager.getValidatorId(user1.address)
            await addOperator(validatorId.toString(), user1.address);

            const amount = ethers.utils.parseEther("1000");
            await mint(user1, 100);
            await mint(user1, amount);
            await submit(user1, 100, testers[3].address);
            await mockERC20.connect(user1).transfer(stMATIC.address, amount);
            await stMATIC.distributeRewards()
            await mint(user1, 1);
            await expect(submit(user1, 1, testers[3].address)).revertedWith("Mint ZERO");
        })

        it("Should submit successfully when validator was removed", async () => {
            const amount = ethers.utils.parseEther("1");
            await mint(user1, amount);
            await submit(user1, amount, testers[2].address);

            await stakeOperator(user1);
            const validatorId = await mockStakeManager.getValidatorId(user1.address)
            await addOperator(validatorId.toString(), user1.address);

            let testerBalance = await stMATIC.balanceOf(user1.address);
            expect(testerBalance.eq(amount)).to.be.true;

            await stMATIC.delegate()
            await nodeOperatorRegistry.removeNodeOperator(1)

            await mint(user2, amount);
            await submit(user2, amount, testers[2].address);
            testerBalance = await stMATIC.balanceOf(user2.address);
            expect(testerBalance.eq(amount)).to.be.true;
        });
    });

    describe("Request Withdraw", function () {
        it("Should request withdraw from the contract successfully", async () => {
            const amount = ethers.utils.parseEther("1");
            await mint(user1, amount);
            await submit(user1, amount, testers[2].address);
            expect(await stMATIC.connect(user1).requestWithdraw(amount, testers[4].address))
                .emit(stMATIC, "RequestWithdrawEvent")
                .withArgs(user1.address, amount, testers[4].address)
            const owned = await poLidoNFT.getOwnedTokens(user1.address);
            expect(owned).length(1);
        });

        it("Should request withdraw from the contract when there is a staked operator but delegation didnt happen yet", async () => {
            const amount = ethers.utils.parseEther("100");
            const amount2Submit = ethers.utils.parseEther("0.05");
            await mint(user1, amount);

            await stakeOperator(user1);
            const validatorId = await mockStakeManager.getValidatorId(user1.address)
            await addOperator(validatorId.toString(), user1.address);

            await mint(user1, amount2Submit);
            await submit(user1, amount2Submit, testers[3].address);
            await requestWithdraw(user1, ethers.utils.parseEther("0.005"), testers[4].address);

            const balance = await poLidoNFT.balanceOf(user1.address);
            expect(balance.eq(1)).to.be.true;
        });

        it("Should withdraw from EJECTED operators", async function () {
            const amount = ethers.utils.parseEther("100");
            const amount2Submit = ethers.utils.parseEther("0.05");
            await mint(user1, amount);

            await stakeOperator(user1);
            const validatorId = await mockStakeManager.getValidatorId(user1.address)

            await addOperator(validatorId.toString(), user1.address);

            await mint(user1, amount2Submit);
            await submit(user1, amount2Submit, testers[3].address);

            await mockStakeManager.unstake(validatorId);
            await requestWithdraw(user1, ethers.utils.parseEther("0.005"), testers[4].address);

            const balance = await poLidoNFT.balanceOf(user1.address);
            expect(balance.eq(1)).to.be.true;
        });

        it("Should withdraw from JAILED operators", async function () {
            const amount = ethers.utils.parseEther("200");
            const amount2Submit = ethers.utils.parseEther("150");
            await mint(user1, amount);
            await stakeOperator(user1);
            const validatorId = await mockStakeManager.getValidatorId(user1.address)

            await addOperator(validatorId.toString(), user1.address);
            await mint(user1, amount2Submit);
            await submit(user1, amount2Submit, testers[3].address);

            await mockStakeManager.slash(1);
            await requestWithdraw(user1, ethers.utils.parseEther("0.005"), testers[4].address);
            const balance = await poLidoNFT.balanceOf(user1.address);
            expect(balance.eq(1)).to.be.true;

            const validatorShareAddress = (
                await nodeOperatorRegistry["getNodeOperator(uint256)"](1)
            ).validatorShare;

            const validatorShareBalance = await mockERC20.balanceOf(
                validatorShareAddress
            );

            expect(validatorShareBalance.eq(0)).to.be.true;
        });

        it("Should revert withdraw ZERO Matic", async () => {
            await stakeOperator(user1);
            const validatorId = await mockStakeManager.getValidatorId(user1.address)
            await addOperator(validatorId.toString(), user1.address);

            const submitAmount = ethers.utils.parseEther("1000");
            await mint(user1, submitAmount);
            await submit(user1, submitAmount, testers[3].address);
            await stMATIC.delegate();

            let validatorShareAddress = (
                await nodeOperatorRegistry["getNodeOperator(uint256)"](1)
            ).validatorShare;

            const ValidatorShareMock = await ethers.getContractFactory(
                "ValidatorShareMock"
            );
            const validatorShareContract1 = ValidatorShareMock.attach(
                validatorShareAddress
            ) as ValidatorShareMock;

            const validatorShareBalance1 = await mockERC20.balanceOf(
                validatorShareContract1.address
            );

            const slashPecentage = 50;

            await validatorShareContract1.slash(
                validatorShareBalance1.mul(slashPecentage).div(100)
            );

            await expect(
                stMATIC.connect(user1).requestWithdraw(1, testers[4].address)
            ).revertedWith("Withdraw ZERO Matic")
        });

        it("Should fail request withdraw ZERO shares when balanced", async () => {
            await stakeOperator(user1);
            const validatorId = await mockStakeManager.getValidatorId(user1.address)
            await addOperator(validatorId.toString(), user1.address);

            const submitAmount = ethers.utils.parseEther("100");
            await mint(user1, submitAmount);
            await submit(user1, submitAmount, testers[3].address);
            await stMATIC.delegate();

            let validatorShareAddress = (
                await nodeOperatorRegistry["getNodeOperator(uint256)"](1)
            ).validatorShare;

            const ValidatorShareMock = await ethers.getContractFactory(
                "ValidatorShareMock"
            );
            const validatorShareContract1 = ValidatorShareMock.attach(
                validatorShareAddress
            ) as ValidatorShareMock;

            const validatorShareBalance1 = await mockERC20.balanceOf(
                validatorShareContract1.address
            );
            await validatorShareContract1.setExchangeRate(ethers.utils.parseEther("1000000"))

            await expect(
                stMATIC.connect(user1).requestWithdraw(submitAmount, testers[4].address)
            ).revertedWith("ZERO shares to withdraw")
        })

        it("Should fail request withdraw ZERO shares when not balanced", async () => {
            await stakeOperator(user1);
            await stakeOperator(user2);
            const validatorId1 = await mockStakeManager.getValidatorId(user1.address)
            await addOperator(validatorId1.toString(), user1.address);

            const submitAmount = ethers.utils.parseEther("100");
            await mint(user1, submitAmount);
            await submit(user1, submitAmount, testers[3].address);
            await stMATIC.delegate();

            const validatorId2 = await mockStakeManager.getValidatorId(user2.address)
            await addOperator(validatorId2.toString(), user2.address);
            await mint(user1, submitAmount.div(2));
            await submit(user1, submitAmount.div(2), testers[3].address);
            await stMATIC.delegate();

            let validatorShareAddress = (
                await nodeOperatorRegistry["getNodeOperator(uint256)"](1)
            ).validatorShare;

            const ValidatorShareMock = await ethers.getContractFactory(
                "ValidatorShareMock"
            );
            const validatorShareContract1 = ValidatorShareMock.attach(
                validatorShareAddress
            ) as ValidatorShareMock;

            const validatorShareBalance1 = await mockERC20.balanceOf(
                validatorShareContract1.address
            );
            await validatorShareContract1.setExchangeRate(ethers.utils.parseEther("1000000"))
            
            expect((await nodeOperatorRegistry.getProtocolStats()).distanceThreshold)
                .gt(await nodeOperatorRegistry.DISTANCE_THRESHOLD_PERCENTS())
            await expect(
                stMATIC.connect(user1).requestWithdraw(submitAmount, testers[4].address)
            ).revertedWith("ZERO shares to withdraw")
        })
    });

    describe("Claim tokens", function () {
        it("Should claim tokens when delegation balanced", async () => {

            await stakeOperator(user1);
            const validatorId = await mockStakeManager.getValidatorId(user1.address)
            await addOperator(validatorId.toString(), user1.address);

            const submitAmount = ethers.utils.parseEther("1000");
            await mint(user1, submitAmount);
            await submit(user1, submitAmount, testers[3].address);
            await stMATIC.delegate();

            await requestWithdraw(user1, submitAmount, testers[4].address)
            expect(await stMATIC.getMaticFromTokenId(1)).eq(submitAmount)

            const withdrawalDelay = await mockStakeManager.withdrawalDelay();
            const currentEpoch = await mockStakeManager.epoch();
            await mockStakeManager.setEpoch(withdrawalDelay.add(currentEpoch));

            expect(await mockERC20.balanceOf(user1.address)).eq(0)
            await claimTokens(user1, 1)

            expect(await mockERC20.balanceOf(user1.address)).eq(submitAmount)
            expect(await stMATIC.getTotalPooledMatic()).eq(0)
            expect(await stMATIC.totalBuffered()).eq(0)
        })

        it("Should claim tokens when delegation unbalanced", async () => {

            await stakeOperator(user1);
            let validatorId = await mockStakeManager.getValidatorId(user1.address)
            await addOperator(validatorId.toString(), user1.address);

            await stakeOperator(user2);
            validatorId = await mockStakeManager.getValidatorId(user2.address)
            await addOperator(validatorId.toString(), user2.address);

            const submitAmount = ethers.utils.parseEther("1000");
            await mint(user1, submitAmount);
            await submit(user1, submitAmount, testers[3].address);
            await stMATIC.delegate();

            let requestAmount = toEth("50")
            await requestWithdraw(user1, requestAmount, testers[4].address)
            expect(await stMATIC.getMaticFromTokenId(1)).eq(requestAmount)

            requestAmount = toEth("950")
            await requestWithdraw(user1, requestAmount, testers[4].address)
            expect(await stMATIC.getMaticFromTokenId(2)).eq(requestAmount)

            const withdrawalDelay = await mockStakeManager.withdrawalDelay();
            const currentEpoch = await mockStakeManager.epoch();
            await mockStakeManager.setEpoch(withdrawalDelay.add(currentEpoch));

            expect(await mockERC20.balanceOf(user1.address)).eq(0)
            await claimTokens(user1, 1)
            await claimTokens(user1, 2)
            expect(await mockERC20.balanceOf(user1.address)).eq(submitAmount)

            expect(await stMATIC.getTotalPooledMatic()).eq(0)
            expect(await stMATIC.totalBuffered()).eq(0)
        })

        it("Should claim tokens when delegation unbalanced", async () => {

            await stakeOperator(user1);
            let validatorId = await mockStakeManager.getValidatorId(user1.address)
            await addOperator(validatorId.toString(), user1.address);

            await stakeOperator(user2);
            validatorId = await mockStakeManager.getValidatorId(user2.address)
            await addOperator(validatorId.toString(), user2.address);

            const submitAmount = ethers.utils.parseEther("1000");
            await mint(user1, submitAmount);
            await submit(user1, submitAmount, testers[3].address);

            await mint(user2, submitAmount);
            await submit(user2, submitAmount, testers[2].address);
            await stMATIC.delegate();

            let requestAmount = toEth("50")
            await requestWithdraw(user1, requestAmount, testers[4].address)
            expect(await stMATIC.getMaticFromTokenId(1)).eq(requestAmount)

            await requestWithdraw(user2, requestAmount, testers[4].address)
            expect(await stMATIC.getMaticFromTokenId(2)).eq(requestAmount)

            requestAmount = toEth("950")
            await requestWithdraw(user1, requestAmount, testers[4].address)
            expect(await stMATIC.getMaticFromTokenId(3)).eq(requestAmount)

            await requestWithdraw(user2, requestAmount, testers[4].address)
            expect(await stMATIC.getMaticFromTokenId(4)).eq(requestAmount)

            const withdrawalDelay = await mockStakeManager.withdrawalDelay();
            const currentEpoch = await mockStakeManager.epoch();
            await mockStakeManager.setEpoch(withdrawalDelay.add(currentEpoch));

            expect(await mockERC20.balanceOf(user1.address)).eq(0)
            await claimTokens(user1, 1)
            await claimTokens(user2, 2)
            await claimTokens(user1, 3)
            await claimTokens(user2, 4)
            expect(await mockERC20.balanceOf(user1.address)).eq(submitAmount)
            expect(await stMATIC.getTotalPooledMatic()).eq(0)
            expect(await stMATIC.totalBuffered()).eq(0)
        })

        it("Should claim tokens after submitting to contract successfully", async () => {
            const ownedTokens: BigNumber[][] = [];
            const submitAmounts: string[] = [];
            const withdrawAmounts: string[] = [];

            const [minAmount, maxAmount] = [0.005, 0.01];
            const delegatorsAmount = Math.floor(Math.random() * (10 - 1)) + 1;

            for (let i = 0; i < delegatorsAmount; i++) {
                submitAmounts.push(
                    (Math.random() * (maxAmount - minAmount) + minAmount).toFixed(3)
                );
                const submitAmountWei = ethers.utils.parseEther(submitAmounts[i]);
                await mint(testers[i], submitAmountWei);
                await submit(testers[i], submitAmountWei, testers[2].address);
            }

            await mockStakeManager.setEpoch(1);

            for (let i = 0; i < delegatorsAmount; i++) {
                withdrawAmounts.push(
                    (Math.random() * (Number(submitAmounts[i]) - minAmount) + minAmount).toFixed(3)
                );
                const withdrawAmountWei = ethers.utils.parseEther(withdrawAmounts[i]);
                await requestWithdraw(testers[i], withdrawAmountWei, testers[4].address);
                ownedTokens.push(await poLidoNFT.getOwnedTokens(testers[i].address));
            }

            const withdrawalDelay = await mockStakeManager.withdrawalDelay();
            const currentEpoch = await mockStakeManager.epoch();

            await mockStakeManager.setEpoch(withdrawalDelay.add(currentEpoch));

            for (let i = 0; i < delegatorsAmount; i++) {
                await claimTokens(testers[i], ownedTokens[i][0]);
                const balanceAfter = await mockERC20.balanceOf(testers[i].address);
                expect(balanceAfter.eq(ethers.utils.parseEther(withdrawAmounts[i]))).to.be.true;
            }
        });

        it("Should claim tokens after delegating to validator successfully", async () => {
            const submitAmount = ethers.utils.parseEther("0.01");
            const withdrawAmount = ethers.utils.parseEther("0.005");

            await mint(user1, ethers.utils.parseEther("100"));
            await stakeOperator(user1);
            const validatorId = await mockStakeManager.getValidatorId(user1.address)

            await addOperator(validatorId.toString(), user1.address);
            await mint(user1, submitAmount);
            await submit(user1, submitAmount, testers[3].address);
            await stMATIC.delegate();
            const balanceBefore = await mockERC20.balanceOf(user1.address);
            await requestWithdraw(user1, withdrawAmount, testers[4].address);

            const withdrawalDelay = await mockStakeManager.withdrawalDelay();
            const currentEpoch = await mockStakeManager.epoch();
            await mockStakeManager.setEpoch(withdrawalDelay.add(currentEpoch));

            const owned = await poLidoNFT.getOwnedTokens(user1.address);
            await claimTokens(user1, owned[0]);
            const balanceAfter = await mockERC20.balanceOf(user1.address);

            expect(balanceAfter.sub(balanceBefore).eq(withdrawAmount)).to.be.true;
        });
    });

    describe("Delegate tokens", function () {
        it("Should success not delegate to validator when shares", async () => {
            for (let i = 0; i < 3; i++) {
                await mint(testers[i], ethers.utils.parseEther("100"));

                await stakeOperator(testers[i]);
                const validatorId = await mockStakeManager.getValidatorId(testers[i].address)

                await addOperator(validatorId.toString(), testers[i].address);
            }
            let amount = ethers.utils.parseEther("300");

            await mint(user1, amount);
            await submit(user1, amount, testers[2].address);

            let validatorShareAddress = (
                await nodeOperatorRegistry["getNodeOperator(uint256)"](1)
            ).validatorShare;

            const ValidatorShareMock = await ethers.getContractFactory(
                "ValidatorShareMock"
            );
            const validatorShareContract1 = ValidatorShareMock.attach(
                validatorShareAddress
            ) as ValidatorShareMock;
            
            expect(await mockERC20.balanceOf(stMATIC.address)).eq(amount)
            await validatorShareContract1.setExchangeRate(ethers.utils.parseEther("100000"))
            await stMATIC.delegate();
            expect(await mockERC20.balanceOf(stMATIC.address)).eq(amount.div(3))
        })

        it("Should delegate to validator if stake manager has approval > 0", async () => {
            let initialSubmitAmount = ethers.utils.parseEther("99");
            for (let i = 0; i < 2; i++) {
                await mint(testers[i], ethers.utils.parseEther("100"));

                await stakeOperator(testers[i]);
                const validatorId = await mockStakeManager.getValidatorId(testers[i].address)

                await addOperator(validatorId.toString(), testers[i].address);
            }
            const balanceBefore = await stMATIC.balanceOf(user1.address);

            await mint(user1, initialSubmitAmount);
            await submit(user1, initialSubmitAmount, testers[3].address);
            await stMATIC.delegate();

            const finalSubmitAmount = ethers.utils.parseEther("100");
            await mint(user1, finalSubmitAmount);
            await submit(user1, finalSubmitAmount, testers[3].address);
            await stMATIC.delegate();

            const balanceAfter = await stMATIC.balanceOf(user1.address);
            expect(balanceAfter.sub(balanceBefore).eq(initialSubmitAmount.add(finalSubmitAmount))).to.be.true;
        });

        it("Should delegate to validators", async () => {
            await mint(user1, ethers.utils.parseEther("100"));
            await stakeOperator(user1);
            let validatorId = await mockStakeManager.getValidatorId(user1.address)
            await addOperator(validatorId.toString(), user1.address);

            let submitAmount = ethers.utils.parseEther("10");
            await mint(user1, submitAmount);
            await submit(user1, submitAmount, testers[3].address);

            await stMATIC.delegate()

            submitAmount = ethers.utils.parseEther("30");
            await mint(user1, submitAmount);
            await submit(user1, submitAmount, testers[3].address);

            await requestWithdraw(user1, ethers.utils.parseEther("20"), testers[4].address)
            expect(await stMATIC.reservedFunds()).eq(ethers.utils.parseEther("10"))
            expect(await stMATIC.getTotalPooledMatic()).eq(ethers.utils.parseEther("20"))

            submitAmount = ethers.utils.parseEther("10");
            await mint(user1, submitAmount);
            await submit(user1, submitAmount, testers[3].address);
            await stMATIC.delegate()

            expect(await stMATIC.getTotalStakeAcrossAllValidators()).eq(ethers.utils.parseEther("30"))

            await mint(user2, ethers.utils.parseEther("100"));
            await stakeOperator(user2);
            validatorId = await mockStakeManager.getValidatorId(user2.address)
            await addOperator(validatorId.toString(), user2.address);

            submitAmount = ethers.utils.parseEther("30");
            await mint(user1, submitAmount);
            await submit(user1, submitAmount, testers[3].address);
            await stMATIC.delegate()

            expect(await stMATIC.getTotalStakeAcrossAllValidators()).eq(submitAmount.mul(2))
            expect(await stMATIC.reservedFunds()).eq(ethers.utils.parseEther("10"))
            expect(await stMATIC.getTotalPooledMatic()).eq(ethers.utils.parseEther("60"))
        })

        it("Should stay the same if an attacker sends matic to the validator", async () => {
            const submitAmount = ethers.utils.parseEther("0.01");

            await mint(user1, ethers.utils.parseEther("100"));
            await stakeOperator(user1);
            const validatorId = await mockStakeManager.getValidatorId(user1.address)

            await addOperator(validatorId.toString(), user1.address);
            await mint(user1, submitAmount);
            await submit(user1, submitAmount, testers[3].address);
            await stMATIC.delegate();

            const balanceBefore = await stMATIC.getTotalStakeAcrossAllValidators();
            const operator = await nodeOperatorRegistry["getNodeOperator(uint256)"](1);

            const selfDestructor = (await (
                await ethers.getContractFactory("SelfDestructor")
            ).deploy()) as SelfDestructor;

            await user1.sendTransaction({
                to: selfDestructor.address,
                value: ethers.utils.parseEther("1.0")
            });

            await selfDestructor.selfdestruct(operator.validatorShare);
            const balanceAfter = await stMATIC.getTotalStakeAcrossAllValidators();
            expect(balanceAfter.eq(balanceBefore)).to.be.true;
        });

        it("Should return the correct conversion amount for Matic and StMatic after delegation", async () => {
            for (let i = 0; i < 3; i++) {
                await mint(testers[i], ethers.utils.parseEther("100"));
                await stakeOperator(testers[i]);
                const validatorId = await mockStakeManager.getValidatorId(testers[i].address)
                await addOperator(validatorId.toString(), testers[i].address);
            }

            const user1SubmitAmount = toEth("100");
            await mint(user1, user1SubmitAmount);
            await submit(user1, user1SubmitAmount, testers[3].address);

            let user2SubmitAmount = toEth("100");
            await mint(user2, user2SubmitAmount);
            await submit(user2, user2SubmitAmount, testers[2].address);

            await stMATIC.delegate();

            const stMaticToMatic = await stMATIC.convertStMaticToMatic(100);
            expect(stMaticToMatic.amountInMatic).to.equal(100);
            expect(stMaticToMatic.totalStMaticAmount).to.equal(toEth("200"));
            expect(stMaticToMatic.totalPooledMatic).to.equal(toEth("200"));


            const maticToStMatic = await stMATIC.convertMaticToStMatic(100);
            expect(maticToStMatic.amountInStMatic).to.equal(100);
            expect(maticToStMatic.totalPooledMatic).to.equal(toEth("200"));
            expect(maticToStMatic.totalStMaticSupply).to.equal(toEth("200"));
        });

        //1 validator, n delegators test
        it("Should delegate and claim tokens from n delegators to 1 validator", async () => {
            const ownedTokens: BigNumber[][] = [];
            const submitAmounts: string[] = [];
            const withdrawAmounts: BigNumber[] = [];

            const [minAmount, maxAmount] = [0.005, 0.01];
            const delegatorsAmount = Math.floor(Math.random() * (10 - 1)) + 1;

            await stakeOperator(user1);
            const validatorId = await mockStakeManager.getValidatorId(user1.address)

            await addOperator(validatorId.toString(), user1.address);

            for (let i = 0; i < delegatorsAmount; i++) {
                submitAmounts.push(
                    ((Math.random() * (maxAmount - minAmount) + minAmount) * delegatorsAmount).toFixed(3)
                );
                const submitAmountWei = ethers.utils.parseEther(submitAmounts[i]);

                await mint(testers[i], submitAmountWei);
                await submit(testers[i], submitAmountWei, testers[2].address);
            }

            await stMATIC.delegate();
            for (let i = 0; i < delegatorsAmount; i++) {
                const withdrawAmount = ethers.utils.parseEther(submitAmounts[i]);

                withdrawAmounts.push(withdrawAmount);
                const withdrawAmountWei = withdrawAmounts[i];
                await requestWithdraw(testers[i], withdrawAmountWei, testers[4].address);
                ownedTokens.push(await poLidoNFT.getOwnedTokens(testers[i].address));
            }

            const withdrawalDelay = await mockStakeManager.withdrawalDelay();
            const currentEpoch = await mockStakeManager.epoch();
            await mockStakeManager.setEpoch(withdrawalDelay.add(currentEpoch));

            for (let i = 0; i < delegatorsAmount; i++) {
                await claimTokens(testers[i], ownedTokens[i][0]);
                const balanceAfter = await mockERC20.balanceOf(testers[i].address);
                expect(balanceAfter.eq(withdrawAmounts[i])).to.be.true;
            }
        });

        // n validator, n delegator test
        it("Should delegate and claim from n delegators to m validators successfully", async () => {
            const ownedTokens: BigNumber[][] = [];
            const submitAmounts: string[] = [];
            const withdrawAmounts: string[] = [];

            const [minAmount, maxAmount] = [0.001, 0.1];
            const delegatorsAmount = Math.floor(Math.random() * (10 - 1)) + 1;
            const testersAmount = Math.floor(Math.random() * (10 - 1)) + 1;
            for (let i = 0; i < delegatorsAmount; i++) {
                await stakeOperator(testers[i]);
                const validatorId = await mockStakeManager.getValidatorId(testers[i].address)

                await addOperator(validatorId.toString(), testers[i].address);
            }

            for (let i = 0; i < testersAmount; i++) {
                submitAmounts.push(
                    ((Math.random() * (maxAmount - minAmount) + minAmount) * delegatorsAmount).toFixed(3)
                );
                const submitAmountWei = ethers.utils.parseEther(submitAmounts[i]);

                await mint(testers[i], submitAmountWei);
                await submit(testers[i], submitAmountWei, testers[2].address);
            }

            await stMATIC.delegate();

            for (let i = 0; i < testersAmount; i++) {
                withdrawAmounts.push(
                    (Math.random() * (Number(submitAmounts[i]) - minAmount) + minAmount).toFixed(3)
                );
                const withdrawAmountWei = ethers.utils.parseEther(withdrawAmounts[i]);
                await requestWithdraw(testers[i], withdrawAmountWei, testers[4].address);
                ownedTokens.push(await poLidoNFT.getOwnedTokens(testers[i].address));
            }

            const withdrawalDelay = await mockStakeManager.withdrawalDelay();
            const currentEpoch = await mockStakeManager.epoch();
            await mockStakeManager.setEpoch(withdrawalDelay.add(currentEpoch));

            for (let i = 0; i < testersAmount; i++) {
                for (let j = 0; j < ownedTokens[i].length; j++) {
                    await claimTokens(testers[i], ownedTokens[i][j]);
                }
                const balanceAfter = await mockERC20.balanceOf(testers[i].address);
                expect(balanceAfter.sub(ethers.utils.parseEther(withdrawAmounts[i]))).lte(10);
            }
        });

        it("Shouldn't delegate to validator if delegation flag is false", async () => {
            const submitAmounts: string[] = [];

            const [minAmount, maxAmount] = [0.001, 0.1];
            const delegatorsAmount = 2;
            const testersAmount = Math.floor(Math.random() * (10 - 1)) + 1;
            for (let i = 0; i < delegatorsAmount; i++) {
                await mint(testers[i], ethers.utils.parseEther("100"));
                await stakeOperator(testers[i]);
                const validatorId = await mockStakeManager.getValidatorId(testers[i].address)
                await addOperator(validatorId.toString(), testers[i].address);
            }

            const validatorShareAddress = (
                await nodeOperatorRegistry["getNodeOperator(uint256)"](1)
            ).validatorShare;

            const ValidatorShareMock = await ethers.getContractFactory(
                "ValidatorShareMock"
            );
            const validatorShare = ValidatorShareMock.attach(
                validatorShareAddress
            ) as ValidatorShareMock;

            await validatorShare.updateDelegation(false);

            for (let i = 0; i < testersAmount; i++) {
                submitAmounts.push(
                    ((Math.random() * (maxAmount - minAmount) + minAmount) * delegatorsAmount).toFixed(3)
                );
                const submitAmountWei = ethers.utils.parseEther(submitAmounts[i]);

                await mint(testers[i], submitAmountWei);
                await submit(testers[i], submitAmountWei, testers[2].address);
            }

            await stMATIC.delegate();
            const validatorShareBalance = await mockERC20.balanceOf(
                validatorShareAddress
            );

            expect(validatorShareBalance.eq(0)).to.be.true;
        });

        it("Shouldn't delegate to a delegator that has disabled delegation", async () => {
            const validatorsAmount = 2;
            const testersAmount = 2;
            const submitAmount = ethers.utils.parseEther("1");

            for (let i = 0; i < validatorsAmount; i++) {
                await mint(testers[i], ethers.utils.parseEther("100"));
                await stakeOperator(testers[i]);
                const validatorId = await mockStakeManager.getValidatorId(testers[i].address)
                await addOperator(validatorId.toString(), testers[i].address);
            }

            const validatorShareAddress = (
                await nodeOperatorRegistry["getNodeOperator(uint256)"](1)
            ).validatorShare;
            const ValidatorShareMock = await ethers.getContractFactory(
                "ValidatorShareMock"
            );
            const validatorShare = ValidatorShareMock.attach(
                validatorShareAddress
            ) as ValidatorShareMock;

            await validatorShare.updateDelegation(false);

            for (let i = 0; i < testersAmount; i++) {
                await mint(testers[i], submitAmount);
                await submit(testers[i], submitAmount, testers[2].address);
            }

            await stMATIC.delegate();

            const validatorShareBalance = await mockERC20.balanceOf(
                validatorShareAddress
            );

            expect(validatorShareBalance.eq(0)).to.be.true;

            const delegatedAmount = await stMATIC.getTotalStakeAcrossAllValidators();
            expect(delegatedAmount.eq(submitAmount.mul(testersAmount))).to.be.true;
        });


        it("Should delegate from multiple users to a validator", async () => {
            for (let i = 0; i < 3; i++) {
                await mint(testers[i], ethers.utils.parseEther("100"));
                await stakeOperator(testers[i]);
                const validatorId = await mockStakeManager.getValidatorId(testers[i].address)
                await addOperator(validatorId.toString(), testers[i].address);
            }

            const user1SubmitAmount = toEth("100");
            await mint(user1, user1SubmitAmount);
            await submit(user1, user1SubmitAmount, testers[3].address);

            let user2SubmitAmount = toEth("50");
            await mint(user2, user2SubmitAmount);
            await submit(user2, user2SubmitAmount, testers[2].address);

            //CASE 1: Should delegate to all validators equally
            expect(await stMATIC.delegate())
                .emit(stMATIC, "DelegateEvent")
                .withArgs(toEth("150"), 0);
            for (let i = 0; i < 3; i++) {
                const validatorShare = await getValidatorShare(i + 1);
                expect(await validatorShare.totalStaked()).to.eq(toEth("50"));
            }

            //CASE 2: Check that total buffered is set to 0 after delegation
            expect(await stMATIC.totalBuffered()).to.equal(0);

            await mint(testers[3], toEth("100"));
            await stakeOperator(testers[3]);
            const validatorId = await mockStakeManager.getValidatorId(testers[3].address)
            await addOperator(validatorId.toString(), testers[3].address);

            user2SubmitAmount = toEth("10");
            await mint(user2, user2SubmitAmount);
            await submit(user2, user2SubmitAmount, testers[2].address);

            //CASE 3: Fail to delegate when total buffered is less than minimum amount to delegate
            await stMATIC.setDelegationLowerBound(toEth("50"));
            await expect(stMATIC.delegate()).to.be.revertedWith("Amount to delegate lower than minimum");

            //CASE 4: Successfully delegate if total buffered is greater than delegation lower bound.
            await stMATIC.setDelegationLowerBound(toEth("1"));
            expect(await stMATIC.delegate())
                .emit(stMATIC, "DelegateEvent")
                .withArgs(toEth("10"), 0);
            for (let i = 0; i < 3; i++) {
                const validatorShare = await getValidatorShare(i + 1);
                expect(await validatorShare.totalStaked()).to.eq(toEth("50"));
            }

            const validatorShare = await getValidatorShare(4);
            expect(await validatorShare.totalStaked()).to.eq(toEth("10"));
        });

        it("Should delegate when system is balanced/unbalanced", async () => {
            const totalValidators = 2
            for (let i = 0; i < totalValidators; i++) {
                await mint(testers[i], ethers.utils.parseEther("100"));
                await stakeOperator(testers[i]);
                const validatorId = await mockStakeManager.getValidatorId(testers[i].address)
                await addOperator(validatorId.toString(), testers[i].address);
            }

            const user1SubmitAmount = toEth("100");
            await mint(user1, user1SubmitAmount);
            await submit(user1, user1SubmitAmount, testers[3].address);

            // balanced
            await stMATIC.delegate()

            for (let i = 0; i < totalValidators; i++) {
                const validatorShare = await getValidatorShare(i + 1);
                expect(await validatorShare.totalStaked()).to.eq(toEth("50"));
            }
            await requestWithdraw(user1, toEth("20"), testers[4].address)

            // unbalanced            
            await mint(user1, user1SubmitAmount);
            await submit(user1, user1SubmitAmount, testers[3].address);
            await stMATIC.delegate()

            for (let i = 0; i < totalValidators; i++) {
                const validatorShare = await getValidatorShare(i + 1);
                expect(await validatorShare.totalStaked()).to.eq(toEth("90"));
            }

            await mint(user1, user1SubmitAmount);
            await submit(user1, user1SubmitAmount, testers[3].address);
            await stMATIC.delegate()

            for (let i = 0; i < totalValidators; i++) {
                const validatorShare = await getValidatorShare(i + 1);
                expect(await validatorShare.totalStaked()).to.eq(toEth("140"));
            }
        })
    });

    describe("Rebalance tokens", function () {
        it("Should rebalance delegated tokens to validators", async () => {
            for (let i = 0; i < 3; i++) {
                await mint(testers[i], ethers.utils.parseEther("100"));
                await stakeOperator(testers[i]);
                const validatorId = await mockStakeManager.getValidatorId(testers[i].address)
                await addOperator(validatorId.toString(), testers[i].address);
            }

            const user1SubmitAmount = toEth("100");
            await mint(user1, user1SubmitAmount);
            await submit(user1, user1SubmitAmount, testers[3].address);

            let user2SubmitAmount = toEth("50");
            await mint(user2, user2SubmitAmount);
            await submit(user2, user2SubmitAmount, testers[2].address);

            await stMATIC.delegate();

            await mint(testers[3], toEth("100"));
            await stakeOperator(testers[3]);
            const validatorId = await mockStakeManager.getValidatorId(testers[3].address)
            await addOperator(validatorId.toString(), testers[3].address);

            await nodeOperatorRegistry.setDistanceThreshold(100);

            const maxWithdrawPercentagePerRebalance = 50
            await nodeOperatorRegistry.setMaxWithdrawPercentagePerRebalance(maxWithdrawPercentagePerRebalance);
            await stMATIC.rebalanceDelegatedTokens();

            let totalWithdrawRequestAmount = toEth("0");
            let totalToWithdraw = toEth("18.75");
            for (let i = 0; i < 3; i++) {
                const validatorShare = await getValidatorShare(i + 1);
                totalWithdrawRequestAmount = totalWithdrawRequestAmount
                    .add((await validatorShare.totalWithdrawPoolShares()));
            }

            expect(totalWithdrawRequestAmount, "totalWithdrawRequestAmount").to.equal(totalToWithdraw);
        });

        it("Should rebalance delegated tokens to validators", async () => {
            for (let i = 0; i < 3; i++) {
                await mint(testers[i], ethers.utils.parseEther("100"));
                await stakeOperator(testers[i]);
                const validatorId = await mockStakeManager.getValidatorId(testers[i].address)
                await addOperator(validatorId.toString(), testers[i].address);
            }

            const user1SubmitAmount = toEth("100");
            await mint(user1, user1SubmitAmount);
            await submit(user1, user1SubmitAmount, testers[3].address);

            let user2SubmitAmount = toEth("50");
            await mint(user2, user2SubmitAmount);
            await submit(user2, user2SubmitAmount, testers[2].address);

            await stMATIC.delegate();

            await mint(testers[3], toEth("100"));
            await stakeOperator(testers[3]);
            const validatorId = await mockStakeManager.getValidatorId(testers[3].address)
            await addOperator(validatorId.toString(), testers[3].address);

            let validatorShareAddress = (
                await nodeOperatorRegistry["getNodeOperator(uint256)"](1)
            ).validatorShare;

            const ValidatorShareMock = await ethers.getContractFactory(
                "ValidatorShareMock"
            );
            const validatorShareContract1 = ValidatorShareMock.attach(
                validatorShareAddress
            ) as ValidatorShareMock;
            
            await validatorShareContract1.setExchangeRate(ethers.utils.parseEther("100000"))
            
            await stMATIC.rebalanceDelegatedTokens();
            expect((await stMATIC.getTotalWithdrawRequest()).length).eq(2)
        })

        it("should fail to rebalance delegated tokes when not called by DAO", async () => {
            await expect(stMATIC.connect(user1).rebalanceDelegatedTokens())
                .revertedWith("AccessControl");
        });
    });

    describe("Request withdraw", function () {
        it("Should request withdraw when no delegation", async () => {
            const amount = toEth("100")
            await mint(user1, amount);
            await submit(user1, amount, testers[2].address)
            const tokenId = await requestWithdraw(user1, amount, testers[4].address)
            expect(tokenId, "Invalid requestWithdraw tokenId").not.eq(1)
            await checkToken2WithdrawRequests(1, [{
                amount2WithdrawFromStMATIC: amount,
                validatorNonce: 0,
                validatorAddress: ethers.constants.AddressZero
            }], false)

            expect(await stMATIC.balanceOf(user1.address)).eq(0)
            expect(await stMATIC.getTotalPooledMatic()).eq(0)
            expect(await stMATIC.reservedFunds()).eq(amount)
            const res = await poLidoNFT.getOwnedTokens(user1.address)
            expect(res.length).eq(1)
            expect(res[0]).eq(1)
        })

        it("Should request withdraw unbalance and balance cases", async () => {
            for (let i = 0; i < 3; i++) {
                await stakeOperator(testers[i]);
                const validatorId = await mockStakeManager.getValidatorId(testers[i].address)
                await addOperator(validatorId.toString(), testers[i].address);
            }
            const amount = toEth("3000")
            await mint(user1, amount);
            await submit(user1, amount, testers[2].address)
            await stMATIC.delegate()

            // balanced
            let requestAmount = toEth("300")
            let tokenId = await requestWithdraw(user1, requestAmount, testers[4].address)
            expect(tokenId, "Invalid requestWithdraw tokenId 1").not.eq(1)
            await checkToken2WithdrawRequests(1, [
                {
                    amount2WithdrawFromStMATIC: toEth("0"),
                    validatorNonce: 1,
                }
            ], false)

            let totalPooled = amount.sub(requestAmount)
            expect(await stMATIC.balanceOf(user1.address)).eq(totalPooled)
            expect(await stMATIC.getTotalPooledMatic()).eq(totalPooled)
            let res = await poLidoNFT.getOwnedTokens(user1.address)
            expect(res.length).eq(1)
            expect(res[0]).eq(1)

            // unbalanced
            requestAmount = toEth("900")
            tokenId = await requestWithdraw(user1, toEth("900"), testers[4].address)
            expect(tokenId, "Invalid requestWithdraw tokenId 2").not.eq(2)
            await checkToken2WithdrawRequests(2, [
                {
                    amount2WithdrawFromStMATIC: toEth("0"),
                    validatorNonce: 1,
                },
                {
                    amount2WithdrawFromStMATIC: toEth("0"),
                    validatorNonce: 1,
                },
                {
                    amount2WithdrawFromStMATIC: toEth("0"),
                    validatorNonce: 2,
                },
            ], false)

            totalPooled = totalPooled.sub(requestAmount)
            expect(await stMATIC.balanceOf(user1.address)).eq(totalPooled)
            expect(await stMATIC.getTotalPooledMatic()).eq(totalPooled)
            res = await poLidoNFT.getOwnedTokens(user1.address)
            expect(res.length).eq(2)
            expect(res[0]).eq(1)
            expect(res[1]).eq(2)

            // balanced
            requestAmount = toEth("600")
            tokenId = await requestWithdraw(user1, requestAmount, testers[4].address)
            expect(tokenId, "Invalid requestWithdraw tokenId 3").not.eq(3)
            await checkToken2WithdrawRequests(3, [
                {
                    amount2WithdrawFromStMATIC: toEth("0"),
                    validatorNonce: 3,
                },
                {
                    amount2WithdrawFromStMATIC: toEth("0"),
                    validatorNonce: 2,
                }
            ], false)

            totalPooled = totalPooled.sub(requestAmount)
            expect(await stMATIC.balanceOf(user1.address)).eq(totalPooled)
            expect(await stMATIC.getTotalPooledMatic()).eq(totalPooled)
            res = await poLidoNFT.getOwnedTokens(user1.address)
            expect(res.length).eq(3)
            expect(res[0]).eq(1)
            expect(res[1]).eq(2)
            expect(res[2]).eq(3)

            // unbalanced
            requestAmount = toEth("300")
            tokenId = await requestWithdraw(user1, requestAmount, testers[4].address)
            expect(tokenId, "Invalid requestWithdraw tokenId 4").not.eq(4)
            await checkToken2WithdrawRequests(4, [
                {
                    amount2WithdrawFromStMATIC: toEth("0"),
                    validatorNonce: 2,
                }
            ], false)

            totalPooled = totalPooled.sub(requestAmount)
            expect(await stMATIC.getTotalPooledMatic()).eq(totalPooled)
            res = await poLidoNFT.getOwnedTokens(user1.address)
            expect(res.length).eq(4)
            expect(res[0]).eq(1)
            expect(res[1]).eq(2)
            expect(res[2]).eq(3)
            expect(res[3]).eq(4)

            // balanced
            requestAmount = toEth("900")
            tokenId = await requestWithdraw(user1, requestAmount, testers[4].address)
            expect(tokenId, "Invalid requestWithdraw tokenId 5").not.eq(5)
            await checkToken2WithdrawRequests(5, [
                {
                    amount2WithdrawFromStMATIC: toEth("0"),
                    validatorNonce: 4,
                },
                {
                    amount2WithdrawFromStMATIC: toEth("0"),
                    validatorNonce: 3,
                },
                {
                    amount2WithdrawFromStMATIC: toEth("0"),
                    validatorNonce: 3,
                }
            ], false)

            totalPooled = totalPooled.sub(requestAmount)
            expect(await stMATIC.balanceOf(user1.address)).eq(totalPooled)
            expect(await stMATIC.getTotalPooledMatic()).eq(totalPooled)
            res = await poLidoNFT.getOwnedTokens(user1.address)
            expect(res.length).eq(5)
            expect(res[0]).eq(1)
            expect(res[1]).eq(2)
            expect(res[2]).eq(3)
            expect(res[3]).eq(4)
            expect(res[4]).eq(5)
        })

        it("Should request withdraw exchange rate between stMatic and output Matic when withdraw from multiple validators", async () => {
            for (let i = 0; i < 6; i++) {
                await stakeOperator(accounts[i])
                let validatorId = await mockStakeManager.getValidatorId(accounts[i].address)
                await nodeOperatorRegistry.addNodeOperator(validatorId, accounts[i].address)
            }           

            // User stake
            const amount = toEth("300")
            await mint(user1, amount);
            await submit(user1, amount, user1.address)
            await stMATIC.delegate()

            // Set the protocol fees to 50% to have clean test output
            await stMATIC.setProtocolFee(50)

            // Simulate rewards
            const rewards = toEth("600")
            await mint(user1, rewards);  
            await mockERC20.connect(user1).transfer(stMATIC.address, rewards)
            await stMATIC.distributeRewards()

            // Check if the exchange rate is correct
            const rateMaticToStMatic = (await stMATIC.convertMaticToStMatic(toEth("1"))).amountInStMatic
            const rateStMaticToMatic = (await stMATIC.convertStMaticToMatic(toEth("1"))).amountInMatic
            expect(rateMaticToStMatic, "rateMaticToStMatic").eq(ethers.utils.parseUnits("0.5"))
            expect(rateStMaticToMatic, "rateStMaticToMatic").eq(ethers.utils.parseUnits("2"))

            // User request withdraw
            const withdrawAmountInStMatic = toEth("150")
            await stMATIC.connect(user1).requestWithdraw(withdrawAmountInStMatic, ethers.constants.AddressZero)
            const tokenId = 1
            const expectedAmountInMatic = rateStMaticToMatic.mul(withdrawAmountInStMatic).div(toEth("1"))
            expect((await stMATIC.getToken2WithdrawRequests(tokenId)).length, "getToken2WithdrawRequests").eq(6)
            expect(await stMATIC.getMaticFromTokenId(tokenId), "getMaticFromTokenId").eq(expectedAmountInMatic)

            // User claim
            const withdrawalDelay = await mockStakeManager.withdrawalDelay();
            const currentEpoch = await mockStakeManager.epoch();
            await mockStakeManager.setEpoch(withdrawalDelay.add(currentEpoch));

            const beforeBalanceMatic = await mockERC20.balanceOf(user1.address)
            await stMATIC.connect(user1).claimTokens(tokenId)
            const afterBalanceMatic = await mockERC20.balanceOf(user1.address)

            expect(afterBalanceMatic, "user balance").eq(beforeBalanceMatic.add(expectedAmountInMatic))
            const res = await stMATIC.getToken2WithdrawRequests(tokenId)
            expect(res.length).eq(0)
        })

        it("Should preserve ratio on withdraw over multiple validators", async () => {
            const checkWithdrawAndClaimAmounts = async(
                staker: SignerWithAddress,
                amount: BigNumber,
                _refer: string,
            ) => {
                // TokenId = 1 is minted and attached to the user request.
                const shouldClaimInMatic = (await stMATIC.convertStMaticToMatic(amount)).amountInMatic;
                await requestWithdraw(staker, amount, _refer)
                
                const owned = await poLidoNFT.getOwnedTokens(staker.address);
                const tokenToBurn = owned.at(owned.length - 1) as BigNumber;

                const shouldClaimInMatic1 = await stMATIC.getMaticFromTokenId(tokenToBurn)
                expect(shouldClaimInMatic1, "shouldClaimInMatic").eq(shouldClaimInMatic)

                const withdrawalDelay = await mockStakeManager.withdrawalDelay();
                const currentEpoch = await mockStakeManager.epoch();
                await mockStakeManager.setEpoch(withdrawalDelay.add(currentEpoch));
        
                const userMaticsBeforeClaim = await mockERC20.balanceOf(staker.address);
                await claimTokens(staker, tokenToBurn);
                const userMaticsAfterClaim = await mockERC20.balanceOf(staker.address);
        
                const claimedMatics = userMaticsAfterClaim.sub(userMaticsBeforeClaim);
                expect(claimedMatics, "claimed MATICs != requested MATICs").eq(shouldClaimInMatic);
            }
            
            const totalValidatorsLength = 2;

            for (let i = 0; i < totalValidatorsLength; i++) {
                await mint(testers[i], ethers.utils.parseEther("10"));
                await stakeOperator(testers[i]);
                const validatorId = await mockStakeManager.getValidatorId(testers[i].address)
                await addOperator(validatorId.toString(), testers[i].address);
            }

            const staker = user3;
            const _refer = testers[3].address;

            const userStakeAmount = toEth("100");
            await mint(staker, userStakeAmount);
            await submit(staker, userStakeAmount, _refer);

            await stMATIC.delegate();

            // The protocol is balanced now:
            // stake: [ 50, 50 ]

            // Skewing stMATIC/MATIC ratio to spot the difference later
            await stMATIC.setProtocolFee(50)
            const rewardToDistribute = toEth("100");
            await mint(deployer, rewardToDistribute);
            await mockERC20.transfer(
                await getValidatorShareAddress(1),
                rewardToDistribute,
            );
            await stMATIC.distributeRewards()
            expect((await stMATIC.convertStMaticToMatic(100)).amountInMatic, "unexpected stMATIC ratio").eq(150);

            await checkWithdrawAndClaimAmounts(staker, toEth("20"), _refer);
            // The protocol is unbalanced now:
            // the exchange rate between stMatic<>Matic is 1.5 (1 stMatic = 1.5 Matic)
            // stake after request: [ 20; 50 ]

            // Choising big enough value that cannot be covered by withdraw of N = 2 validators equally
            // since minAmount = 20 and minAmount * N < claimAmountInStMatic and < totalDelegated
            const claimAmountInStMatic = toEth("60")
            await checkWithdrawAndClaimAmounts(staker, claimAmountInStMatic, _refer);
        });

        it("Should request withdraw when total delegated is less than th requested amount, balanced", async () => {
            for (let i = 0; i < 3; i++) {
                await stakeOperator(testers[i]);
                const validatorId = await mockStakeManager.getValidatorId(testers[i].address)
                await addOperator(validatorId.toString(), testers[i].address);
            }

            const amount = toEth("3000")
            await mint(user1, amount);
            await submit(user1, amount, testers[2].address)
            let totalPooled = amount

            await stMATIC.delegate()

            await mint(user1, amount);
            await submit(user1, amount, testers[2].address)
            totalPooled = totalPooled.add(amount)

            // balanced
            const requestAmount = toEth("6000")
            await requestWithdraw(user1, requestAmount, testers[4].address)
            await checkToken2WithdrawRequests(1, [
                {
                    amount2WithdrawFromStMATIC: toEth("0"),
                    validatorNonce: 1,
                },
                {
                    amount2WithdrawFromStMATIC: toEth("0"),
                    validatorNonce: 1,
                },
                {
                    amount2WithdrawFromStMATIC: toEth("0"),
                    validatorNonce: 1,
                },
                {
                    amount2WithdrawFromStMATIC: toEth("3000"),
                    validatorNonce: 0,
                    validatorAddress: ethers.constants.AddressZero
                }
            ], false)

            totalPooled = totalPooled.sub(requestAmount)
            expect(await stMATIC.balanceOf(user1.address)).eq(totalPooled)
            expect(await stMATIC.getTotalPooledMatic()).eq(totalPooled)
            expect(await stMATIC.reservedFunds()).eq(amount)
            const res = await poLidoNFT.getOwnedTokens(user1.address)
            expect(res.length).eq(1)
            expect(res[0]).eq(1)
        })

        it("Should request withdraw exchange Matic/stMatic exchange rate is not 1/1", async () => {
            for (let i = 0; i < 3; i++) {
                await stakeOperator(testers[i]);
                const validatorId = await mockStakeManager.getValidatorId(testers[i].address)
                await addOperator(validatorId.toString(), testers[i].address);
            }

            const amount = toEth("3000")
            let totalPooled = amount
            await mint(user1, amount);
            await submit(user1, amount, testers[2].address)

            await stMATIC.delegate()

            // Skewing stMATIC/MATIC ratio to spot the difference later
            await stMATIC.setProtocolFee(50)
            const rewardToDistribute = toEth("6000");
            await mint(deployer, rewardToDistribute);
            await mockERC20.transfer(
                await getValidatorShareAddress(1),
                rewardToDistribute,
            );
            await stMATIC.distributeRewards()
            expect((await stMATIC.convertStMaticToMatic(100)).amountInMatic, "unexpected stMATIC ratio").eq(200);

            let requestAmountStMatic = toEth("3000")
            const expectedAmountInMatic = (await stMATIC.convertStMaticToMatic(requestAmountStMatic)).amountInMatic

            // balanced
            await requestWithdraw(user1, requestAmountStMatic, testers[4].address)
            await checkToken2WithdrawRequests(1, [
                {
                    amount2WithdrawFromStMATIC: toEth("0"),
                    validatorNonce: 1,
                },
                {
                    amount2WithdrawFromStMATIC: toEth("0"),
                    validatorNonce: 1,
                },
                {
                    amount2WithdrawFromStMATIC: toEth("0"),
                    validatorNonce: 1,
                },
                {
                    amount2WithdrawFromStMATIC: toEth("3000"),
                    validatorNonce: 0,
                    validatorAddress: ethers.constants.AddressZero
                }
            ], false)

            const tokenId = 1
            expect(await stMATIC.balanceOf(user1.address), "balanceOf").eq(0)
            expect(await stMATIC.reservedFunds(), "reservedFunds").eq(toEth("3000"))
            expect(await stMATIC.getMaticFromTokenId(tokenId), "getMaticFromTokenId").eq(expectedAmountInMatic)
            const res = await poLidoNFT.getOwnedTokens(user1.address)
            expect(res.length).eq(tokenId)
            expect(res[0]).eq(tokenId)

            const withdrawalDelay = await mockStakeManager.withdrawalDelay();
            const currentEpoch = await mockStakeManager.epoch();
            await mockStakeManager.setEpoch(withdrawalDelay.add(currentEpoch));

            const userBalanceBefore = await mockERC20.balanceOf(user1.address)
            await stMATIC.connect(user1).claimTokens(tokenId)
            const userBalanceAfter = await mockERC20.balanceOf(user1.address)
            expect(userBalanceAfter, "Expected amount to claim").eq(userBalanceBefore.add(expectedAmountInMatic))
            const res1 = await stMATIC.getToken2WithdrawRequests(tokenId)
            expect(res1.length).eq(0)
        })

        it("Should request withdraw when total delegated is less than th requested amount, unbalanced", async () => {
            for (let i = 0; i < 3; i++) {
                await stakeOperator(testers[i]);
                const validatorId = await mockStakeManager.getValidatorId(testers[i].address)
                await addOperator(validatorId.toString(), testers[i].address);
            }

            const amount = toEth("3000")
            let totalPooled = amount
            await mint(user1, amount);
            await submit(user1, amount, testers[2].address)

            await stMATIC.delegate()

            await mint(user1, amount);
            await submit(user1, amount, testers[2].address)
            totalPooled = totalPooled.add(amount)

            // balanced
            let requestAmount = toEth("300")
            await requestWithdraw(user1, requestAmount, testers[4].address)
            await checkToken2WithdrawRequests(1, [
                {
                    amount2WithdrawFromStMATIC: toEth("0"),
                    validatorNonce: 1,
                }
            ], false)

            totalPooled = totalPooled.sub(requestAmount)
            expect(await stMATIC.balanceOf(user1.address)).eq(totalPooled)
            expect(await stMATIC.getTotalPooledMatic()).eq(totalPooled)
            expect(await stMATIC.reservedFunds()).eq(0)
            let res = await poLidoNFT.getOwnedTokens(user1.address)
            expect(res.length).eq(1)
            expect(res[0]).eq(1)

            // unbalanced
            requestAmount = toEth("5700")
            await requestWithdraw(user1, requestAmount, testers[4].address)
            await checkToken2WithdrawRequests(2, [
                {
                    amount2WithdrawFromStMATIC: toEth("0"),
                    validatorNonce: 1,
                },
                {
                    amount2WithdrawFromStMATIC: toEth("0"),
                    validatorNonce: 1,
                },
                {
                    amount2WithdrawFromStMATIC: toEth("0"),
                    validatorNonce: 2,
                },
                {
                    amount2WithdrawFromStMATIC: toEth("3000"),
                    validatorNonce: 0,
                    validatorAddress: ethers.constants.AddressZero
                }
            ], false)

            totalPooled = totalPooled.sub(requestAmount)
            expect(await stMATIC.balanceOf(user1.address)).eq(0)
            expect(await stMATIC.getTotalPooledMatic()).eq(totalPooled)
            expect(await stMATIC.reservedFunds()).eq(toEth("3000"))
            res = await poLidoNFT.getOwnedTokens(user1.address)
            expect(res.length).eq(2)
            expect(res[0]).eq(1)
            expect(res[1]).eq(2)
        })

        it("Should to request withdraw, Invalid amount", async () => {
            const amount = toEth("3000")
            const amountToRequest = toEth("4000")
            await mint(user1, amount);
            await submit(user1, amount, testers[2].address)
            await expect(requestWithdraw(user1, amountToRequest, testers[4].address))
                .revertedWith("Invalid amount")

            await expect(requestWithdraw(user1, 0, testers[4].address))
                .revertedWith("Invalid amount")
        })

        it("Should request withdraw when multiple users when delegation", async () => {
            const submitAmounts: string[] = [];
            const withdrawAmounts: string[] = [];
            const usersBalance: BigNumber[] = [];

            const [minAmount, maxAmount] = [0.001, 0.1];
            const delegatorsAmount = Math.floor(Math.random() * (10 - 1)) + 1;
            const testersAmount = Math.floor(Math.random() * (10 - 1)) + 1;
            const amountMintPerUser = toEth("1000")
            // Add validators
            for (let i = 0; i < delegatorsAmount; i++) {
                await mint(testers[i], amountMintPerUser);

                await stakeOperator(testers[i]);
                const validatorId = await mockStakeManager.getValidatorId(testers[i].address)

                await addOperator(validatorId.toString(), testers[i].address);
            }

            // Users submit
            for (let i = 0; i < testersAmount; i++) {
                submitAmounts.push(
                    (
                        (Math.random() * (maxAmount - minAmount) + minAmount) *
                        delegatorsAmount
                    ).toFixed(3)
                );
                await mint(testers[i], toEth(submitAmounts[i]));
                await submit(testers[i], toEth(submitAmounts[i]), testers[3].address);
                usersBalance[i] = await stMATIC.balanceOf(testers[i].address)
            }

            // delegate
            await stMATIC.delegate();

            // request withdraw
            for (let i = 0; i < testersAmount; i++) {
                withdrawAmounts.push(
                    (
                        Math.random() * (Number(submitAmounts[i]) - minAmount) +
                        minAmount
                    ).toFixed(3)
                );
                await requestWithdraw(testers[i], toEth(withdrawAmounts[i]), testers[4].address);
                expect(await stMATIC.balanceOf(testers[i].address), `${i}-BalanceOf`).eq(usersBalance[i].sub(toEth(withdrawAmounts[i])))
                expect((await poLidoNFT.getOwnedTokens(testers[i].address)).length, `${i}-getOwnedTokens`).not.eq(0)
                usersBalance[i] = await stMATIC.balanceOf(testers[i].address)
            }
        })

        it("Should request withdraw when multiple users when no delegation", async () => {
            const submitAmounts: string[] = [];
            const withdrawAmounts: string[] = [];
            const usersBalance: BigNumber[] = [];

            const [minAmount, maxAmount] = [0.001, 0.1];
            const delegatorsAmount = Math.floor(Math.random() * (10 - 1)) + 1;
            const testersAmount = Math.floor(Math.random() * (10 - 1)) + 1;
            const amountMintPerUser = toEth("1000")
            // Add validators
            for (let i = 0; i < delegatorsAmount; i++) {
                await mint(testers[i], amountMintPerUser);

                await stakeOperator(testers[i]);
                const validatorId = await mockStakeManager.getValidatorId(testers[i].address)

                await addOperator(validatorId.toString(), testers[i].address);
            }

            // Users submit
            for (let i = 0; i < testersAmount; i++) {
                submitAmounts.push(
                    (
                        (Math.random() * (maxAmount - minAmount) + minAmount) *
                        delegatorsAmount
                    ).toFixed(3)
                );
                await mint(testers[i], toEth(submitAmounts[i]));
                await submit(testers[i], toEth(submitAmounts[i]), testers[3].address);
                usersBalance[i] = await stMATIC.balanceOf(testers[i].address)
            }

            // request withdraw
            for (let i = 0; i < testersAmount; i++) {
                withdrawAmounts.push(
                    (Math.random() * (Number(submitAmounts[i]) - minAmount) + minAmount).toFixed(3)
                );
                await requestWithdraw(testers[i], toEth(withdrawAmounts[i]), testers[4].address);
                expect(await stMATIC.balanceOf(testers[i].address), `${i}-BalanceOf`).eq(usersBalance[i].sub(toEth(withdrawAmounts[i])))
                expect((await poLidoNFT.getOwnedTokens(testers[i].address)).length, `${i}-getOwnedTokens`).not.eq(0)
                usersBalance[i] = await stMATIC.balanceOf(testers[i].address)
            }
        })

        it("Requesting withdraw AFTER slashing should result in lower balance", async () => {
            const ownedTokens: BigNumber[][] = [];
            const submitAmounts: string[] = [];
            const withdrawAmounts: string[] = [];

            const [minAmount, maxAmount] = [0.001, 0.1];
            const delegatorsAmount = Math.floor(Math.random() * (10 - 1)) + 1;
            const testersAmount = Math.floor(Math.random() * (10 - 1)) + 1;

            for (let i = 0; i < delegatorsAmount; i++) {
                await stakeOperator(testers[i]);
                const validatorId = await mockStakeManager.getValidatorId(testers[i].address)
                await addOperator(validatorId.toString(), testers[i].address);
            }

            for (let i = 0; i < testersAmount; i++) {
                submitAmounts.push(
                    ((Math.random() * (maxAmount - minAmount) + minAmount) * delegatorsAmount).toFixed(3)
                );
                const submitAmountWei = ethers.utils.parseEther(submitAmounts[i]);

                await mint(testers[i], submitAmountWei);
                await submit(testers[i], submitAmountWei, testers[3].address);
            }

            await stMATIC.delegate();
            for (let i = 0; i < delegatorsAmount; i++) {
                await slash(i + 1, 10);
            }

            for (let i = 0; i < testersAmount; i++) {
                withdrawAmounts.push(
                    (Math.random() * (Number(submitAmounts[i]) - minAmount) + minAmount).toFixed(3)
                );
                const withdrawAmountWei = ethers.utils.parseEther(withdrawAmounts[i]);
                await requestWithdraw(testers[i], withdrawAmountWei, testers[4].address);
                ownedTokens.push(await poLidoNFT.getOwnedTokens(testers[i].address));
            }

            const withdrawalDelay = await mockStakeManager.withdrawalDelay();
            const currentEpoch = await mockStakeManager.epoch();
            await mockStakeManager.setEpoch(withdrawalDelay.add(currentEpoch));

            for (let i = 0; i < testersAmount; i++) {
                for (let j = 0; j < ownedTokens[i].length; j++) {
                    await claimTokens(testers[i], ownedTokens[i][j]);
                }
                const balanceAfter = await mockERC20.balanceOf(testers[i].address);
                expect(balanceAfter.lt(ethers.utils.parseEther(withdrawAmounts[i]))).to.be.true;
            }
        });

        it("Requesting withdraw BEFORE slashing should result in a lower balance withdrawal", async () => {
            const ownedTokens: BigNumber[][] = [];
            const submitAmounts: string[] = [];
            const withdrawAmounts: string[] = [];

            const [minAmount, maxAmount] = [0.001, 0.1];
            const delegatorsAmount = Math.floor(Math.random() * (10 - 1)) + 1;
            const testersAmount = Math.floor(Math.random() * (10 - 1)) + 1;
            for (let i = 0; i < delegatorsAmount; i++) {
                await stakeOperator(testers[i]);
                const validatorId = await mockStakeManager.getValidatorId(testers[i].address)

                await addOperator(validatorId.toString(), testers[i].address);
            }

            for (let i = 0; i < testersAmount; i++) {
                submitAmounts.push(
                    ((Math.random() * (maxAmount - minAmount) + minAmount) * delegatorsAmount).toFixed(3)
                );
                const submitAmountWei = ethers.utils.parseEther(submitAmounts[i]);
                await mint(testers[i], submitAmountWei);
                await submit(testers[i], submitAmountWei, testers[3].address);
            }

            await stMATIC.delegate();

            for (let i = 0; i < testersAmount; i++) {
                withdrawAmounts.push(
                    (Math.random() * (Number(submitAmounts[i]) - minAmount) + minAmount).toFixed(3)
                );
                const withdrawAmountWei = ethers.utils.parseEther(withdrawAmounts[i]);
                await requestWithdraw(testers[i], withdrawAmountWei, testers[4].address);
                ownedTokens.push(await poLidoNFT.getOwnedTokens(testers[i].address));
            }

            for (let i = 0; i < delegatorsAmount; i++) {
                await slash(i + 1, 10);
            }

            const withdrawalDelay = await mockStakeManager.withdrawalDelay();
            const currentEpoch = await mockStakeManager.epoch();
            await mockStakeManager.setEpoch(withdrawalDelay.add(currentEpoch));

            for (let i = 0; i < testersAmount; i++) {
                for (let j = 0; j < ownedTokens[i].length; j++) {
                    await claimTokens(testers[i], ownedTokens[i][j]);
                }
                const balanceAfter = await mockERC20.balanceOf(testers[i].address);
                expect(balanceAfter.lte(ethers.utils.parseEther(withdrawAmounts[i]))).to.be.true;
            }
        });

        it("Should fail request withdraw Too much to withdraw", async () => {
            await stakeOperator(user1);
            const validatorId = await mockStakeManager.getValidatorId(user1.address)
            await addOperator(validatorId.toString(), user1.address);

            const amount = toEth("3000")
            await mint(user1, amount);
            await submit(user1, amount, testers[2].address)

            await stMATIC.delegate()
            await nodeOperatorRegistry.removeNodeOperator(1)

            await expect(requestWithdraw(user1, amount, testers[4].address))
                .revertedWith("Too much to withdraw")

            await mint(user1, amount);
            await submit(user1, amount, testers[2].address)

            expect((await poLidoNFT.getOwnedTokens(user1.address)).length).eq(0)
            await requestWithdraw(user1, amount, testers[4].address)

            expect((await poLidoNFT.getOwnedTokens(user1.address)).length).eq(1)
            expect(await stMATIC.getMaticFromTokenId(1)).eq(amount)
        })

        it("Should fail to request withdraw: Too much to withdraw", async () => {

        })
    });

    describe("Distribute rewards", async () => {
        describe("Success cases", async () => {
            const numOperators = 3;
            beforeEach("setup", async () => {
                for (let i = 1; i <= numOperators; i++) {
                    await stakeOperator(testers[i]);
                    const validatorId = await mockStakeManager.getValidatorId(testers[i].address)

                    await addOperator(validatorId.toString(), testers[i].address);
                }
                await stMATIC.setDelegationLowerBound(5);
            });

            class TestCase {
                message: string;
                rewardPerValidator: number;
                insuraceRewards: string;
                daoRewards: string;
                delegate: boolean;
                amountSubmittedPerUser: number;
                expectedTotalBuffred: number;

                constructor(
                    message: string,
                    rewardPerValidator: number,
                    insuraceRewards: string,
                    daoRewards: string,
                    delegate: boolean,
                    amountSubmittedPerUser: number,
                    expectedTotalBuffred: number
                ) {
                    this.message = message;
                    this.rewardPerValidator = rewardPerValidator;
                    this.insuraceRewards = insuraceRewards;
                    this.daoRewards = daoRewards;
                    this.delegate = delegate;
                    this.amountSubmittedPerUser = amountSubmittedPerUser;
                    this.expectedTotalBuffred = expectedTotalBuffred;
                }
            }

            const testCases: Array<TestCase> = [{
                message: "distribute rewards: totalBuffred == 0",
                rewardPerValidator: 100,
                insuraceRewards: "7500000000000000000",
                daoRewards: "7500000000000000000",
                delegate: true,
                amountSubmittedPerUser: 10,
                expectedTotalBuffred: 270
            }, {
                message: "distribute rewards: totalBuffred != 0",
                rewardPerValidator: 100,
                insuraceRewards: "7500000000000000000",
                daoRewards: "7500000000000000000",
                delegate: false,
                amountSubmittedPerUser: 10,
                expectedTotalBuffred: 300 // (270 of 90% of rewards + 30 submitted by users)
            }];

            for (let index = 0; index < testCases.length; index++) {
                const {
                    message,
                    rewardPerValidator,
                    insuraceRewards,
                    daoRewards,
                    delegate,
                    amountSubmittedPerUser,
                    expectedTotalBuffred
                } = testCases[index];

                it(index + " " + message, async () => {
                    for (let i = 1; i <= numOperators; i++) {
                        await mint(
                            testers[i],
                            ethers.utils.parseEther(amountSubmittedPerUser.toString())
                        );
                        await submit(
                            testers[i],
                            ethers.utils.parseEther(amountSubmittedPerUser.toString()),
                            testers[3].address
                        );

                        // transfer some tokens to the validatorShare contracts to mimic rewards.
                        await mint(
                            deployer,
                            ethers.utils.parseEther(String(rewardPerValidator))
                        );
                        await mockERC20.transfer(
                            await getValidatorShareAddress(i),
                            ethers.utils.parseEther(String(rewardPerValidator))
                        );
                    }
                    if (delegate) {
                        // delegate and check the totalBuffred
                        await stMATIC.delegate();
                        expect(await stMATIC.totalBuffered(), "totalBuffered").eq(0);
                    } else {
                        //check the totalBuffered
                        expect(await stMATIC.totalBuffered(), "totalBuffered").eq(
                            ethers.utils.parseEther(String(amountSubmittedPerUser * numOperators))
                        );
                    }

                    // calculate rewards
                    const totalRewards = rewardPerValidator * numOperators;
                    const rewards = (totalRewards * 10) / 100;
                    const DAOBalanceBeforeDistribute = await mockERC20.balanceOf(
                        deployer.address
                    );

                    //distribute rewards
                    expect(await stMATIC.distributeRewards())
                        .emit(stMATIC, "DistributeRewardsEvent")
                        .withArgs(ethers.utils.parseEther(String(rewards)));

                    // check totalBuffred with expectedTotalBuffred
                    expect(await stMATIC.totalBuffered(), "after totalBuffered").eq(
                        ethers.utils.parseEther(String(expectedTotalBuffred))
                    );

                    // check if insurance and DAO received the correct amount
                    expect(await mockERC20.balanceOf(insurance.address)).eq(insuraceRewards);
                    expect((await mockERC20.balanceOf(deployer.address)).sub(DAOBalanceBeforeDistribute)).eq(daoRewards);

                    const rewardsPerValidator = ethers.utils.parseEther("5");
                    // check operators rewards
                    for (let ii = 0; ii < numOperators; ii++) {
                        const op = await nodeOperatorRegistry["getNodeOperator(uint256)"].call(this, ii + 1);
                        expect(await mockERC20.balanceOf(op.rewardAddress)).eq(rewardsPerValidator);
                    }
                });
            }
        });

        it("should not revert if a validator does not accumulate enough rewards", async () => {
            const numOperators = 2;
            for (let i = 1; i <= numOperators; i++) {
                //await mint(testers[i], ethers.utils.parseEther("100"));
                await stakeOperator(testers[i]);
                const validatorId = await mockStakeManager.getValidatorId(testers[i].address)

                await addOperator(validatorId.toString(), testers[i].address);
            }
            await stMATIC.setDelegationLowerBound(5);

            await stMATIC.setRewardDistributionLowerBound(
                ethers.utils.parseEther("100")
            );

            const validatorShareRewards = [1000, 10];
            for (let i = 1; i <= numOperators; i++) {
                await mint(testers[i], ethers.utils.parseEther("10"));
                await submit(testers[i], ethers.utils.parseEther(String(10)), testers[3].address);

                // transfer some tokens to the validatorShare contracts to mimic rewards.
                const rewardAmount = validatorShareRewards[i - 1];
                await mint(deployer, ethers.utils.parseEther(rewardAmount.toString()));
                await mockERC20.transfer(
                    await getValidatorShareAddress(i),
                    ethers.utils.parseEther(rewardAmount.toString())
                );
            }

            const totalRewards = 1010;
            const rewards = (totalRewards * 10) / 100;

            expect(await stMATIC.distributeRewards())
                .emit(stMATIC, "DistributeRewardsEvent")
                .withArgs(ethers.utils.parseEther(String(rewards)));

            const rewardPerValidator = ethers.utils.parseEther("25.25");
            const operator1 = await nodeOperatorRegistry["getNodeOperator(uint256)"].call(this, 1);
            expect(
                await mockERC20.balanceOf(operator1.rewardAddress)
            ).eq(rewardPerValidator);

            const operator2 = await nodeOperatorRegistry["getNodeOperator(uint256)"].call(this, 2);
            expect(
                await mockERC20.balanceOf(operator2.rewardAddress)
            ).eq(rewardPerValidator);
        })

        it("Should fail amount to distribute lower than minimum", async () => {
            const numOperators = 3;
            for (let i = 1; i <= numOperators; i++) {
                await mint(testers[i], ethers.utils.parseEther("100"));
                await stakeOperator(testers[i]);
                const validatorId = await mockStakeManager.getValidatorId(testers[i].address)

                await addOperator(validatorId.toString(), testers[i].address);
            }
            await stMATIC.setDelegationLowerBound(5);

            await stMATIC.setRewardDistributionLowerBound(
                ethers.utils.parseEther("100")
            );

            for (let i = 1; i <= numOperators; i++) {
                await mint(testers[i], ethers.utils.parseEther("10"));
                await submit(testers[i], ethers.utils.parseEther(String(10)), testers[3].address);

                // transfer some tokens to the validatorShare contracts to mimic rewards.
                await mint(deployer, ethers.utils.parseEther("1"));
                await mockERC20.transfer(
                    await getValidatorShareAddress(i),
                    ethers.utils.parseEther(String(1))
                );

                await expect(stMATIC.distributeRewards()).revertedWith(
                    "Amount to distribute lower than minimum"
                );
            }
        });
    });

    describe("withdrawTotalDelegated", async () => {
        it("Should Success withdrawTotalDelegated when shares are ZERO", async () => {
            await stakeOperator(user1);
            
            const amount = ethers.utils.parseEther("100")
            await mint(user1, amount);
            await submit(user1, amount, testers[2].address)
            await addOperator("1", user1.address);
            await stMATIC.delegate();

            let validatorShareAddress = (
                await nodeOperatorRegistry["getNodeOperator(uint256)"](1)
            ).validatorShare;

            const ValidatorShareMock = await ethers.getContractFactory(
                "ValidatorShareMock"
            );
            const validatorShareContract1 = ValidatorShareMock.attach(
                validatorShareAddress
            ) as ValidatorShareMock;

            validatorShareContract1.setExchangeRate(ethers.utils.parseEther("100000"))
            expect((await stMATIC.getTotalWithdrawRequest()).length).eq(0)
            await nodeOperatorRegistry.removeNodeOperator(1)
            expect((await stMATIC.getTotalWithdrawRequest()).length).eq(0)
        })

        describe("Success cases", async () => {
            // stake operators
            const operatorId = 3;
            beforeEach("setup", async () => {
                for (let i = 1; i <= operatorId; i++) {
                    await mint(testers[i], ethers.utils.parseEther("100"));
                    await stakeOperator(testers[i]);
                    const validatorId = await mockStakeManager.getValidatorId(testers[i].address)

                    await addOperator(validatorId.toString(), testers[i].address);
                    await stMATIC.setDelegationLowerBound(1);
                }
            });

            class TestCase {
                message: string;
                delegate: boolean;
                tokenIds: Array<number>;

                constructor(
                    message: string,
                    delegate: boolean,
                    tokenIds: Array<number>
                ) {
                    this.message = message;
                    this.delegate = delegate;
                    this.tokenIds = tokenIds;
                }
            }

            const testCases: Array<TestCase> = [
                {
                    message: "Withdraw when delegated amount != 0",
                    delegate: true,
                    tokenIds: [0, 1, 2]
                },
                {
                    message: "Withdraw when delegated amount == 0",
                    delegate: false,
                    tokenIds: []
                }
            ];

            for (let index = 0; index < testCases.length; index++) {
                const { message, delegate, tokenIds } = testCases[index];

                it(index + " " + message, async () => {
                    // if delegate is true users submit.
                    if (delegate) {
                        for (let i = 1; i <= 3; i++) {
                            await mint(testers[i], ethers.utils.parseEther("10"));
                            await submit(testers[i], ethers.utils.parseEther("10"), testers[3].address);
                        }
                        await stMATIC.delegate();
                    }

                    // set stakeManager epoch
                    const epoch = 20;
                    await mockStakeManager.setEpoch(epoch);

                    await removeOperator("1");
                    await removeOperator("2");
                    await removeOperator("3");

                    for (let i = 0; i < tokenIds.length; i++) {
                        //check if the withdrawRequest has correct data
                        const withdrawRequest = await stMATIC.stMaticWithdrawRequest(
                            tokenIds[i]
                        );
                        expect(withdrawRequest.validatorNonce).not.eq(0);
                        expect(withdrawRequest.requestEpoch).not.eq(epoch);
                    }
                });
            }
        });
        it("Should fail to withdrawTotalDelegated caller not node operator", async () => {
            await expect(
                stMATIC.withdrawTotalDelegated(ethers.constants.AddressZero)
            ).revertedWith("Not a node operator");
        });
    });

    describe("Claim tokens from validator to StMatic contract", async () => {
        let validatorId: BigNumber;

        beforeEach(async () => {
            await stakeOperator(user1);
            validatorId = await mockStakeManager.getValidatorId(user1.address)
            await addOperator(validatorId.toString(), user1.address);
        });

        it("should successfully claim tokens from validator to StMatic contract", async function () {
            const amountToDelegate = toEth("100");
            for (let i = 1; i <= 3; i++) {
                await mint(testers[i], amountToDelegate);
                await submit(testers[i], amountToDelegate, testers[3].address);
            }
            await stMATIC.delegate();
            const vs = (await nodeOperatorRegistry["getNodeOperator(uint256)"].call(this, validatorId)).validatorShare
            await nodeOperatorRegistry.removeNodeOperator(validatorId);

            const withdrawalDelay = await mockStakeManager.withdrawalDelay();
            const currentEpoch = await mockStakeManager.epoch();
            await mockStakeManager.setEpoch(withdrawalDelay.add(currentEpoch));

            const amountToClaim = amountToDelegate.mul(3);
            const bufferedAmountBeforeClaim = await stMATIC.totalBuffered();
            expect(await stMATIC.claimTokensFromValidatorToContract(0))
                .emit(stMATIC, "ClaimTotalDelegatedEvent")
                .withArgs(vs, amountToClaim);

            const bufferedAmountAfterClaim = await stMATIC.totalBuffered();
            expect(bufferedAmountAfterClaim.sub(bufferedAmountBeforeClaim), "totalBuffered").eq(amountToClaim);
        });

        it("should fail when token does not belong to StMatic contract", async function () {
            const amountToDelegate = toEth("100");
            for (let i = 1; i <= 3; i++) {
                await mint(testers[i], amountToDelegate);
                await submit(testers[i], amountToDelegate, testers[3].address);
            }
            await stMATIC.delegate();
            await stMATIC.connect(user3).requestWithdraw(toEth("10"), testers[4].address);

            await expect(stMATIC.connect(user2).claimTokensFromValidatorToContract(1))
                .revertedWith("invalid index")
        });

        it("should fail when withdrawal delay has not elapsed", async function () {
            const amountToDelegate = toEth("100");
            for (let i = 1; i <= 3; i++) {
                await mint(testers[i], amountToDelegate);
                await submit(testers[i], amountToDelegate, testers[3].address);
            }
            await stMATIC.delegate();
            await nodeOperatorRegistry.removeNodeOperator(validatorId);

            await expect(stMATIC.connect(user2).claimTokensFromValidatorToContract(0))
                .revertedWith("Not able to claim yet")
        });
    });

    describe("Setters", function () {
        it("Should pause the contract successfully", async () => {
            await stMATIC.pause();
            await expect(stMATIC.delegate()).to.be.revertedWith("Pausable: paused");
        });

        it("Should fail pause the contract successfully", async () => {
            await expect(stMATIC.connect(user2).pause()).reverted;
        });

        it("Update dao address", async () => {
            const newDAOAdress = testers[5].address;

            const daoRole = await stMATIC.DAO();
            // expect(await stMATIC.hasRole(daoRole, deployer.address), "Before").true;
            // expect(await stMATIC.hasRole(daoRole, newDAOAdress), "Before").false;
            await stMATIC.setDaoAddress(newDAOAdress);
            expect(await stMATIC.dao(), "After").eq(newDAOAdress);
        });

        it("should set the insurance address", async () => {
            expect(await stMATIC.setInsuranceAddress(user2.address))
                .emit(stMATIC, "SetInsuranceAddress")
                .withArgs(user2.address);
        });

        it("should set the Node Operator Registry address", async () => {
            expect(await stMATIC.setNodeOperatorRegistryAddress(user1.address))
                .emit(stMATIC, "SetNodeOperatorRegistryAddress")
                .withArgs(user1.address);
        });

        it("should set the delegation lower bound", async () => {
            expect(await stMATIC.setDelegationLowerBound(user3.address))
                .emit(stMATIC, "SetDelegationLowerBound")
                .withArgs(user3.address);
        });

        it("should set the protocol fee", async () => {
            const oldProtocolFee = 10
            const newProtocolFee = 20
            expect(await stMATIC.setProtocolFee(newProtocolFee))
                .emit(stMATIC, "SetProtocolFee")
                .withArgs(oldProtocolFee, newProtocolFee);
        });

        it("should fail set the protocol fee", async () => {
            const newProtocolFee = 20
            await expect(stMATIC.connect(user2).setProtocolFee(newProtocolFee)).reverted
        });
    });

    describe("Get Matic From Token Id", function () {
        it("Should getMaticFromTokenId", async () => {
            await stakeOperator(user1);
            const validatorId = await mockStakeManager.getValidatorId(user1.address)
            await addOperator(validatorId.toString(), user1.address);

            const submitAmount = toEth("3000");
            await mint(user1, submitAmount);
            await submit(user1, submitAmount, testers[3].address);
            await stMATIC.delegate();
            await requestWithdraw(user1, toEth("30"), testers[4].address);
            expect(await stMATIC.getMaticFromTokenId(1)).eq(toEth("30"));
        });

        it("Should getMaticFromTokenId", async () => {
            const numOperators = 3;
            for (let i = 1; i <= numOperators; i++) {
                await stakeOperator(testers[i]);
                const validatorId = await mockStakeManager.getValidatorId(testers[i].address)
                await addOperator(validatorId.toString(), testers[i].address);
            }

            const submitAmount = toEth("3000");
            const requestAmount = toEth("50");

            await mint(user1, submitAmount);
            await submit(user1, submitAmount, testers[3].address);
            await stMATIC.delegate();
            await requestWithdraw(user1, requestAmount, testers[4].address);
            expect(await stMATIC.getMaticFromTokenId(1)).eq(requestAmount);
        });

        it("Should getMaticFromTokenId when no delegation", async () => {
            const numOperators = 3;
            for (let i = 1; i <= numOperators; i++) {
                await stakeOperator(testers[i]);
                const validatorId = await mockStakeManager.getValidatorId(testers[i].address)
                await addOperator(validatorId.toString(), testers[i].address);
            }

            const submitAmount = toEth("300");

            await mint(user1, submitAmount);
            await submit(user1, submitAmount, testers[3].address);
            await requestWithdraw(user1, submitAmount, testers[4].address);

            expect(await stMATIC.getTotalPooledMatic(), "getTotalPooledMatic").eq(0);
            expect(await stMATIC.getMaticFromTokenId(1), "getMaticFromTokenId").eq(submitAmount);
        });
    });

    describe("Claim Tokens From Validator To Contract", async () => {
        it("Should successfully claim tokens from validator to stMatic contract", async function () {
            const numOperators = 3;
            for (let i = 1; i <= numOperators; i++) {
                await stakeOperator(testers[i]);
                const validatorId = await mockStakeManager.getValidatorId(testers[i].address)
                await addOperator(validatorId.toString(), testers[i].address);
            }

            const amountToDelegate = toEth("300");
            await mint(user1, amountToDelegate);
            await submit(user1, amountToDelegate, testers[3].address);
            await stMATIC.delegate();

            expect(await stMATIC.getTotalPooledMatic()).eq(amountToDelegate);
            await nodeOperatorRegistry.removeNodeOperator(1);
            await nodeOperatorRegistry.removeNodeOperator(2);
            await nodeOperatorRegistry.removeNodeOperator(3);
            expect(await stMATIC.getTotalPooledMatic()).eq(amountToDelegate);

            const withdrawalDelay = await mockStakeManager.withdrawalDelay();
            const currentEpoch = await mockStakeManager.epoch();
            await mockStakeManager.setEpoch(withdrawalDelay.add(currentEpoch));

            expect(await stMATIC.claimTokensFromValidatorToContract(2))
                .emit(stMATIC, "ClaimTotalDelegatedEvent");
            expect(await stMATIC.getTotalPooledMatic()).eq(amountToDelegate);
            expect(await stMATIC.totalBuffered()).eq(amountToDelegate.div(3));

            expect(await stMATIC.claimTokensFromValidatorToContract(0))
                .emit(stMATIC, "ClaimTotalDelegatedEvent");
            expect(await stMATIC.getTotalPooledMatic()).eq(amountToDelegate);
            expect(await stMATIC.totalBuffered()).eq(amountToDelegate.div(3).mul(2));

            expect(await stMATIC.claimTokensFromValidatorToContract(0))
                .emit(stMATIC, "ClaimTotalDelegatedEvent");
            expect(await stMATIC.getTotalPooledMatic()).eq(amountToDelegate);
            expect(await stMATIC.totalBuffered()).eq(amountToDelegate);

            expect(await stMATIC.totalBuffered()).eq(amountToDelegate);
        });

        it("should successfully claim tokens from validator to StMatic contract before slashing", async function () {
            const numOperators = 3;
            for (let i = 1; i <= numOperators; i++) {
                await stakeOperator(testers[i]);
                const validatorId = await mockStakeManager.getValidatorId(testers[i].address)
                await addOperator(validatorId.toString(), testers[i].address);
            }

            const amountToDelegate = toEth("300");
            await mint(user1, amountToDelegate);
            await submit(user1, amountToDelegate, testers[3].address);
            await stMATIC.delegate();

            expect(await stMATIC.getTotalPooledMatic()).eq(amountToDelegate);
            let validatorShareAddress = (
                await nodeOperatorRegistry["getNodeOperator(uint256)"](1)
            ).validatorShare;

            const ValidatorShareMock = await ethers.getContractFactory(
                "ValidatorShareMock"
            );
            const validatorShareContract1 = ValidatorShareMock.attach(
                validatorShareAddress
            ) as ValidatorShareMock;

            const validatorShareBalance1 = await mockERC20.balanceOf(
                validatorShareContract1.address
            );

            validatorShareAddress = (
                await nodeOperatorRegistry["getNodeOperator(uint256)"](2)
            ).validatorShare;

            const validatorShareContract2 = ValidatorShareMock.attach(
                validatorShareAddress
            ) as ValidatorShareMock;

            const validatorShareBalance2 = await mockERC20.balanceOf(
                validatorShareContract2.address
            );

            validatorShareAddress = (
                await nodeOperatorRegistry["getNodeOperator(uint256)"](3)
            ).validatorShare;

            const validatorShareContract3 = ValidatorShareMock.attach(
                validatorShareAddress
            ) as ValidatorShareMock;

            const validatorShareBalance3 = await mockERC20.balanceOf(
                validatorShareContract3.address
            );

            const slashPecentage = 50;

            await validatorShareContract1.slash(
                validatorShareBalance1.mul(slashPecentage).div(100)
            );

            await validatorShareContract2.slash(
                validatorShareBalance2.mul(slashPecentage).div(100)
            );

            await validatorShareContract3.slash(
                validatorShareBalance3.mul(slashPecentage).div(100)
            );

            await nodeOperatorRegistry.removeNodeOperator(1);
            await nodeOperatorRegistry.removeNodeOperator(2);
            await nodeOperatorRegistry.removeNodeOperator(3);

            expect(await stMATIC.getTotalPooledMatic()).eq(amountToDelegate.mul(slashPecentage).div(100));

            const withdrawalDelay = await mockStakeManager.withdrawalDelay();
            const currentEpoch = await mockStakeManager.epoch();
            await mockStakeManager.setEpoch(withdrawalDelay.add(currentEpoch));

            expect(await stMATIC.claimTokensFromValidatorToContract(0))
                .emit(stMATIC, "ClaimTotalDelegatedEvent");
            expect(await stMATIC.getTotalPooledMatic()).eq(amountToDelegate.mul(slashPecentage).div(100));

            expect(await stMATIC.claimTokensFromValidatorToContract(0))
                .emit(stMATIC, "ClaimTotalDelegatedEvent");
            expect(await stMATIC.getTotalPooledMatic()).eq(amountToDelegate.mul(slashPecentage).div(100));

            expect(await stMATIC.claimTokensFromValidatorToContract(0))
                .emit(stMATIC, "ClaimTotalDelegatedEvent");
            expect(await stMATIC.getTotalPooledMatic()).eq(amountToDelegate.mul(slashPecentage).div(100));

            expect(await stMATIC.totalBuffered()).eq(amountToDelegate.mul(slashPecentage).div(100));
        });

        it("should successfully claim tokens from validator to StMatic contract After Slashing", async function () {
            const numOperators = 3;
            for (let i = 1; i <= numOperators; i++) {
                await stakeOperator(testers[i]);
                const validatorId = await mockStakeManager.getValidatorId(testers[i].address)
                await addOperator(validatorId.toString(), testers[i].address);
            }

            const amountToDelegate = toEth("300");
            await mint(user1, amountToDelegate);
            await submit(user1, amountToDelegate, testers[3].address);
            await stMATIC.delegate();

            expect(await stMATIC.getTotalPooledMatic()).eq(amountToDelegate);
            let validatorShareAddress = (
                await nodeOperatorRegistry["getNodeOperator(uint256)"](1)
            ).validatorShare;

            const ValidatorShareMock = await ethers.getContractFactory(
                "ValidatorShareMock"
            );
            const validatorShareContract1 = ValidatorShareMock.attach(
                validatorShareAddress
            ) as ValidatorShareMock;

            const validatorShareBalance1 = await mockERC20.balanceOf(
                validatorShareContract1.address
            );

            validatorShareAddress = (
                await nodeOperatorRegistry["getNodeOperator(uint256)"](2)
            ).validatorShare;

            const validatorShareContract2 = ValidatorShareMock.attach(
                validatorShareAddress
            ) as ValidatorShareMock;

            const validatorShareBalance2 = await mockERC20.balanceOf(
                validatorShareContract2.address
            );

            validatorShareAddress = (
                await nodeOperatorRegistry["getNodeOperator(uint256)"](3)
            ).validatorShare;

            const validatorShareContract3 = ValidatorShareMock.attach(
                validatorShareAddress
            ) as ValidatorShareMock;

            const validatorShareBalance3 = await mockERC20.balanceOf(
                validatorShareContract3.address
            );

            expect(await stMATIC.getTotalPooledMatic()).eq(amountToDelegate);
            await nodeOperatorRegistry.removeNodeOperator(1);
            await nodeOperatorRegistry.removeNodeOperator(2);
            await nodeOperatorRegistry.removeNodeOperator(3);
            expect(await stMATIC.getTotalPooledMatic()).eq(amountToDelegate);

            const slashPecentage = 50;

            await validatorShareContract1.slash(
                validatorShareBalance1.mul(slashPecentage).div(100)
            );

            await validatorShareContract2.slash(
                validatorShareBalance2.mul(slashPecentage).div(100)
            );

            await validatorShareContract3.slash(
                validatorShareBalance3.mul(slashPecentage).div(100)
            );

            const withdrawalDelay = await mockStakeManager.withdrawalDelay();
            const currentEpoch = await mockStakeManager.epoch();
            await mockStakeManager.setEpoch(withdrawalDelay.add(currentEpoch));

            expect(await stMATIC.claimTokensFromValidatorToContract(0))
                .emit(stMATIC, "ClaimTotalDelegatedEvent");
            expect(await stMATIC.getTotalPooledMatic()).eq(amountToDelegate.mul(slashPecentage).div(100));

            expect(await stMATIC.claimTokensFromValidatorToContract(1))
                .emit(stMATIC, "ClaimTotalDelegatedEvent");
            expect(await stMATIC.getTotalPooledMatic()).eq(amountToDelegate.mul(slashPecentage).div(100));

            expect(await stMATIC.claimTokensFromValidatorToContract(0))
                .emit(stMATIC, "ClaimTotalDelegatedEvent");
            expect(await stMATIC.getTotalPooledMatic()).eq(amountToDelegate.mul(slashPecentage).div(100));

            expect(await stMATIC.totalBuffered()).eq(amountToDelegate.mul(slashPecentage).div(100));
        });
    });

    describe("withdraw Total Delegated", async () => {
        it("Should withdraw total delegated when delegated", async () => {
            const numOperators = 3;
            for (let i = 1; i <= numOperators; i++) {
                await stakeOperator(testers[i]);
                const validatorId = await mockStakeManager.getValidatorId(testers[i].address)
                await addOperator(validatorId.toString(), testers[i].address);
            }

            for (let i = 1; i <= 10; i++) {
                await mint(testers[i], toEth("10"));
                await submit(testers[i], toEth("10"), testers[3].address);
            }

            await stMATIC.delegate();

            await nodeOperatorRegistry.removeNodeOperator(1);
            let reqs = await stMATIC.getTotalWithdrawRequest()
            expect(reqs.length).eq(1);

            await nodeOperatorRegistry.removeNodeOperator(2);
            reqs = await stMATIC.getTotalWithdrawRequest()
            expect(reqs.length).eq(2);

            await nodeOperatorRegistry.removeNodeOperator(3);
            reqs = await stMATIC.getTotalWithdrawRequest()
            expect(reqs.length).eq(3);
        });

        it("Should withdraw total delegated when not delegated", async () => {
            const numOperators = 3;
            for (let i = 1; i <= numOperators; i++) {
                await stakeOperator(testers[i]);
                const validatorId = await mockStakeManager.getValidatorId(testers[i].address)
                await addOperator(validatorId.toString(), testers[i].address);
            }

            for (let i = 1; i <= 10; i++) {
                await mint(testers[i], toEth("10"));
                await submit(testers[i], toEth("10"), testers[3].address);
            }

            await nodeOperatorRegistry.removeNodeOperator(1);
            let reqs = await stMATIC.getTotalWithdrawRequest()

            expect(reqs.length).eq(0);

            await nodeOperatorRegistry.removeNodeOperator(2);
            reqs = await stMATIC.getTotalWithdrawRequest()
            expect(reqs.length).eq(0);

            await nodeOperatorRegistry.removeNodeOperator(3);
            reqs = await stMATIC.getTotalWithdrawRequest()
            expect(reqs.length).eq(0);
        });

        it("Should fail to withdrawTotalDelegated caller not node operator", async () => {
            await expect(
                stMATIC.withdrawTotalDelegated(ethers.constants.AddressZero)
            ).revertedWith("Not a node operator");
        });
    });

    describe("withdraw Total Delegated", async () => {
        it("Should request withdraw when withdraw total delegated", async () => {
            const numOperators = 1;
            for (let i = 1; i <= numOperators; i++) {
                await stakeOperator(testers[i]);
                const validatorId = await mockStakeManager.getValidatorId(testers[i].address)
                await addOperator(validatorId.toString(), testers[i].address);
            }

            const amountSubmit = toEth("100");
            await mint(user1, amountSubmit);
            await submit(user1, amountSubmit, testers[3].address);
            await stMATIC.delegate();
            const vs = (await nodeOperatorRegistry["getNodeOperator(uint256)"].call(this, 1)).validatorShare
            await nodeOperatorRegistry.removeNodeOperator(1);

            const withdrawalDelay = await mockStakeManager.withdrawalDelay();
            const currentEpoch = await mockStakeManager.epoch();
            await mockStakeManager.setEpoch(withdrawalDelay.add(currentEpoch));

            await stMATIC.claimTokensFromValidatorToContract(0);
            expect(await stMATIC.connect(user1).requestWithdraw(amountSubmit, testers[4].address))
                .emit(stMATIC, "RequestWithdrawEvent")
                .withArgs(user1.address, amountSubmit, testers[4].address);

            const req = await stMATIC.token2WithdrawRequests(1, 0);
            expect(req.validatorAddress).eq(ethers.constants.AddressZero);
            expect(req.amount2WithdrawFromStMATIC).eq(amountSubmit);
        });

        it("Should fail to request withdraw when withdraw total delegated is not yet claimed", async () => {
            const numOperators = 3;
            for (let i = 1; i <= numOperators; i++) {
                await stakeOperator(testers[i]);
                const validatorId = await mockStakeManager.getValidatorId(testers[i].address)
                await addOperator(validatorId.toString(), testers[i].address);
            }

            const amountSubmit = toEth("100");
            await mint(user1, amountSubmit);
            await submit(user1, amountSubmit, testers[3].address);
            await stMATIC.delegate();
            await nodeOperatorRegistry.removeNodeOperator(1);

            await expect(stMATIC.connect(user1).requestWithdraw(amountSubmit, testers[4].address))
                .revertedWith("Too much to withdraw");
        });
    });

    describe("Get Total Pooled Matic", async () => {
        it("Should get total pooled matic after submit", async () => {
            const amountSubmit = toEth("100");
            await mint(user1, amountSubmit);
            await submit(user1, amountSubmit, testers[3].address);
            expect(await stMATIC.getTotalPooledMatic()).eq(amountSubmit);
        });

        it("Should get total pooled matic after delegated", async () => {
            const numOperators = 1;
            for (let i = 1; i <= numOperators; i++) {
                await stakeOperator(testers[i]);
                const validatorId = await mockStakeManager.getValidatorId(testers[i].address)
                await addOperator(validatorId.toString(), testers[i].address);
            }
            const amountSubmit = toEth("100");
            await mint(user1, amountSubmit);
            await submit(user1, amountSubmit, testers[3].address);
            await stMATIC.delegate();
            expect(await stMATIC.getTotalPooledMatic()).eq(amountSubmit);
        });

        it("Should get total pooled matic after request total delegated", async () => {
            const numOperators = 1;
            for (let i = 1; i <= numOperators; i++) {
                await stakeOperator(testers[i]);
                const validatorId = await mockStakeManager.getValidatorId(testers[i].address)
                await addOperator(validatorId.toString(), testers[i].address);
            }

            const amountSubmit = toEth("100");
            await mint(user1, amountSubmit);
            await submit(user1, amountSubmit, testers[3].address);
            await stMATIC.delegate();
            await nodeOperatorRegistry.removeNodeOperator(1);
            expect(await stMATIC.getTotalPooledMatic()).eq(amountSubmit);
        });

        it("Should get total pooled matic after claim stMatic NFT", async () => {
            const numOperators = 2;
            for (let i = 1; i <= numOperators; i++) {
                await stakeOperator(testers[i]);
                const validatorId = await mockStakeManager.getValidatorId(testers[i].address)
                await addOperator(validatorId.toString(), testers[i].address);
            }

            const amountSubmit = toEth("100");
            await mint(user1, amountSubmit);
            await submit(user1, amountSubmit, testers[3].address);
            await stMATIC.delegate();
            await nodeOperatorRegistry.removeNodeOperator(1);

            let withdrawalDelay = await mockStakeManager.withdrawalDelay();
            let currentEpoch = await mockStakeManager.epoch();
            await mockStakeManager.setEpoch(withdrawalDelay.add(currentEpoch));

            await stMATIC.claimTokensFromValidatorToContract(0);
            expect(await stMATIC.getTotalPooledMatic()).eq(amountSubmit);
            expect(await stMATIC.calculatePendingBufferedTokens()).eq(0);
            await nodeOperatorRegistry.removeNodeOperator(2);

            withdrawalDelay = await mockStakeManager.withdrawalDelay();
            currentEpoch = await mockStakeManager.epoch();
            await mockStakeManager.setEpoch(withdrawalDelay.add(currentEpoch));
            await stMATIC.claimTokensFromValidatorToContract(0);

            expect(await stMATIC.getTotalPooledMatic()).eq(amountSubmit);
            expect(await stMATIC.calculatePendingBufferedTokens()).eq(0);
        });
    });

    const checkToken2WithdrawRequests = async (
        tokenId: number,
        requestWithdraw: Array<RequestWithdraw>,
        log: boolean,
    ) => {
        const res = await stMATIC.getToken2WithdrawRequests(tokenId)
        if (log) { 
            console.log(res)
        }
        expect(res.length, tokenId + "--res.length").eq(requestWithdraw.length)
        for (let i = 0; i < requestWithdraw.length; i++) {
            expect(res[i].amount2WithdrawFromStMATIC, tokenId + "--amount2WithdrawFromStMATIC").eq(requestWithdraw[i].amount2WithdrawFromStMATIC)
            expect(res[i].validatorNonce, tokenId + "--validatorNonce").eq(requestWithdraw[i].validatorNonce)
            expect(res[i].requestEpoch, tokenId + "--requestEpoch").not.eq(0)
            if (requestWithdraw[i].validatorAddress) {
                expect(res[i].validatorAddress, tokenId + "--validatorAddress").eq(requestWithdraw[i].validatorAddress)
            } else {
                expect(res[i].validatorAddress, tokenId + "--validatorAddress").not.eq(ethers.constants.AddressZero)
            }
        }
    }
});

interface RequestWithdraw {
    amount2WithdrawFromStMATIC: BigNumber,
    validatorNonce: number,
    requestEpoch?: BigNumber,
    validatorAddress?: string,
}

// convert a string to ether
// @ts-ignore
function toEth(amount: string): BigNumber {
    return ethers.utils.parseEther(amount);
}