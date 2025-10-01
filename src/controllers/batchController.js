import { ethers } from "ethers";
import BatchRegistryArtifact from "../../blockchain/artifacts/contracts/BatchRegistry.sol/BatchRegistry.json" with { type: "json" };
import {
  createBatch,
  updateBatch as updateBatchRecord,
  getBatchById,
} from "../models/batchModel.js";
import { chain, operatorWallet, contracts } from "../config.js";

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

    const savedBatch = await createBatch({
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
    });

    res.status(201).json({ ...savedBatch, blockchainTx: receipt.hash });
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

    const updatedBatch = await updateBatchRecord(id, {
      product_category: productCategory,
      manufacturer_uuid: manufacturerUUID,
      facility,
      production_window: productionWindow,
      quantity_produced: quantityProduced,
      release_status: releaseStatus,
      batch_hash: blockchainHash,
      tx_hash: receipt.hash,
      updated_by: wallet.address,
    });

    res.json({ ...updatedBatch, blockchainTx: receipt.hash });
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
