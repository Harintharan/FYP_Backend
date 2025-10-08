import { ethers } from "ethers";
import BatchRegistryArtifact from "../../blockchain/artifacts/contracts/BatchRegistry.sol/BatchRegistry.json" with { type: "json" };
import {
  createBatch,
  updateBatch as updateBatchRecord,
  getBatchById,
  getBatchesByManufacturerUuid,
} from "../models/batchModel.js";
import { chain, operatorWallet, contracts } from "../config.js";
import { backupRecord } from "../services/pinataBackupService.js";

const provider = new ethers.JsonRpcProvider(chain.rpcUrl);
const wallet = new ethers.Wallet(operatorWallet.privateKey, provider);
const contractABI = BatchRegistryArtifact.abi;
const contract = new ethers.Contract(
  contracts.batchRegistry,
  contractABI,
  wallet
);

export async function registerBatch(req, res) {
  try {
    const {
      productCategory,
      manufacturerUUID,
      facility,
      productionWindow,
      quantityProduced,
      releaseStatus,
    } = req.body;

    const quantityProducedStr = quantityProduced.toString();

    const tx = await contract.registerBatch(
      productCategory,
      manufacturerUUID,
      facility,
      productionWindow,
      quantityProducedStr,
      releaseStatus
    );
    const receipt = await tx.wait();

    const event = receipt.logs
      .map((log) => {
        try {
          return contract.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed && parsed.name === "BatchRegistered");

    if (!event) {
      throw new Error("No BatchRegistered event found");
    }

    const blockchainBatchId = event.args.batchId.toString();
    const blockchainHash = event.args.hash;

    const dbPayload = {
      batch_id: blockchainBatchId,
      product_category: productCategory,
      manufacturer_uuid: manufacturerUUID,
      facility,
      production_window: productionWindow,
      quantity_produced: quantityProduced,
      release_status: releaseStatus,
      batch_hash: blockchainHash,
      tx_hash: receipt.hash,
      created_by: wallet.address,
    };

    let pinataBackup;
    try {
      pinataBackup = await backupRecord("batch", dbPayload, {
        operation: "create",
        identifier: blockchainBatchId,
      });
    } catch (backupErr) {
      console.error("⚠️ Failed to back up batch to Pinata:", backupErr);
    }

    const savedBatch = await createBatch({
      ...dbPayload,
      pinata_cid: pinataBackup?.IpfsHash ?? null,
      pinata_pinned_at: pinataBackup?.Timestamp ?? null,
    });

    const responsePayload = { ...savedBatch, blockchainTx: receipt.hash };
    responsePayload.pinataCid = savedBatch.pinata_cid || null;
    responsePayload.pinataTimestamp = savedBatch.pinata_pinned_at || null;

    res.status(201).json(responsePayload);
  } catch (err) {
    console.error("❌ Error registering batch:", err);
    res.status(500).json({ message: "Server error" });
  }
}

export async function updateBatch(req, res) {
  try {
    const { id } = req.params;
    const batch = await getBatchById(id);
    if (!batch) {
      return res.status(404).json({ message: "Batch not found" });
    }

    const {
      productCategory,
      manufacturerUUID,
      facility,
      productionWindow,
      quantityProduced,
      releaseStatus,
    } = req.body;

    const tx = await contract.updateBatch(
      batch.batch_id,
      productCategory,
      manufacturerUUID,
      facility,
      productionWindow,
      quantityProduced.toString(),
      releaseStatus
    );
    const receipt = await tx.wait();

    const event = receipt.logs
      .map((log) => {
        try {
          return contract.interface.parseLog(log);
        } catch {
          return null;
        }
      })
      .find((parsed) => parsed && parsed.name === "BatchUpdated");

    const blockchainHash = event?.args?.newHash;

    const updatePayload = {
      product_category: productCategory,
      manufacturer_uuid: manufacturerUUID,
      facility,
      production_window: productionWindow,
      quantity_produced: quantityProduced,
      release_status: releaseStatus,
      batch_hash: blockchainHash,
      tx_hash: receipt.hash,
      updated_by: wallet.address,
    };

    let pinataBackup;
    try {
      pinataBackup = await backupRecord(
        "batch",
        {
          batch_id: batch.batch_id,
          ...updatePayload,
        },
        {
          operation: "update",
          identifier: batch.batch_id,
        }
      );
    } catch (backupErr) {
      console.error("⚠️ Failed to back up batch update to Pinata:", backupErr);
    }

    updatePayload.pinata_cid = pinataBackup?.IpfsHash ?? batch.pinata_cid ?? null;
    updatePayload.pinata_pinned_at = pinataBackup?.Timestamp ?? batch.pinata_pinned_at ?? null;

    const updatedBatch = await updateBatchRecord(id, updatePayload);

    const responsePayload = { ...updatedBatch, blockchainTx: receipt.hash };
    responsePayload.pinataCid = updatedBatch.pinata_cid || null;
    responsePayload.pinataTimestamp = updatedBatch.pinata_pinned_at || null;

    res.json(responsePayload);
  } catch (err) {
    console.error("❌ Error updating batch:", err);
    res.status(500).json({ message: "Server error" });
  }
}

export async function getBatch(req, res) {
  try {
    const { id } = req.params;
    const batch = await getBatchById(id);

    if (!batch) {
      return res.status(404).json({ message: "Batch not found" });
    }

    const recomputed = ethers.keccak256(
      ethers.solidityPacked(
        ["string", "string", "string", "string", "string", "string"],
        [
          batch.product_category,
          batch.manufacturer_uuid,
          batch.facility,
          batch.production_window,
          batch.quantity_produced,
          batch.release_status,
        ]
      )
    );

    if (recomputed.toLowerCase() !== batch.batch_hash.toLowerCase()) {
      return res.status(400).json({ message: "Tampered data in DB" });
    }

    const [onchainHash] = await contract.getBatch(batch.batch_id);
    console.log("On-chain hash:", onchainHash);
    console.log("Recomputed hash:", recomputed);
    if (recomputed.toLowerCase() !== onchainHash.toLowerCase()) {
      return res.status(400).json({ message: "Tampered data on-chain" });
    }

    const { id: dbId, ...cleanBatch } = batch;
    res.json({ ...cleanBatch, verified: true });
  } catch (err) {
    console.error("❌ Error fetching batch:", err);
    res.status(500).json({ message: "Server error" });
  }
}

export async function listBatchesByManufacturer(req, res) {
  try {
    const { manufacturerUuid } = req.params;
    const registrationId = req.registration?.id;

    if (
      registrationId &&
      registrationId.toLowerCase() !== manufacturerUuid.toLowerCase()
    ) {
      return res.status(403).json({
        error: "Cannot access batches for other manufacturers",
      });
    }

    const batches = await getBatchesByManufacturerUuid(manufacturerUuid);
    return res.json(batches);
  } catch (err) {
    console.error(
      "GET /api/batches/manufacturer/:manufacturerUuid error",
      err
    );
    return res.status(500).json({ message: "Server error" });
  }
}
