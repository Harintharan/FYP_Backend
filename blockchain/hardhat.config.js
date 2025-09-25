require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");

const {
  CHAIN_RPC_URL,
  CHAIN_PRIVATE_KEY,
  GANACHE_RPC_URL,
  GANACHE_PRIVATE_KEY,
  SEPOLIA_RPC_URL,
  SEPOLIA_PRIVATE_KEY,
} = process.env;

function buildAccounts(key) {
  return key && key !== "" ? [key] : undefined;
}

module.exports = {
  solidity: "0.8.24",
  networks: {
    hardhat: {
      chainId: 31337,
    },
    localhost: {
      url: CHAIN_RPC_URL || "http://127.0.0.1:8545",
      accounts: buildAccounts(CHAIN_PRIVATE_KEY),
    },
    ganache: {
      url: GANACHE_RPC_URL || "http://127.0.0.1:7545",
      accounts: buildAccounts(GANACHE_PRIVATE_KEY),
    },
    sepolia: {
      url: SEPOLIA_RPC_URL || "",
      accounts: buildAccounts(SEPOLIA_PRIVATE_KEY),
    },
  },
};
