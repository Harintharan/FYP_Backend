import { randomUUID } from "node:crypto";
import { ethers } from "ethers";
import {
  createBatch,
  updateBatch as updateBatchRecord,
  getBatchById,
  getBatchesByManufacturerUuid,
  updateBatchOnChainMetadata,
  deleteBatchById,
} from "../models/batchModel.js";
import { chain, operatorWallet, contracts } from "../config.js";
import { backupRecord } from "../services/pinataBackupService.js";
import { uuidToBytes16Hex } from "../utils/uuidHex.js";

const provider = new ethers.JsonRpcProvider(chain.rpcUrl);
const wallet = new ethers.Wallet(operatorWallet.privateKey, provider);
const contractABI = [
  {
    inputs: [],
    stateMutability: "nonpayable",
    type: "constructor",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes16",
        name: "batchId",
        type: "bytes16",
      },
      {
        indexed: false,
        internalType: "bytes32",
        name: "hash",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "address",
        name: "createdBy",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "createdAt",
        type: "uint256",
      },
    ],
    name: "BatchRegistered",
    type: "event",
  },
  {
    anonymous: false,
    inputs: [
      {
        indexed: true,
        internalType: "bytes16",
        name: "batchId",
        type: "bytes16",
      },
      {
        indexed: false,
        internalType: "bytes32",
        name: "newHash",
        type: "bytes32",
      },
      {
        indexed: false,
        internalType: "address",
        name: "updatedBy",
        type: "address",
      },
      {
        indexed: false,
        internalType: "uint256",
        name: "updatedAt",
        type: "uint256",
      },
    ],
    name: "BatchUpdated",
    type: "event",
  },
  {
    inputs: [
      {
        internalType: "bytes16",
        name: "",
        type: "bytes16",
      },
    ],
    name: "batches",
    outputs: [
      {
        internalType: "string",
        name: "productCategory",
        type: "string",
      },
      {
        internalType: "string",
        name: "manufacturerUUID",
        type: "string",
      },
      {
        internalType: "string",
        name: "facility",
        type: "string",
      },
      {
        internalType: "string",
        name: "productionWindow",
        type: "string",
      },
      {
        internalType: "string",
        name: "quantityProduced",
        type: "string",
      },
      {
        internalType: "string",
        name: "releaseStatus",
        type: "string",
      },
      {
        internalType: "bytes32",
        name: "hash",
        type: "bytes32",
      },
      {
        internalType: "uint256",
        name: "createdAt",
        type: "uint256",
      },
      {
        internalType: "uint256",
        name: "updatedAt",
        type: "uint256",
      },
      {
        internalType: "address",
        name: "createdBy",
        type: "address",
      },
      {
        internalType: "address",
        name: "updatedBy",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [],
    name: "owner",
    outputs: [
      {
        internalType: "address",
        name: "",
        type: "address",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes16",
        name: "batchId",
        type: "bytes16",
      },
    ],
    name: "getBatch",
    outputs: [
      {
        internalType: "bytes32",
        name: "",
        type: "bytes32",
      },
      {
        components: [
          {
            internalType: "string",
            name: "productCategory",
            type: "string",
          },
          {
            internalType: "string",
            name: "manufacturerUUID",
            type: "string",
          },
          {
            internalType: "string",
            name: "facility",
            type: "string",
          },
          {
            internalType: "string",
            name: "productionWindow",
            type: "string",
          },
          {
            internalType: "string",
            name: "quantityProduced",
            type: "string",
          },
          {
            internalType: "string",
            name: "releaseStatus",
            type: "string",
          },
          {
            internalType: "bytes32",
            name: "hash",
            type: "bytes32",
          },
          {
            internalType: "uint256",
            name: "createdAt",
            type: "uint256",
          },
          {
            internalType: "uint256",
            name: "updatedAt",
            type: "uint256",
          },
          {
            internalType: "address",
            name: "createdBy",
            type: "address",
          },
          {
            internalType: "address",
            name: "updatedBy",
            type: "address",
          },
        ],
        internalType: "struct BatchRegistry.Batch",
        name: "",
        type: "tuple",
      },
    ],
    stateMutability: "view",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes16",
        name: "batchId",
        type: "bytes16",
      },
      {
        internalType: "string",
        name: "productCategory",
        type: "string",
      },
      {
        internalType: "string",
        name: "manufacturerUUID",
        type: "string",
      },
      {
        internalType: "string",
        name: "facility",
        type: "string",
      },
      {
        internalType: "string",
        name: "productionWindow",
        type: "string",
      },
      {
        internalType: "string",
        name: "quantityProduced",
        type: "string",
      },
      {
        internalType: "string",
        name: "releaseStatus",
        type: "string",
      },
    ],
    name: "registerBatch",
    outputs: [
      {
        internalType: "bytes16",
        name: "",
        type: "bytes16",
      },
    ],
    stateMutability: "nonpayable",
    type: "function",
  },
  {
    inputs: [
      {
        internalType: "bytes16",
        name: "batchId",
        type: "bytes16",
      },
      {
        internalType: "string",
        name: "productCategory",
        type: "string",
      },
      {
        internalType: "string",
        name: "manufacturerUUID",
        type: "string",
      },
      {
        internalType: "string",
        name: "facility",
        type: "string",
      },
      {
        internalType: "string",
        name: "productionWindow",
        type: "string",
      },
      {
        internalType: "string",
        name: "quantityProduced",
        type: "string",
      },
      {
        internalType: "string",
        name: "releaseStatus",
        type: "string",
      },
    ],
    name: "updateBatch",
    outputs: [],
    stateMutability: "nonpayable",
    type: "function",
  },
];
const contract = new ethers.Contract(
  contracts.batchRegistry,
  contractABI,
  wallet
);

function computeBatchHash(batchId, payload) {
  return ethers.keccak256(
    ethers.solidityPacked(
      ["bytes16", "string", "string", "string", "string", "string", "string"],
      [
        uuidToBytes16Hex(batchId),
        payload.product_category,
        payload.manufacturer_uuid,
        payload.facility,
        payload.production_window,
        payload.quantity_produced,
        payload.release_status,
      ]
    )
  );
}

export async function registerBatch(req, res) {
  const {
    productCategory,
    manufacturerUUID,
    facility,
    productionWindow,
    quantityProduced,
    releaseStatus,
  } = req.body;

  const batchId = randomUUID();
  const quantityProducedStr = quantityProduced.toString();

  const draftPayload = {
    id: batchId,
    product_category: productCategory,
    manufacturer_uuid: manufacturerUUID,
    facility,
    production_window: productionWindow,
    quantity_produced: quantityProducedStr,
    release_status: releaseStatus,
    created_by: req.wallet?.walletAddress ?? wallet.address,
  };

  try {
    await createBatch(draftPayload);

    console.log("privatekey", operatorWallet.privateKey);
    console.log("wallet address", wallet.address);

    const tx = await contract.registerBatch(
      uuidToBytes16Hex(batchId),
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

    const onChainBatchId = event.args.batchId;
    const expectedBytes = uuidToBytes16Hex(batchId).toLowerCase();
    if (ethers.hexlify(onChainBatchId).toLowerCase() !== expectedBytes) {
      throw new Error(
        "Mismatch between UUID used for registration and on-chain identifier"
      );
    }

    const blockchainHash = event.args.hash;

    let pinataBackup;
    try {
      pinataBackup = await backupRecord(
        "batch",
        {
          ...draftPayload,
          batch_hash: blockchainHash,
          tx_hash: receipt.hash,
          operator_wallet: wallet.address,
        },
        {
          operation: "create",
          identifier: batchId,
        }
      );
    } catch (backupErr) {
      console.error("?? Failed to back up batch to Pinata:", backupErr);
    }

const savedBatch = await updateBatchOnChainMetadata(batchId, {
      batch_hash: blockchainHash,
      tx_hash: receipt.hash,
      created_by: wallet.address,
      pinata_cid: pinataBackup?.IpfsHash ?? null,
      pinata_pinned_at: pinataBackup?.Timestamp ?? null,
    });

    if (!savedBatch) {
      throw new Error("Failed to persist batch metadata");
    }

    const responsePayload = {
      ...savedBatch,
      blockchainTx: receipt.hash,
      pinataCid: savedBatch.pinata_cid ?? null,
      pinataTimestamp: savedBatch.pinata_pinned_at ?? null,
    };

    res.status(201).json(responsePayload);
  } catch (err) {
    console.error("? Error registering batch:", err);
    try {
      await deleteBatchById(batchId);
    } catch (cleanupErr) {
      console.error("?? Failed to clean up draft batch after error:", cleanupErr);
    }
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

    const quantityProducedStr = quantityProduced.toString();

    const tx = await contract.updateBatch(
      uuidToBytes16Hex(batch.id),
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
      .find((parsed) => parsed && parsed.name === "BatchUpdated");

    const blockchainHash = event?.args?.newHash ?? computeBatchHash(batch.id, {
      product_category: productCategory,
      manufacturer_uuid: manufacturerUUID,
      facility,
      production_window: productionWindow,
      quantity_produced: quantityProducedStr,
      release_status: releaseStatus,
    });

    const updatePayload = {
      product_category: productCategory,
      manufacturer_uuid: manufacturerUUID,
      facility,
      production_window: productionWindow,
      quantity_produced: quantityProducedStr,
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
          id: batch.id,
          ...updatePayload,
        },
        {
          operation: "update",
          identifier: batch.id,
        }
      );
    } catch (backupErr) {
      console.error("?? Failed to back up batch update to Pinata:", backupErr);
    }

    updatePayload.pinata_cid = pinataBackup?.IpfsHash ?? batch.pinata_cid ?? null;
    updatePayload.pinata_pinned_at =
      pinataBackup?.Timestamp ?? batch.pinata_pinned_at ?? null;

    const updatedBatch = await updateBatchRecord(id, updatePayload);
    if (!updatedBatch) {
      throw new Error("Failed to persist batch update");
    }

    const responsePayload = {
      ...updatedBatch,
      blockchainTx: receipt.hash,
      pinataCid: updatedBatch.pinata_cid ?? null,
      pinataTimestamp: updatedBatch.pinata_pinned_at ?? null,
    };

    res.json(responsePayload);
  } catch (err) {
    console.error("? Error updating batch:", err);
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

    if (!batch.batch_hash) {
      return res.status(409).json({
        message: "Batch is pending blockchain confirmation",
      });
    }

    const recomputed = computeBatchHash(batch.id, batch);

    if (recomputed.toLowerCase() !== batch.batch_hash.toLowerCase()) {
      return res.status(400).json({ message: "Tampered data in DB" });
    }

    const [onchainHash] = await contract.getBatch(uuidToBytes16Hex(batch.id));
    if (recomputed.toLowerCase() !== onchainHash.toLowerCase()) {
      return res.status(400).json({ message: "Tampered data on-chain" });
    }

    const { id: dbId, ...cleanBatch } = batch;
    res.json({ ...cleanBatch, verified: true });
  } catch (err) {
    console.error("? Error fetching batch:", err);
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
