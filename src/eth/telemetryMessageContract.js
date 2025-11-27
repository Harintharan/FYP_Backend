import { ethers } from "ethers";
import TelemetryMessageRegistryArtifact from "../../blockchain/artifacts/contracts/TelemetryMessageRegistry.sol/TelemetryMessageRegistry.json" with { type: "json" };
import { chain, operatorWallet, contracts } from "../config.js";

const provider = new ethers.JsonRpcProvider(chain.rpcUrl);
const wallet = new ethers.Wallet(operatorWallet.privateKey, provider);

export const telemetryMessageRegistry = new ethers.Contract(
  contracts.telemetryMessageRegistry,
  TelemetryMessageRegistryArtifact.abi,
  wallet
);

function withSafetyMargin(estimatedGas) {
  return (estimatedGas * 120n) / 100n + 20_000n;
}

function parseReceiptEvent(receipt, eventName) {
  const targetAddress = contracts.telemetryMessageRegistry.toLowerCase();

  for (const log of receipt.logs) {
    if (!log.address || log.address.toLowerCase() !== targetAddress) {
      continue;
    }
    try {
      const parsed = telemetryMessageRegistry.interface.parseLog(log);
      if (parsed && parsed.name === eventName) {
        return parsed;
      }
    } catch {
      continue;
    }
  }

  return null;
}

/**
 * Register a telemetry message on the blockchain
 * @param {string} messageId - Message ID as bytes16 hex
 * @param {string} packageId - Package ID as bytes16 hex
 * @param {string} manufacturerId - Manufacturer ID as bytes16 hex
 * @param {string} canonicalPayload - Canonical JSON payload
 * @returns {Object} Transaction hash and payload hash
 */
export async function registerTelemetryMessageOnChain(
  messageId,
  packageId,
  manufacturerId,
  canonicalPayload
) {
  const payloadHash = ethers.keccak256(ethers.toUtf8Bytes(canonicalPayload));

  const estimatedGas = await telemetryMessageRegistry.registerTelemetryMessage.estimateGas(
    messageId,
    packageId,
    manufacturerId,
    payloadHash
  );

  const tx = await telemetryMessageRegistry.registerTelemetryMessage(
    messageId,
    packageId,
    manufacturerId,
    payloadHash,
    { gasLimit: withSafetyMargin(estimatedGas) }
  );

  const receipt = await tx.wait();

  const targetAddress = contracts.telemetryMessageRegistry.toLowerCase();
  const event = receipt.logs
    .filter((log) => log.address.toLowerCase() === targetAddress)
    .map((log) => {
      try {
        return telemetryMessageRegistry.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((e) => e && e.name === "TelemetryMessageRegistered");

  if (!event) {
    throw new Error("TelemetryMessageRegistered event not found");
  }

  return {
    txHash: receipt.hash,
    payloadHash: event.args.payloadHash,
    timestamp: Number(event.args.timestamp),
  };
}

/**
 * Get telemetry message from blockchain
 * @param {string} messageId - Message ID as bytes16 hex
 * @returns {Object} Message details
 */
export async function getTelemetryMessageFromChain(messageId) {
  const result = await telemetryMessageRegistry.getTelemetryMessage(messageId);
  
  return {
    messageId: result.messageId,
    packageId: result.packageId,
    manufacturerId: result.manufacturerId,
    payloadHash: result.payloadHash,
    timestamp: result.timestamp.toNumber(),
    registeredBy: result.registeredBy,
  };
}

/**
 * Verify telemetry message hash
 * @param {string} messageId - Message ID as bytes16 hex
 * @param {string} payloadHash - Hash to verify
 * @returns {boolean} Whether hash matches
 */
export async function verifyTelemetryMessageHash(messageId, payloadHash) {
  return await telemetryMessageRegistry.verifyTelemetryMessage(messageId, payloadHash);
}

/**
 * Get messages by package ID
 * @param {string} packageId - Package ID as bytes16 hex
 * @returns {Array} List of message IDs
 */
export async function getMessagesByPackage(packageId) {
  return await telemetryMessageRegistry.getMessagesByPackage(packageId);
}
