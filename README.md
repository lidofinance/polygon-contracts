# Lido On Polygon Liquid Staking Protocol V2
Lido on Polygon is a DAO governed liquid staking protocol for Polygon PoS chain. It allows users to stake their ERC20 MATIC tokens on Ethereum mainnet and immediately get the representation of their share in the form of stMATIC token without maintaining staking infrastructure. Users will get staking rewards and still be able to control their stMATIC tokens MATIC tokens will be delegated across validators that are registered and accepted by the DAO insideLido on Polygon protocol.

Node operators don't have direct access over the delegated assets.
They are just providing infrastructure and getting rewards in return.
Assets are controlled by Lido on Polygon contracts exclusively.
The goal is to help with Polygon decentralization and integrate stMATIC with the variety of protocols and DeFi applications on Ethereum mainnet and Polygon PoS chain. 
Before getting started with this repo, please read:
- [Documentation](https://docs.polygon.lido.fi/)

# Lido DAO
The Lido DAO is an Aragon organization. Since Aragon provides a full end-to-end framework to build DAOs, we use its standard tools. The protocol smart contracts extend AragonApp base contract and can be managed by the DAO.
- [Lido DAO Mainnet](https://mainnet.lido.fi/#/lido-dao/)
- [Lido DAO Prater Testnet](https://testnet.testnet.fi/#/lido-testnet-prater/)

# Contracts

##### [StMATIC](https://github.com/lidofinance/polygon-contracts/blob/main/contracts/StMATIC.sol)
StMATIC is the core contract which acts as a liquid staking pool. The contract is responsible for deposits, withdrawals, minting and burning liquid tokens, delegating funds to node operators, applying fees and distributing rewards.
StMATIC contract also defines stMATIC, an ERC20 token that represents the account's share of the total supply of MATIC tokens inside Lido on Polygon system. It is a non-rebasable token, which means that the amount of tokens in the user's wallet is not going to change. During time, the value of this token is changing, since the amount of MATIC tokens inside the protocol is not constant. StMATIC will be integrated in variety of DeFi applications across Ethereum and Polygon.

##### [NodeOperatorRegistry](https://github.com/lidofinance/polygon-contracts/blob/main/contracts/NodeOperatorRegistry.sol)
The NodeOperatorRegistry contract is the core contract that allows node operators to participate in the Lido staking protocol. Node Operators participate on the protocol as validators and get rewarded for their work. A Node Operator gets added to the Registry by the DAO. Validator reward is distributed evenly amongst all active operators. The contract contains a list of operators, their public keys, and the logic for managing their state.

# Deployments

### Mainnet
The **Mainnet** addresses are available [here](https://github.com/lidofinance/polygon-contracts/blob/main/mainnet-deployment-info.json)

### Testnet
The **Testnet** addresses are available [here](https://github.com/lidofinance/polygon-contracts/blob/main/testnet-deployment-info.json)

# Development

### Requirements
- node.js v16

### Install
```sh
npm i
```

### Build & test
Compile Solidity contracts
```sh
npx hardhat compile
```
Run unit tests
```sh
npx hardhat test
```

### ENV
```sh
DEPLOYER_PRIVATE_KEY=0x...
ETHERSCAN_API_KEY=ABCD
CHILD_CHAIN_RPC=https://polygon-mumbai.g.alchemy.com/v2/XXX
ROOT_CHAIN_RPC=https://eth-goerli.alchemyapi.io/v2/XXX
ROOT_GAS_PRICE=10000000000
ROOT_GAS_LIMIT=10000000
CHILD_GAS_PRICE=10000000000
CHILD_GAS_LIMIT=10000000
CHECKPOINT_MANAGER=0x
STAKE_MANAGER=0x
MATIC_TOKEN=0x
FX_ROOT=0x
FX_CHILD=0x
DAO=0x
INSURANCE=0x
TREASURY=0x
DEFENDER_TEAM_API_KEY=XXX
DEFENDER_TEAM_API_SECRET_KEY=XXX

```
- Polygon mainnet protocol [addresses](https://static.matic.network/network/mainnet/v1/index.json)
- Polygon testnet protocol [addresses](https://static.matic.network/network/testnet/mumbai/index.json)

# Deploy
Deploy the protocol
```js
npx hardhat run scripts/deploy.ts --network <network-id>
```

# Create Upgrade Proposal
Creating upgrade requests requires an [Openzeppelin Defender](https://www.openzeppelin.com/defender) account.

Initiate StMATIC upgrade request:
```sh
npx hardhat run scripts/multisigUpgrade/upgradeStMatic.ts --network <network-id>
```

To initiate NodeOperatorRegistry upgrade request:
```sh
npx hardhat run scripts/multisigUpgrade/upgradeNodeOperatorRegistry.ts --network <network-id>
```

To initiate LidoNFT upgrade request:
```sh
npx hardhat run scripts/multisigUpgrade/upgradeLidoNFT.ts --network <network-id>
```

# 06-03-2023
1. Add envs
```
ROOT_CHAIN_RPC=https://eth-mainnet.g.alchemy.com/v2/XXX
```
2. Run simulation tests for recovery
```sh
npx hardhat test test/simulation/simulateRecover.test.ts --config hardhat.config_fork.ts
```