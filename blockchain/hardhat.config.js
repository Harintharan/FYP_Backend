require("dotenv").config();
require("@nomicfoundation/hardhat-toolbox");

const {
  CHAIN_RPC_URL,
  CHAIN_PRIVATE_KEY,
  GANACHE_RPC_URL,
  GANACHE_PRIVATE_KEY,
  SEPOLIA_RPC_URL,
  SEPOLIA_PRIVATE_KEY,
  GANACHE_HOST,
  GANACHE_PORT,
} = process.env;

function buildAccounts(key) {
  return key && key !== "" ? [key] : undefined;
}

module.exports = {
  solidity: "0.8.24",
  networks: {
    hardhat: {
      chainId: 31337,
      mining: {
        auto: true,
        interval: 0,
      },
    },
    localhost: {
      url: CHAIN_RPC_URL || "http://127.0.0.1:8545",
      accounts: buildAccounts(CHAIN_PRIVATE_KEY),
    },
    ganache: {
      url: GANACHE_RPC_URL || "http://127.0.0.1:7545",
      accounts: buildAccounts(GANACHE_PRIVATE_KEY),
      // Ganache network settings
      host: GANACHE_HOST || "127.0.0.1",
      port: Number(GANACHE_PORT) || 7545,
    },
    sepolia: {
      url: SEPOLIA_RPC_URL || "",
      accounts: buildAccounts(SEPOLIA_PRIVATE_KEY),
    },
  },
};
