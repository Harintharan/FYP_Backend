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

function toBytes(canonicalPayload) {
  if (canonicalPayload == null) {
    throw new TypeError("canonicalPayload is required");
  }
  if (canonicalPayload instanceof Uint8Array) {
    return canonicalPayload;
  }
  if (typeof canonicalPayload === "string") {
    return ethers.toUtf8Bytes(canonicalPayload);
  }
  throw new TypeError("canonicalPayload must be a string or Uint8Array");
}

export async function registerBatchOnChain(batchIdBytes16, canonicalPayload) {
  const payloadBytes = toBytes(canonicalPayload);

  const estimatedGas = await batchRegistry.registerBatch.estimateGas(
    batchIdBytes16,
    payloadBytes
  );

  const tx = await batchRegistry.registerBatch(batchIdBytes16, payloadBytes, {
    gasLimit: withSafetyMargin(estimatedGas),
  });

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

export async function updateBatchOnChain(batchIdBytes16, canonicalPayload) {
  const payloadBytes = toBytes(canonicalPayload);

  const estimatedGas = await batchRegistry.updateBatch.estimateGas(
    batchIdBytes16,
    payloadBytes
  );

  const tx = await batchRegistry.updateBatch(batchIdBytes16, payloadBytes, {
    gasLimit: withSafetyMargin(estimatedGas),
  });

  const receipt = await tx.wait();
  const parsed = parseReceiptEvent(receipt, "BatchUpdated");

  return {
    txHash: receipt.hash,
    batchHash: parsed?.args?.newHash ?? null,
  };
}

export async function fetchBatchOnChain(batchIdBytes16) {
  const meta = await batchRegistry.getBatch(batchIdBytes16);

  return {
    hash: meta.hash ?? null,
    meta,
  };
}
