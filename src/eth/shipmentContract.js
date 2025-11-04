import { ethers } from "ethers";
import ShipmentRegistryArtifact from "../../blockchain/artifacts/contracts/ShipmentRegistry.sol/ShipmentRegistry.json" with { type: "json" };
import { chain, operatorWallet, contracts } from "../config.js";

const provider = new ethers.JsonRpcProvider(chain.rpcUrl);
const wallet = new ethers.Wallet(operatorWallet.privateKey, provider);

export const shipmentRegistry = new ethers.Contract(
  contracts.shipmentRegistry,
  ShipmentRegistryArtifact.abi,
  wallet
);

export const shipmentOperatorAddress = wallet.address;

function withSafetyMargin(estimatedGas) {
  return (estimatedGas * 120n) / 100n + 20_000n;
}

function parseReceiptEvent(receipt, eventName) {
  const targetAddress = contracts.shipmentRegistry.toLowerCase();

  for (const log of receipt.logs) {
    if (!log.address || log.address.toLowerCase() !== targetAddress) {
      continue;
    }
    try {
      const parsed = shipmentRegistry.interface.parseLog(log);
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

export async function registerShipmentOnChain(shipmentIdBytes16, payloadHash) {
  const hashInput = normalizeBytes32(payloadHash);

  const estimatedGas = await shipmentRegistry.registerShipment.estimateGas(
    shipmentIdBytes16,
    hashInput
  );

  const tx = await shipmentRegistry.registerShipment(
    shipmentIdBytes16,
    hashInput,
    {
      gasLimit: withSafetyMargin(estimatedGas),
    }
  );

  const receipt = await tx.wait();
  const parsed = parseReceiptEvent(receipt, "ShipmentRegistered");

  if (!parsed) {
    throw new Error("ShipmentRegistered event not found in transaction receipt");
  }

  return {
    txHash: receipt.hash,
    shipmentHash: parsed.args.hash,
  };
}

export async function updateShipmentOnChain(shipmentIdBytes16, payloadHash) {
  const hashInput = normalizeBytes32(payloadHash);

  const estimatedGas = await shipmentRegistry.updateShipment.estimateGas(
    shipmentIdBytes16,
    hashInput
  );

  const tx = await shipmentRegistry.updateShipment(
    shipmentIdBytes16,
    hashInput,
    {
      gasLimit: withSafetyMargin(estimatedGas),
    }
  );

  const receipt = await tx.wait();
  const parsed = parseReceiptEvent(receipt, "ShipmentUpdated");

  return {
    txHash: receipt.hash,
    shipmentHash: parsed?.args?.newHash ?? null,
  };
}

export async function fetchShipmentOnChain(shipmentIdBytes16) {
  try {
    const meta = await shipmentRegistry.getShipment(shipmentIdBytes16);
    return {
      hash: meta.hash ?? null,
      meta,
    };
  } catch (err) {
    return {
      hash: null,
      error: err,
    };
  }
}
