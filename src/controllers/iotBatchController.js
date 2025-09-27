// const { ethers } = require("ethers");
// const IoTBatch = require("../models/iotBatchModel");
// require("dotenv").config();

// const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
// const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);
// const contractABI = require("../../blockchain/artifacts/contracts/SupplyChain.sol/SupplyChain.json").abi;
// const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS, contractABI, wallet);

// const storeBatch = async (req, res) => {
//   try {
//     const { id } = req.params;
//     const { readings } = req.body;

//     const batchHash = ethers.keccak256(
//       ethers.solidityPacked(["string"], [JSON.stringify(readings)])
//     );

//     const tx = await contract.storeBatch(id, batchHash);
//     const receipt = await tx.wait();

//     await IoTBatch.create({
//       product_id: id,
//       readings: JSON.stringify(readings),
//       batch_hash: batchHash,
//       tx_hash: receipt.hash,
//     });

//     res.json({ message: "Batch stored", tx: receipt.hash });
//   } catch (err) {
//     console.error("❌ Error storing batch:", err);
//     res.status(500).json({ message: "Server error" });
//   }
// };


// // ---- Get Latest Batch for a Product ----
// const getLatestBatch = async (req, res) => {
//   try {
//     const { productId } = req.params;
//     const batch = await IoTBatch.findLatestByProductId(productId);

//     if (!batch) return res.status(404).json({ message: "Not found" });

//     const recomputedHash = ethers.keccak256(
//       ethers.solidityPacked(["string"], [batch.readings])
//     );

//     if (recomputedHash.toLowerCase() !== batch.batch_hash.toLowerCase()) {
//       return res.status(400).json({ message: "Tampered IoT data in DB" });
//     }

//     const [onchainHash] = await contract.getBatch(productId);
//     if (recomputedHash.toLowerCase() !== onchainHash.toLowerCase()) {
//       return res.status(400).json({ message: "Tampered IoT data on-chain" });
//     }

//     res.json({ readings: JSON.parse(batch.readings), verified: true });
//   } catch (err) {
//     console.error("❌ Error fetching batch:", err);
//     res.status(500).json({ message: "Server error" });
//   }
// };
// module.exports = { storeBatch, getLatestBatch };