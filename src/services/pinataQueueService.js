import { enqueuePinataJob } from "../models/PinataJobModel.js";
import { pinataEnabled } from "../config.js";

const debugEnabled =
  process.env.PINATA_QUEUE_DEBUG === "true" ||
  process.env.PINATA_QUEUE_DEBUG === "1";

function debugLog(...args) {
  if (debugEnabled) {
    console.log("[PINATA_QUEUE]", ...args);
  }
}

function buildPinataPayload(record, walletAddress) {
  const payload = { ...(record ?? {}) };
  const resolvedWallet =
    walletAddress ?? payload.walletAddress ?? payload.wallet_address ?? null;

  if (resolvedWallet) {
    payload.walletAddress = resolvedWallet;
  }

  return payload;
}

export async function enqueuePinataBackup(
  {
    entity,
    recordId,
    identifier,
    operation,
    record,
    walletAddress,
    metadata,
    pinataOptions,
  },
  dbClient
) {
  if (!pinataEnabled) {
    debugLog("pinata disabled; skip enqueue", entity, recordId);
    return null;
  }
  const payload = buildPinataPayload(record, walletAddress);

  const job = await enqueuePinataJob(
    {
      entity,
      recordId,
      identifier,
      operation,
      payload,
      metadata,
      pinataOptions,
    },
    dbClient
  );
  debugLog("enqueue pinata job", job?.id ?? null, entity, recordId);
  return job;
}
