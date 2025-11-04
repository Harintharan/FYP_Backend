import { ethers } from "ethers";
import ShipmentSegmentRegistryArtifact from "../../blockchain/artifacts/contracts/ShipmentSegmentRegistry.sol/ShipmentSegmentRegistry.json" with { type: "json" };
import { chain, operatorWallet, contracts } from "../config.js";

const provider = new ethers.JsonRpcProvider(chain.rpcUrl);
const wallet = new ethers.Wallet(operatorWallet.privateKey, provider);

export const shipmentSegmentRegistry = new ethers.Contract(
  contracts.shipmentSegment,
  ShipmentSegmentRegistryArtifact.abi,
  wallet
);

export const shipmentSegmentOperatorAddress = wallet.address;

function withSafetyMargin(estimatedGas) {
  return (estimatedGas * 120n) / 100n + 20_000n;
}

function parseReceiptEvent(receipt, eventName) {
  const targetAddress = contracts.shipmentSegment.toLowerCase();

  for (const log of receipt.logs) {
    if (!log.address || log.address.toLowerCase() !== targetAddress) {
      continue;
    }
    try {
      const parsed = shipmentSegmentRegistry.interface.parseLog(log);
      if (parsed && parsed.name === eventName) {
        return parsed;
      }
    } catch (err) {
      continue;
    }
  }

  return null;
}

function normalizeBytes32(value) {
  if (value == null) {
    throw new TypeError("Hash value is required");
  }

  if (value instanceof Uint8Array) {
    if (value.length !== 32) {
      throw new TypeError("Hash must be 32 bytes");
    }
    return value;
  }

  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!ethers.isHexString(trimmed)) {
      throw new TypeError("Hash must be a hex string");
    }
    if (ethers.dataLength(trimmed) !== 32) {
      throw new TypeError("Hash must resolve to 32 bytes");
    }
    return trimmed;
  }

  throw new TypeError("Hash must be a hex string or Uint8Array");
}

export async function registerShipmentSegmentOnChain(
  segmentIdBytes16,
  segmentHash
) {
  const normalizedHash = normalizeBytes32(segmentHash);

  const estimatedGas = await shipmentSegmentRegistry.registerSegment.estimateGas(
    segmentIdBytes16,
    normalizedHash
  );

  const tx = await shipmentSegmentRegistry.registerSegment(
    segmentIdBytes16,
    normalizedHash,
    {
      gasLimit: withSafetyMargin(estimatedGas),
    }
  );

  const receipt = await tx.wait();
  const parsed = parseReceiptEvent(receipt, "SegmentRegistered");

  if (!parsed) {
    throw new Error("SegmentRegistered event not found in transaction receipt");
  }

  return {
    txHash: receipt.hash,
    segmentHash: parsed.args.hash,
  };
}

export async function updateShipmentSegmentOnChain(
  segmentIdBytes16,
  segmentHash
) {
  const normalizedHash = normalizeBytes32(segmentHash);

  const estimatedGas = await shipmentSegmentRegistry.updateSegment.estimateGas(
    segmentIdBytes16,
    normalizedHash
  );

  const tx = await shipmentSegmentRegistry.updateSegment(
    segmentIdBytes16,
    normalizedHash,
    {
      gasLimit: withSafetyMargin(estimatedGas),
    }
  );

  const receipt = await tx.wait();
  const parsed = parseReceiptEvent(receipt, "SegmentUpdated");

  return {
    txHash: receipt.hash,
    segmentHash: parsed?.args?.newHash ?? null,
  };
}

export async function fetchShipmentSegmentOnChain(segmentIdBytes16) {
  const meta = await shipmentSegmentRegistry.getSegment(segmentIdBytes16);

  return {
    hash: meta.hash ?? null,
    meta,
  };
}
