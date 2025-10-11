import { ethers } from "ethers";
import CheckpointRegistryArtifact from "../../blockchain/artifacts/contracts/CheckpointRegistry.sol/CheckpointRegistry.json" with { type: "json" };
import { chain, operatorWallet, contracts } from "../config.js";

const provider = new ethers.JsonRpcProvider(chain.rpcUrl);
const wallet = new ethers.Wallet(operatorWallet.privateKey, provider);

export const checkpointRegistry = new ethers.Contract(
  contracts.checkpointRegistry,
  CheckpointRegistryArtifact.abi,
  wallet
);

function withSafetyMargin(estimatedGas) {
  return (estimatedGas * 120n) / 100n + 20_000n;
}

function parseReceiptEvent(receipt, eventName) {
  const targetAddress = contracts.checkpointRegistry.toLowerCase();

  for (const log of receipt.logs) {
    if (!log.address || log.address.toLowerCase() !== targetAddress) {
      continue;
    }
    try {
      const parsed = checkpointRegistry.interface.parseLog(log);
      if (parsed && parsed.name === eventName) {
        return parsed;
      }
    } catch {
      continue;
    }
  }
  return null;
}

function toBytes(payload) {
  if (payload == null) {
    throw new TypeError("canonicalPayload is required");
  }
  if (payload instanceof Uint8Array) {
    return payload;
  }
  if (typeof payload === "string") {
    return ethers.toUtf8Bytes(payload);
  }
  throw new TypeError("canonicalPayload must be a string or Uint8Array");
}

export async function registerCheckpointOnChain(checkpointIdBytes16, canonicalPayload) {
  const payloadBytes = toBytes(canonicalPayload);

  const estimatedGas = await checkpointRegistry.registerCheckpoint.estimateGas(
    checkpointIdBytes16,
    payloadBytes
  );

  const tx = await checkpointRegistry.registerCheckpoint(
    checkpointIdBytes16,
    payloadBytes,
    {
      gasLimit: withSafetyMargin(estimatedGas),
    }
  );

  const receipt = await tx.wait();
  const parsed = parseReceiptEvent(receipt, "CheckpointRegistered");

  if (!parsed) {
    throw new Error("CheckpointRegistered event not found in transaction receipt");
  }

  return {
    txHash: receipt.hash,
    checkpointHash: parsed.args.hash,
  };
}

export async function updateCheckpointOnChain(checkpointIdBytes16, canonicalPayload) {
  const payloadBytes = toBytes(canonicalPayload);

  const estimatedGas = await checkpointRegistry.updateCheckpoint.estimateGas(
    checkpointIdBytes16,
    payloadBytes
  );

  const tx = await checkpointRegistry.updateCheckpoint(
    checkpointIdBytes16,
    payloadBytes,
    {
      gasLimit: withSafetyMargin(estimatedGas),
    }
  );

  const receipt = await tx.wait();
  const parsed = parseReceiptEvent(receipt, "CheckpointUpdated");

  return {
    txHash: receipt.hash,
    checkpointHash: parsed?.args?.newHash ?? null,
  };
}

export async function fetchCheckpointOnChain(checkpointIdBytes16) {
  const meta = await checkpointRegistry.getCheckpoint(checkpointIdBytes16);
  return {
    hash: meta?.hash ?? null,
    meta,
  };
}
