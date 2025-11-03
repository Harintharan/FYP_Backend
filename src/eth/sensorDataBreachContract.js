import { ethers } from "ethers";
import SensorDataBreachRegistryArtifact from "../../blockchain/artifacts/contracts/SensorDataBreachRegistry.sol/SensorDataBreachRegistry.json" with { type: "json" };
import { chain, operatorWallet, contracts } from "../config.js";

const provider = new ethers.JsonRpcProvider(chain.rpcUrl);
const wallet = new ethers.Wallet(operatorWallet.privateKey, provider);

export const sensorDataBreachRegistry = new ethers.Contract(
  contracts.sensorDataBreachRegistry,
  SensorDataBreachRegistryArtifact.abi,
  wallet
);

function withSafetyMargin(estimatedGas) {
  return (estimatedGas * 120n) / 100n + 20_000n;
}

function parseReceiptEvent(receipt, eventName) {
  const targetAddress = contracts.sensorDataBreachRegistry.toLowerCase();

  for (const log of receipt.logs) {
    if (!log.address || log.address.toLowerCase() !== targetAddress) {
      continue;
    }
    try {
      const parsed = sensorDataBreachRegistry.interface.parseLog(log);
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

export async function registerSensorDataBreachOnChain(
  breachIdBytes16,
  manufacturerIdBytes16,
  packageIdBytes16,
  sensorDataIdBytes16,
  canonicalPayload
) {
  const payloadBytes = toBytes(canonicalPayload);

  const estimatedGas = await sensorDataBreachRegistry.registerSensorDataBreach.estimateGas(
    breachIdBytes16,
    manufacturerIdBytes16,
    packageIdBytes16,
    sensorDataIdBytes16,
    payloadBytes
  );

  const tx = await sensorDataBreachRegistry.registerSensorDataBreach(
    breachIdBytes16,
    manufacturerIdBytes16,
    packageIdBytes16,
    sensorDataIdBytes16,
    payloadBytes,
    { gasLimit: withSafetyMargin(estimatedGas) }
  );

  const receipt = await tx.wait();
  const parsed = parseReceiptEvent(receipt, "SensorDataBreachRegistered");
  if (!parsed) {
    throw new Error("SensorDataBreachRegistered event not found in transaction receipt");
  }

  return {
    txHash: receipt.hash,
    payloadHash: parsed.args.hash,
  };
}

export async function fetchSensorDataBreachOnChain(breachIdBytes16) {
  const meta = await sensorDataBreachRegistry.getSensorDataBreach(breachIdBytes16);
  return {
    hash: meta.hash ?? null,
    meta,
  };
}
