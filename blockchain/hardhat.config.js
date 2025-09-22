require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ path: __dirname + "/../.env" }); 

const SEPOLIA_RPC_URL = process.env.SEPOLIA_RPC_URL || "";
const PRIVATE_KEY = process.env.PRIVATE_KEY || "";
const GANACHE_RPC_URL = process.env.GANACHE_RPC_URL || "";
const GANACHE_PRIVATE_KEY = process.env.GANACHE_PRIVATE_KEY || "";

module.exports = {
  solidity: "0.8.24",
  networks: {
    hardhat: {
      chainId: 31337,
    },
    ganache: {
      url: GANACHE_RPC_URL,
      accounts: [
        GANACHE_PRIVATE_KEY,
      ],
    },
    sepolia: {
      url: SEPOLIA_RPC_URL,
      accounts: PRIVATE_KEY ? [PRIVATE_KEY] : [],
    },
  },
};
