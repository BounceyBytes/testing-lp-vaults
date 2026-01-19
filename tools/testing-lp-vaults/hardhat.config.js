require("@nomiclabs/hardhat-waffle");
require("@nomiclabs/hardhat-ethers");
require("dotenv").config();

/**
 * Hardhat configuration for LP Vault testing
 *
 * Update the network configuration with your testnet RPC URL
 * and private key for the test account.
 */

// WARNING: Never commit private keys to git!
// Use environment variables in production
const TESTNET_RPC_URL = process.env.TESTNET_RPC_URL || "http://localhost:8545";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "0xac0974bec39a17e36ba4a6b4d238ff944bacb478cbed5efcae784d7bf4f2ff80";

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200
      }
    }
  },
  networks: {
    hardhat: {
      chainId: 31337
    },
    testnet: {
      url: TESTNET_RPC_URL,
      accounts: [PRIVATE_KEY],
      chainId: 5887, // MANTRA Dukong Testnet
      gasPrice: "auto",
      gas: "auto"
    }
  },
  paths: {
    sources: "./contracts",
    tests: "./test",
    cache: "./cache",
    artifacts: "./artifacts"
  },
  mocha: {
    timeout: 40000
  }
};
