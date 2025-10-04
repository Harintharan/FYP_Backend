import { ethers } from "ethers";
import CheckpointRegistryArtifact from "../../blockchain/artifacts/contracts/CheckpointRegistry.sol/CheckpointRegistry.json" with { type: "json" };
import {
  createCheckpoint,
  updateCheckpoint as updateCheckpointRecord,
  getCheckpointById,
  getAllCheckpoints as getAllCheckpointRecords,
} from "../models/CheckpointRegistryModel.js";
import { chain, operatorWallet, contracts } from "../config.js";
import { backupRecord } from "../services/pinataBackupService.js";

const provider = new ethers.JsonRpcProvider(chain.rpcUrl);
const wallet = new ethers.Wallet(operatorWallet.privateKey, provider);
const contractABI = CheckpointRegistryArtifact.abi;
const contract = new ethers.Contract(
  contracts.checkpointRegistry,
  contractABI,
  wallet
);

function computeCheckpointHash(checkpoint) {
  const joined = [
    checkpoint.checkpointUUID || checkpoint.checkpoint_uuid,
    checkpoint.name,
    checkpoint.address,
    checkpoint.latitude,
    checkpoint.longitude,
    checkpoint.ownerUUID || checkpoint.owner_uuid,
    checkpoint.ownerType || checkpoint.owner_type,
    checkpoint.checkpointType || checkpoint.checkpoint_type,
  ].join("|");

  console.log("🟦 Hashing string:", joined);
  return ethers.keccak256(ethers.toUtf8Bytes(joined));
}

export async function registerCheckpoint(req, res) {
  try {
    const data = req.body;
    const dbHash = computeCheckpointHash(data);

    const tx = await contract.registerCheckpoint(dbHash);
    const receipt = await tx.wait();

    const event = receipt.logs
      .map((log) => {
        try {
          return contract.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed && parsed.name === "CheckpointRegistered");

    if (!event) {
      throw new Error("No CheckpointRegistered event found");
    }

    const blockchainCheckpointId = event.args.checkpointId.toString();
    const blockchainHash = event.args.hash;

    const createPayload = {
      checkpoint_id: blockchainCheckpointId,
      ...data,
      checkpoint_hash: blockchainHash,
      tx_hash: receipt.hash,
      created_by: wallet.address,
    };

    let pinataBackup;
    try {
      pinataBackup = await backupRecord("checkpoint", createPayload, {
        operation: "create",
        identifier: blockchainCheckpointId,
      });
    } catch (backupErr) {
      console.error(
        "⚠️ Failed to back up checkpoint to Pinata:",
        backupErr
      );
    }

    const savedCheckpoint = await createCheckpoint({
      ...createPayload,
      pinata_cid: pinataBackup?.IpfsHash ?? null,
      pinata_pinned_at: pinataBackup?.Timestamp ?? null,
    });

    const responsePayload = { ...savedCheckpoint, blockchainTx: receipt.hash };
    responsePayload.pinataCid = savedCheckpoint.pinata_cid || null;
    responsePayload.pinataTimestamp = savedCheckpoint.pinata_pinned_at || null;

    res.status(201).json(responsePayload);
  } catch (err) {
    console.error("❌ Error registering checkpoint:", err);
    res.status(500).json({ message: "Server error" });
  }
}

export async function updateCheckpoint(req, res) {
  try {
    const { checkpoint_id } = req.params;
    const data = req.body;
    const newDbHash = computeCheckpointHash(data);

    const existing = await getCheckpointById(checkpoint_id);
    if (!existing) {
      return res.status(404).json({ message: "Checkpoint not found" });
    }

    const tx = await contract.updateCheckpoint(checkpoint_id, newDbHash);
    const receipt = await tx.wait();

    const updatePayload = {
      ...data,
      checkpoint_hash: newDbHash,
      tx_hash: receipt.hash,
      updated_by: wallet.address,
    };

    let pinataBackup;
    try {
      pinataBackup = await backupRecord(
        "checkpoint",
        {
          ...existing,
          ...updatePayload,
          checkpoint_id,
        },
        {
          operation: "update",
          identifier: checkpoint_id,
        }
      );
    } catch (backupErr) {
      console.error(
        "⚠️ Failed to back up checkpoint update to Pinata:",
        backupErr
      );
    }

    updatePayload.pinata_cid = pinataBackup?.IpfsHash ?? existing.pinata_cid ?? null;
    updatePayload.pinata_pinned_at =
      pinataBackup?.Timestamp ?? existing.pinata_pinned_at ?? null;

    const updatedCheckpoint = await updateCheckpointRecord(
      checkpoint_id,
      updatePayload
    );

    const responsePayload = { ...updatedCheckpoint, blockchainTx: receipt.hash };
    responsePayload.pinataCid = updatedCheckpoint.pinata_cid || null;
    responsePayload.pinataTimestamp = updatedCheckpoint.pinata_pinned_at || null;

    res.status(200).json(responsePayload);
  } catch (err) {
    console.error("❌ Error updating checkpoint:", err);
    res.status(500).json({ message: "Server error" });
  }
}

export async function getCheckpoint(req, res) {
  try {
    const { checkpoint_id } = req.params;
    const checkpoint = await getCheckpointById(checkpoint_id);
    if (!checkpoint) {
      return res.status(404).json({ message: "Checkpoint not found" });
    }

    const dbHash = computeCheckpointHash(checkpoint);
    const blockchainCheckpoint = await contract.getCheckpoint(checkpoint_id);
    const blockchainHash = blockchainCheckpoint.hash;

    const integrity = dbHash === blockchainHash ? "valid" : "tampered";

    res.status(200).json({ ...checkpoint, dbHash, blockchainHash, integrity });
  } catch (err) {
    console.error("❌ Error fetching checkpoint:", err);
    res.status(500).json({ message: "Server error" });
  }
}

export async function getAllCheckpoints(_req, res) {
  try {
    const checkpoints = await getAllCheckpointRecords();

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
}
