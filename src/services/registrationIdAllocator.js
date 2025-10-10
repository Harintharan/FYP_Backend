import { randomUUID } from "node:crypto";
import { uuidToBytes16Hex } from "../utils/uuidHex.js";
import { registry } from "../eth/contract.js";
import { findRegistrationById } from "../models/registrationModel.js";

export async function allocateRegistrationUuid() {
  let attempt = 0;
  while (true) {
    attempt += 1;
    const candidateId = randomUUID();

    const existingInDb = await findRegistrationById(candidateId);
    if (existingInDb) {
      console.warn(
        `🔁 Generated registration UUID collision in DB (attempt ${attempt})`
      );
      continue;
    }

    const candidateBytes = uuidToBytes16Hex(candidateId);
    const existsOnChain = await registry.exists(candidateBytes);
    if (existsOnChain) {
      console.warn(
        `🔁 Generated registration UUID already on-chain (attempt ${attempt})`
      );
      continue;
    }

    return { registrationId: candidateId, uuidBytes16: candidateBytes };
  }
}
