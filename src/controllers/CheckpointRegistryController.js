const { ethers } = require("ethers");
const Checkpoint = require("../models/CheckpointRegistryModel");
require("dotenv").config();

const provider = new ethers.JsonRpcProvider(process.env.SEPOLIA_RPC_URL);
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY_OTHER, provider);
const contractABI = require("../../blockchain/artifacts/contracts/CheckpointRegistry.sol/CheckpointRegistry.json").abi;
const contract = new ethers.Contract(process.env.CONTRACT_ADDRESS_CHECKPOINT, contractABI, wallet);

//
// Helper: Compute hash
//
function computeCheckpointHash(checkpoint) {
  const joined = [
    checkpoint.checkpointUUID || checkpoint.checkpoint_uuid,
    checkpoint.name,
    checkpoint.address,
    checkpoint.latitude,
    checkpoint.longitude,
    checkpoint.ownerUUID || checkpoint.owner_uuid,
    checkpoint.ownerType || checkpoint.owner_type,
    checkpoint.checkpointType || checkpoint.checkpoint_type
  ].join("|");

  console.log("🟦 Hashing string:", joined);
  return ethers.keccak256(ethers.toUtf8Bytes(joined));
}

//
// Register Checkpoint
//
const registerCheckpoint = async (req, res) => {
  try {
    const data = req.body;
    const dbHash = computeCheckpointHash(data);

    const tx = await contract.registerCheckpoint(dbHash);
    const receipt = await tx.wait();

    const event = receipt.logs
      .map((log) => { try { return contract.interface.parseLog(log); } catch { return null; } })
      .find((parsed) => parsed && parsed.name === "CheckpointRegistered");

    if (!event) throw new Error("No CheckpointRegistered event found");

    const blockchainCheckpointId = event.args.checkpointId.toString();
    const blockchainHash = event.args.hash;

    const savedCheckpoint = await Checkpoint.createCheckpoint({
      checkpoint_id: blockchainCheckpointId,
      ...data,
      checkpoint_hash: blockchainHash,
      tx_hash: receipt.hash,
      created_by: wallet.address,
    });

    res.status(201).json({ ...savedCheckpoint, blockchainTx: receipt.hash });
  } catch (err) {
    console.error("❌ Error registering checkpoint:", err);
    res.status(500).json({ message: "Server error" });
  }
};

//
// Update Checkpoint
//
const updateCheckpoint = async (req, res) => {
  try {
    const { checkpoint_id } = req.params;
    const data = req.body;
    const newDbHash = computeCheckpointHash(data);

    const tx = await contract.updateCheckpoint(checkpoint_id, newDbHash);
    const receipt = await tx.wait();

    const updatedCheckpoint = await Checkpoint.updateCheckpoint(checkpoint_id, {
      ...data,
      checkpoint_hash: newDbHash,
      tx_hash: receipt.hash,
      updated_by: wallet.address,
    });

    res.status(200).json({ ...updatedCheckpoint, blockchainTx: receipt.hash });
  } catch (err) {
    console.error("❌ Error updating checkpoint:", err);
    res.status(500).json({ message: "Server error" });
  }
};

//
// Get Single Checkpoint
//
const getCheckpoint = async (req, res) => {
  try {
    const { checkpoint_id } = req.params;
    const checkpoint = await Checkpoint.getCheckpointById(checkpoint_id);
    if (!checkpoint) return res.status(404).json({ message: "Checkpoint not found" });

    const dbHash = computeCheckpointHash(checkpoint);
    const blockchainCheckpoint = await contract.getCheckpoint(checkpoint_id);
    const blockchainHash = blockchainCheckpoint.hash;

    const integrity = dbHash === blockchainHash ? "valid" : "tampered";

    res.status(200).json({ ...checkpoint, dbHash, blockchainHash, integrity });
  } catch (err) {
    console.error("❌ Error fetching checkpoint:", err);
    res.status(500).json({ message: "Server error" });
  }
};

//
// Get All Checkpoints
//
const getAllCheckpoints = async (req, res) => {
  try {
    const checkpoints = await Checkpoint.getAllCheckpoints();

    const result = await Promise.all(
      checkpoints.map(async (cp) => {
        const dbHash = computeCheckpointHash(cp);
        let blockchainHash = null;
        let integrity = "unknown";

        try {
          const blockchainCheckpoint = await contract.getCheckpoint(cp.checkpoint_id);
          blockchainHash = blockchainCheckpoint.hash;
          integrity = dbHash === blockchainHash ? "valid" : "tampered";
        } catch {
          integrity = "not_on_chain";
        }

        return { ...cp, dbHash, blockchainHash, integrity };
      })
    );

    res.status(200).json(result);
  } catch (err) {
    console.error("❌ Error fetching checkpoints:", err);
    res.status(500).json({ message: "Server error" });
  }
};

module.exports = { registerCheckpoint, updateCheckpoint, getCheckpoint, getAllCheckpoints };
