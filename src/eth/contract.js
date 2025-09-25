import { ethers } from "ethers";
import abi from "../../abi/RegistrationRegistry.json" with { type: "json" };
import { chain } from "../config.js";

const provider = new ethers.JsonRpcProvider(chain.rpcUrl);
const wallet = new ethers.Wallet(chain.privateKey, provider);
const registryAddress = chain.registryAddress;

export const registry = new ethers.Contract(registryAddress, abi, wallet);

const REG_TYPE_MAP = {
  MANUFACTURER: 0,
  SUPPLIER: 1,
  WAREHOUSE: 2,
};

export async function submitOnChain(uuidBytes16, regTypeString, canonicalString) {
  const regType = REG_TYPE_MAP[regTypeString];
  if (regType === undefined) {
    throw new Error(`Unsupported registration type: ${regTypeString}`);
  }

  const tx = await registry.submit(uuidBytes16, regType, canonicalString);
  const receipt = await tx.wait();

  const iface = new ethers.Interface(abi);
  const targetAddress = registryAddress.toLowerCase();
  let payloadHash;

  for (const log of receipt.logs) {
    if (!log.address || log.address.toLowerCase() !== targetAddress) {
      continue;
    }
    try {
      const parsed = iface.parseLog(log);
      if (parsed.name === "RegistrationSubmitted") {
        payloadHash = parsed.args.payloadHash;
        break;
      }
    } catch (err) {
      continue;
    }
  }

  if (!payloadHash) {
    throw new Error("RegistrationSubmitted event missing payloadHash");
  }

  return {
    txHash: receipt.hash,
    payloadHash,
  };
}
