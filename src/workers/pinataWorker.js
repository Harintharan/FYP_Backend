import pool from "../db.js";
import { pinataEnabled } from "../config.js";
import { runInTransaction } from "../utils/dbTransactions.js";
import { backupRecord } from "../services/pinataBackupService.js";
import {
  fetchPendingPinataJobs,
  markPinataJobFailed,
  markPinataJobSkipped,
  markPinataJobSuccess,
  schedulePinataJobRetry,
} from "../models/PinataJobModel.js";
import { updateBatchPinataFields } from "../models/batchModel.js";
import { updateCheckpointPinataFields } from "../models/CheckpointRegistryModel.js";
import { updateConditionBreachPinataFields } from "../models/ConditionBreachModel.js";
import { updatePackagePinataFields } from "../models/PackageRegistryModel.js";
import { updateProductPinataFields } from "../models/productModel.js";
import { updateRegistrationPinataFields } from "../models/registrationModel.js";
import { updateShipmentPinataFields } from "../models/ShipmentRegistryModel.js";
import { updateShipmentSegmentPinataFields } from "../models/ShipmentSegmentModel.js";

const queueMode = (
  process.env.PINATA_QUEUE_MODE ?? "poll"
).toLowerCase();
const pollIntervalMs = Number.parseInt(
  process.env.PINATA_QUEUE_POLL_MS ?? "5000",
  10
);
const batchSize = Number.parseInt(
  process.env.PINATA_QUEUE_BATCH_SIZE ?? "5",
  10
);
const maxAttempts = Number.parseInt(
  process.env.PINATA_QUEUE_MAX_ATTEMPTS ?? "5",
  10
);
const baseDelayMs = Number.parseInt(
  process.env.PINATA_QUEUE_BASE_DELAY_MS ?? "5000",
  10
);
const maxDelayMs = Number.parseInt(
  process.env.PINATA_QUEUE_MAX_DELAY_MS ?? "60000",
  10
);
const debugEnabled =
  process.env.PINATA_QUEUE_DEBUG === "true" ||
  process.env.PINATA_QUEUE_DEBUG === "1";

function debugLog(...args) {
  if (debugEnabled) {
    console.log("[PINATA_QUEUE]", ...args);
  }
}

function computeBackoffMs(attempt) {
  const multiplier = Math.max(attempt - 1, 0);
  return Math.min(baseDelayMs * 2 ** multiplier, maxDelayMs);
}

function resolvePayloadHash(job) {
  return (
    job.payload?.payloadHash ??
    job.payload?.payload_hash ??
    null
  );
}

async function handlePinataJob(job, pinataResult, attempts, dbClient) {
  const payloadHash = resolvePayloadHash(job);
  if (!payloadHash) {
    debugLog("skip job missing payloadHash", job.id);
    await markPinataJobSkipped(
      {
        id: job.id,
        attempts,
        reason: "Missing payloadHash for pinata job",
      },
      dbClient
    );
    return;
  }

  const updatePayload = {
    id: job.record_id,
    payloadHash,
    pinataCid: pinataResult?.IpfsHash ?? null,
    pinataPinnedAt: pinataResult?.Timestamp
      ? new Date(pinataResult.Timestamp)
      : null,
  };

  let updated = null;
  switch (job.entity) {
    case "product":
      updated = await updateProductPinataFields(updatePayload, dbClient);
      break;
    case "batch":
      updated = await updateBatchPinataFields(updatePayload, dbClient);
      break;
    case "user_registration":
      updated = await updateRegistrationPinataFields(updatePayload, dbClient);
      break;
    case "checkpoint":
      updated = await updateCheckpointPinataFields(updatePayload, dbClient);
      break;
    case "package":
      updated = await updatePackagePinataFields(updatePayload, dbClient);
      break;
    case "shipment":
      updated = await updateShipmentPinataFields(updatePayload, dbClient);
      break;
    case "shipment_segment":
      updated = await updateShipmentSegmentPinataFields(updatePayload, dbClient);
      break;
    case "condition_breach":
      updated = await updateConditionBreachPinataFields(updatePayload, dbClient);
      break;
    default:
      await markPinataJobSkipped(
        {
          id: job.id,
          attempts,
          reason: `Unsupported entity: ${job.entity}`,
        },
        dbClient
      );
      debugLog("job skipped unsupported entity", job.id, job.entity);
      return;
  }

  if (!updated) {
    debugLog("skip job record not found or payload hash changed", job.id);
    await markPinataJobSkipped(
      {
        id: job.id,
        attempts,
        reason: "Record not found or payload hash changed",
      },
      dbClient
    );
    return;
  }

  await markPinataJobSuccess({ id: job.id, attempts }, dbClient);
}

async function processJob(job) {
  const attempts = (job.attempts ?? 0) + 1;
  debugLog("processing job", job.id, "entity", job.entity, "attempt", attempts);

  try {
    const pinataResult = await backupRecord(job.entity, job.payload, {
      operation: job.operation ?? "create",
      identifier: job.identifier ?? job.record_id ?? null,
      metadata: job.metadata ?? undefined,
      pinataOptions: job.pinata_options ?? undefined,
    });

    await runInTransaction(async (client) => {
      await handlePinataJob(job, pinataResult, attempts, client);
      debugLog("job processed", job.id);
    });
  } catch (error) {
    const message = error?.message ?? String(error);
    if (attempts >= maxAttempts) {
      debugLog("job failed permanently", job.id, message);
      await markPinataJobFailed(
        { id: job.id, attempts, errorMessage: message },
        null
      );
      return;
    }

    const delayMs = computeBackoffMs(attempts);
    const nextRunAt = new Date(Date.now() + delayMs);
    debugLog("job scheduled for retry", job.id, "in", delayMs, "ms");
    await schedulePinataJobRetry(
      { id: job.id, attempts, nextRunAt, errorMessage: message },
      null
    );
  }
}

let isRunning = false;
let listenerClient = null;

async function processBatch() {
  if (isRunning) {
    debugLog("batch skipped; already running");
    return;
  }
  isRunning = true;
  try {
    const jobs = await fetchPendingPinataJobs({ limit: batchSize });
    debugLog("batch fetched", jobs.length, "job(s)");
    for (const job of jobs) {
      await processJob(job);
    }
  } catch (error) {
    console.error("? Pinata worker batch failed:", error);
  } finally {
    isRunning = false;
  }
}

function startWorker() {
  if (!pinataEnabled) {
    console.log("?? Pinata worker disabled (PINATA_ENABLED=false)");
    return;
  }

  console.log(
    `?? Pinata worker started (mode=${queueMode}, batch=${batchSize}, interval=${pollIntervalMs}ms)`
  );
  debugLog("pinata enabled", pinataEnabled, "queue mode", queueMode);

  processBatch().catch((error) => {
    console.error("? Pinata worker initial batch failed:", error);
  });

  if (queueMode === "notify") {
    startNotifyListener();
    if (pollIntervalMs > 0) {
      setInterval(processBatch, pollIntervalMs);
    }
    return;
  }

  if (pollIntervalMs > 0) {
    setInterval(processBatch, pollIntervalMs);
  }
}

async function startNotifyListener() {
  try {
    listenerClient = await pool.connect();
    await listenerClient.query("LISTEN pinata_jobs");
    listenerClient.on("notification", () => {
      debugLog("notify received");
      processBatch().catch((error) => {
        console.error("? Pinata worker notify batch failed:", error);
      });
    });
    listenerClient.on("error", (error) => {
      console.error("? Pinata worker notify listener error:", error);
    });
  } catch (error) {
    console.error("? Failed to start pinata notify listener:", error);
  }
}

async function shutdown(signal) {
  console.log(`?? Pinata worker received ${signal}, shutting down...`);
  if (listenerClient) {
    listenerClient.release();
    listenerClient = null;
  }
  await pool.end();
  process.exit(0);
}

process.on("SIGINT", () => shutdown("SIGINT"));
process.on("SIGTERM", () => shutdown("SIGTERM"));

startWorker();
