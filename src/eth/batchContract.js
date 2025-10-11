import { ethers } from "ethers";
import BatchRegistryArtifact from "../../blockchain/artifacts/contracts/BatchRegistry.sol/BatchRegistry.json" with { type: "json" };
import { chain, operatorWallet, contracts } from "../config.js";

const provider = new ethers.JsonRpcProvider(chain.rpcUrl);
const wallet = new ethers.Wallet(operatorWallet.privateKey, provider);

export const batchRegistry = new ethers.Contract(
  contracts.batchRegistry,
  BatchRegistryArtifact.abi,
  wallet
);

function withSafetyMargin(estimatedGas) {
  return (estimatedGas * 120n) / 100n + 20_000n;
}

function parseReceiptEvent(receipt, eventName) {
  const targetAddress = contracts.batchRegistry.toLowerCase();

  for (const log of receipt.logs) {
    if (!log.address || log.address.toLowerCase() !== targetAddress) {
      continue;
    }
    try {
      const parsed = batchRegistry.interface.parseLog(log);
      if (parsed && parsed.name === eventName) {
        return parsed;
      }
    } catch (err) {
      continue;
    }
  }

  return null;
}

export async function registerBatchOnChain(batchIdBytes16, payload) {
  const {
    productCategory,
    manufacturerUUID,
    facility,
    productionWindow,
    quantityProduced,
    releaseStatus,
  } = payload;

  const estimatedGas = await batchRegistry.registerBatch.estimateGas(
    batchIdBytes16,
    productCategory,
    manufacturerUUID,
    facility,
    productionWindow,
    quantityProduced,
    releaseStatus
  );

  const tx = await batchRegistry.registerBatch(
    batchIdBytes16,
    productCategory,
    manufacturerUUID,
    facility,
    productionWindow,
    quantityProduced,
    releaseStatus,
    {
      gasLimit: withSafetyMargin(estimatedGas),
    }
  );

  const receipt = await tx.wait();
  const parsed = parseReceiptEvent(receipt, "BatchRegistered");

  if (!parsed) {
    throw new Error("BatchRegistered event not found in transaction receipt");
  }

  return {
    txHash: receipt.hash,
    batchHash: parsed.args.hash,
  };
}

export async function updateBatchOnChain(batchIdBytes16, payload) {
  const {
    productCategory,
    manufacturerUUID,
    facility,
    productionWindow,
    quantityProduced,
    releaseStatus,
  } = payload;

  const estimatedGas = await batchRegistry.updateBatch.estimateGas(
    batchIdBytes16,
    productCategory,
    manufacturerUUID,
    facility,
    productionWindow,
    quantityProduced,
    releaseStatus
  );

  const tx = await batchRegistry.updateBatch(
    batchIdBytes16,
    productCategory,
    manufacturerUUID,
    facility,
    productionWindow,
    quantityProduced,
    releaseStatus,
    {
      gasLimit: withSafetyMargin(estimatedGas),
    }
  );

  const receipt = await tx.wait();
  const parsed = parseReceiptEvent(receipt, "BatchUpdated");

  return {
    txHash: receipt.hash,
    batchHash: parsed?.args?.newHash ?? null,
  };
}

export async function fetchBatchOnChain(batchIdBytes16) {
  const result = await batchRegistry.getBatch(batchIdBytes16);
  const hash = result?.[0] ?? result?.hash ?? null;
  const batch = result?.[1] ?? result?.batch ?? {};

  return {
    hash,
    batch: {
      productCategory: batch.productCategory,
      manufacturerUUID: batch.manufacturerUUID,
      facility: batch.facility,
      productionWindow: batch.productionWindow,
      quantityProduced: batch.quantityProduced,
      releaseStatus: batch.releaseStatus,
      createdAt: batch.createdAt,
      updatedAt: batch.updatedAt,
      createdBy: batch.createdBy,
      updatedBy: batch.updatedBy,
    },
  };
}

