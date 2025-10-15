import { ethers } from "ethers";
import RegistrationRegistryArtifact from "../../blockchain/artifacts/contracts/RegistrationRegistry.sol/RegistrationRegistry.json" with { type: "json" };
import { chain } from "../config.js";

const provider = new ethers.JsonRpcProvider(chain.rpcUrl);
const wallet = new ethers.Wallet(chain.privateKey, provider);
const registryAddress = chain.registryAddress;

export const registry = new ethers.Contract(
  registryAddress,
  RegistrationRegistryArtifact.abi,
  wallet
);

const REG_TYPE_MAP = {
  MANUFACTURER: 0,
  SUPPLIER: 1,
  WAREHOUSE: 2,
  CONSUMER: 3,
};

export async function submitOnChain(
  uuidBytes16,
  regTypeString,
  canonicalString,
  isUpdate = false
) {
  const regType = REG_TYPE_MAP[regTypeString];
  if (regType === undefined) {
    throw new Error(`Unsupported registration type: ${regTypeString}`);
  }

  const estimatedGas = await registry.submit.estimateGas(
    uuidBytes16,
    regType,
    canonicalString,
    isUpdate
  );
  const gasLimit = (estimatedGas * 120n) / 100n + 20_000n;

  const tx = await registry.submit(
    uuidBytes16,
    regType,
    canonicalString,
    isUpdate,
    {
      gasLimit,
    }
  );
  const receipt = await tx.wait();

  const iface = new ethers.Interface(RegistrationRegistryArtifact.abi);
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
