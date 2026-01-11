import { ethers } from "ethers";
import { chain } from "../config.js";

let provider = null;
const walletCache = new Map();

function getProvider() {
  if (!provider) {
    provider = new ethers.JsonRpcProvider(chain.rpcUrl);
  }
  return provider;
}

export function getNonceManagedWallet(privateKey) {
  if (!privateKey) {
    throw new Error("Missing wallet private key");
  }

  const cached = walletCache.get(privateKey);
  if (cached) {
    return cached;
  }

  const wallet = new ethers.Wallet(privateKey, getProvider());
  const managed = new ethers.NonceManager(wallet);
  walletCache.set(privateKey, managed);
  return managed;
}
