// import "@nomicfoundation/hardhat-toolbox";
// import * as dotenv from "dotenv";
// dotenv.config();

// export default {
//   solidity: "0.8.20",
//   networks: {
//     sepolia: {
//       url: process.env.CHAIN_RPC_URL,
//       accounts: [process.env.CHAIN_PRIVATE_KEY],
//     },
//   },
// };
require("@nomicfoundation/hardhat-toolbox");
require("dotenv").config({ path: __dirname + "/../.env" }); // go up one level

const CHAIN_RPC_URL = process.env.CHAIN_RPC_URL || "";
const CHAIN_PRIVATE_KEY = process.env.CHAIN_PRIVATE_KEY || "";

module.exports = {
  solidity: {
    version: "0.8.20",
    settings: {
      optimizer: {
        enabled: true,
        runs: 200,
      },
      viaIR: true, // 👈 Add this line
    },
  },
  networks: {
    sepolia: {
      url: CHAIN_RPC_URL,
      accounts: CHAIN_PRIVATE_KEY ? [CHAIN_PRIVATE_KEY] : [],
    },
  },
  etherscan: {
    apiKey: {
      sepolia: process.env.ETHERSCAN_API_KEY,
    },
  },
};
