import { ethers } from "ethers";
import PackageRegistryArtifact from "../../blockchain/artifacts/contracts/PackageRegistry.sol/PackageRegistry.json" with { type: "json" };
import { chain, operatorWallet, contracts } from "../config.js";

const provider = new ethers.JsonRpcProvider(chain.rpcUrl);
const wallet = new ethers.Wallet(operatorWallet.privateKey, provider);

export const packageRegistry = new ethers.Contract(
  contracts.packageRegistry,
  PackageRegistryArtifact.abi,
  wallet
);

function withSafetyMargin(estimatedGas) {
  return (estimatedGas * 120n) / 100n + 20_000n;
}

function parseReceiptEvent(receipt, eventName) {
  const targetAddress = contracts.packageRegistry.toLowerCase();

  for (const log of receipt.logs) {
    if (!log.address || log.address.toLowerCase() !== targetAddress) {
      continue;
    }
    try {
      const parsed = packageRegistry.interface.parseLog(log);
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

export async function registerProductOnChain(
  productIdBytes16,
  canonicalPayload
) {
  const payloadBytes = toBytes(canonicalPayload);

  const estimatedGas = await packageRegistry.registerProduct.estimateGas(
    productIdBytes16,
    payloadBytes
  );

  const tx = await packageRegistry.registerProduct(
    productIdBytes16,
    payloadBytes,
    {
      gasLimit: withSafetyMargin(estimatedGas),
    }
  );

  const receipt = await tx.wait();
  const parsed = parseReceiptEvent(receipt, "ProductRegistered");

  if (!parsed) {
    throw new Error("ProductRegistered event not found in transaction receipt");
  }

  return {
    txHash: receipt.hash,
    productHash: parsed.args.hash,
  };
}

export async function updateProductOnChain(
  productIdBytes16,
  canonicalPayload
) {
  const payloadBytes = toBytes(canonicalPayload);

  const estimatedGas = await packageRegistry.updateProduct.estimateGas(
    productIdBytes16,
    payloadBytes
  );

  const tx = await packageRegistry.updateProduct(
    productIdBytes16,
    payloadBytes,
    {
      gasLimit: withSafetyMargin(estimatedGas),
    }
  );

  const receipt = await tx.wait();
  const parsed = parseReceiptEvent(receipt, "ProductUpdated");

  return {
    txHash: receipt.hash,
    productHash: parsed?.args?.newHash ?? null,
  };
}

export async function fetchProductOnChain(productIdBytes16) {
  const meta = await packageRegistry.getProduct(productIdBytes16);

  return {
    hash: meta.hash ?? null,
    meta,
  };
}
