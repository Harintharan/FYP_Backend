// const { ethers } = require("ethers");
// const User = require("../models/userModel");
// require("dotenv").config();

// const provider = new ethers.JsonRpcProvider(process.env.CHAIN_RPC_URL);
// const wallet = new ethers.Wallet(process.env.CHAIN_PRIVATE_KEY, provider);
// const contractABI = require("../../blockchain/artifacts/contracts/SupplyChain.sol/SupplyChain.json").abi;
// const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, contractABI, wallet);

// // map role strings to enum integers
// const roleMap = {
//   Manufacturer: 1,
//   Transporter: 2,
//   Retailer: 3,
//   Regulator: 4,
// };

// const registerUser = async (req, res) => {
//   try {
//     const { ethAddress, name, idNumber, company, role } = req.body;

//      const roleValue = roleMap[role];
//     if (roleValue === undefined) {
//       return res.status(400).json({ message: "Invalid role" });
//     }

//     const detailsHash = ethers.keccak256(
//       ethers.solidityPacked(["string", "string", "string"], [name, idNumber, company])
//     );

//     const tx = await contract.registerUser(ethAddress, roleValue, detailsHash);
//     const receipt = await tx.wait();

//     await User.createUser({
//       eth_address: ethAddress,
//       name,
//       id_number: idNumber,
//       company,
//       role,
//       details_hash: detailsHash,
//       tx_hash: receipt.hash,
//     });

//     res.json({ message: "User registered", tx: receipt.hash });
//   } catch (err) {
//     console.error("❌ Error registering user:", err);
//     res.status(500).json({ message: "Server error" });
//   }
// };

// // ---- Get User by Address + Verify ----
// const getUser = async (req, res) => {
//   try {
//     const { address } = req.params;
//     const user = await User.findByAddress(address);
//     console.log(address);

//     if (!user) return res.status(404).json({ message: "User not found" });

//     // 1️⃣ Recompute detailsHash locally
//     const recomputedHash = ethers.keccak256(
//       ethers.solidityPacked(
//         ["string", "string", "string"],
//         [user.name, user.id_number, user.company]
//       )
//     );

//     // 2️⃣ Check DB integrity
//     if (recomputedHash.toLowerCase() !== user.details_hash.toLowerCase()) {
//       return res.status(400).json({ message: "Tampered user data in DB" });
//     }

//     // 3️⃣ Fetch from blockchain
//     const onchainUser = await contract.users(address);

//     if (!onchainUser || onchainUser.detailsHash === ethers.ZeroHash) {

//       // console.log("On-chain user data:", onchainUser);
//       return res.status(404).json({ message: "User not registered on-chain" });
//     }

//     // 4️⃣ Compare hashes
//     if (recomputedHash.toLowerCase() !== onchainUser.detailsHash.toLowerCase()) {
//       return res.status(400).json({ message: "Tampered user data on-chain" });
//     }

//     // 5️⃣ Return verified result
//     res.json({ ...user, verified: true });
//   } catch (err) {
//     console.error("❌ Error fetching user:", err);
//     res.status(500).json({ message: "Server error" });
//   }
// };

// module.exports = { registerUser, getUser };
