import { ethers } from "ethers";
import ConditionBreachRegistryArtifact from "../../blockchain/artifacts/contracts/ConditionBreachRegistry.sol/ConditionBreachRegistry.json" with { type: "json" };
import { chain, operatorWallet, contracts } from "../config.js";

const provider = new ethers.JsonRpcProvider(chain.rpcUrl);
const wallet = new ethers.Wallet(operatorWallet.privateKey, provider);

export const conditionBreachRegistry = new ethers.Contract(
  contracts.conditionBreachRegistry,
  ConditionBreachRegistryArtifact.abi,
  wallet
);

function withSafetyMargin(estimatedGas) {
  return (estimatedGas * 120n) / 100n + 20_000n;
}

function parseReceiptEvent(receipt, eventName) {
  const targetAddress = contracts.conditionBreachRegistry.toLowerCase();

  for (const log of receipt.logs) {
    if (!log.address || log.address.toLowerCase() !== targetAddress) {
      continue;
    }
    try {
      const parsed = conditionBreachRegistry.interface.parseLog(log);
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
 * Register a condition breach on the blockchain
 * @param {string} breachId - Breach ID as bytes16 hex
 * @param {string} packageId - Package ID as bytes16 hex
 * @param {string} messageId - Message ID as bytes16 hex (can be zero bytes)
 * @param {string} canonicalPayload - Canonical JSON payload
 * @param {number} breachStartTime - Unix timestamp when breach started
 * @returns {Object} Transaction hash and payload hash
 */
export async function registerConditionBreachOnChain(
  breachId,
  packageId,
  messageId,
  canonicalPayload,
  breachStartTime
) {
  const payloadHash = ethers.keccak256(ethers.toUtf8Bytes(canonicalPayload));

  const estimatedGas = await conditionBreachRegistry.registerConditionBreach.estimateGas(
    breachId,
    packageId,
    messageId,
    payloadHash,
    breachStartTime
  );

  const tx = await conditionBreachRegistry.registerConditionBreach(
    breachId,
    packageId,
    messageId,
    payloadHash,
    breachStartTime,
    { gasLimit: withSafetyMargin(estimatedGas) }
  );

  const receipt = await tx.wait();

  const targetAddress = contracts.conditionBreachRegistry.toLowerCase();
  const event = receipt.logs
    .filter((log) => log.address.toLowerCase() === targetAddress)
    .map((log) => {
      try {
        return conditionBreachRegistry.interface.parseLog(log);
      } catch {
        return null;
      }
    })
    .find((e) => e && e.name === "ConditionBreachRegistered");

  if (!event) {
    throw new Error("ConditionBreachRegistered event not found");
  }

  return {
    txHash: receipt.hash,
    payloadHash: event.args.payloadHash,
    timestamp: Number(event.args.timestamp),
  };
}

/**
 * Get condition breach from blockchain
 * @param {string} breachId - Breach ID as bytes16 hex
 * @returns {Object} Breach details
 */
export async function getConditionBreachFromChain(breachId) {
  const result = await conditionBreachRegistry.getConditionBreach(breachId);
  
  return {
    breachId: result.breachId,
    packageId: result.packageId,
    messageId: result.messageId,
    payloadHash: result.payloadHash,
    breachStartTime: result.breachStartTime.toNumber(),
    timestamp: result.timestamp.toNumber(),
    registeredBy: result.registeredBy,
  };
}

/**
 * Verify condition breach hash
 * @param {string} breachId - Breach ID as bytes16 hex
 * @param {string} payloadHash - Hash to verify
 * @returns {boolean} Whether hash matches
 */
export async function verifyConditionBreachHash(breachId, payloadHash) {
  return await conditionBreachRegistry.verifyConditionBreach(breachId, payloadHash);
}

/**
 * Get breaches by package ID
 * @param {string} packageId - Package ID as bytes16 hex
 * @returns {Array} List of breach IDs
 */
export async function getBreachesByPackage(packageId) {
  return await conditionBreachRegistry.getBreachesByPackage(packageId);
}

/**
 * Get breaches by message ID
 * @param {string} messageId - Message ID as bytes16 hex
 * @returns {Array} List of breach IDs
 */
export async function getBreachesByMessage(messageId) {
  return await conditionBreachRegistry.getBreachesByMessage(messageId);
}
