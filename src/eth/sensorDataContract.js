import { ethers } from "ethers";
import SensorDataRegistryArtifact from "../../blockchain/artifacts/contracts/SensorDataRegistry.sol/SensorDataRegistry.json" with { type: "json" };
import { chain, operatorWallet, contracts } from "../config.js";

const provider = new ethers.JsonRpcProvider(chain.rpcUrl);
const wallet = new ethers.Wallet(operatorWallet.privateKey, provider);

export const sensorDataRegistry = new ethers.Contract(
  contracts.sensorDataRegistry,
  SensorDataRegistryArtifact.abi,
  wallet
);

function withSafetyMargin(estimatedGas) {
  return (estimatedGas * 120n) / 100n + 20_000n;
}

function parseReceiptEvent(receipt, eventName) {
  const targetAddress = contracts.sensorDataRegistry.toLowerCase();

  for (const log of receipt.logs) {
    if (!log.address || log.address.toLowerCase() !== targetAddress) {
      continue;
    }
    try {
      const parsed = sensorDataRegistry.interface.parseLog(log);
      if (parsed && parsed.name === eventName) {
        return parsed;
      }
    } catch {
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

export async function registerSensorDataOnChain(
  sensorDataIdBytes16,
  manufacturerIdBytes16,
  packageIdBytes16,
  canonicalPayload
) {
  const payloadBytes = toBytes(canonicalPayload);

  const estimatedGas = await sensorDataRegistry.registerSensorData.estimateGas(
    sensorDataIdBytes16,
    manufacturerIdBytes16,
    packageIdBytes16,
    payloadBytes
  );

  const tx = await sensorDataRegistry.registerSensorData(
    sensorDataIdBytes16,
    manufacturerIdBytes16,
    packageIdBytes16,
    payloadBytes,
    { gasLimit: withSafetyMargin(estimatedGas) }
  );

  const receipt = await tx.wait();
  const parsed = parseReceiptEvent(receipt, "SensorDataRegistered");
  if (!parsed) {
    throw new Error("SensorDataRegistered event not found in transaction receipt");
  }

  return {
    txHash: receipt.hash,
    payloadHash: parsed.args.hash,
  };
}

export async function fetchSensorDataOnChain(sensorDataIdBytes16) {
  const meta = await sensorDataRegistry.getSensorData(sensorDataIdBytes16);
  return {
    hash: meta.hash ?? null,
    meta,
  };
}
