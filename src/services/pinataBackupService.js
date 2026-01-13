import { PinataSDK } from "pinata";
import { setGlobalDispatcher, ProxyAgent } from "undici";
import { pinata as pinataConfig, pinataEnabled } from "../config.js";

const pinata = createPinataClient(pinataConfig);

function createPinataClient(config) {
  if (!config || config.enabled === false) {
    return null;
  }
  configureProxy(config);
  ensureJwt(config.jwtKey);
  return new PinataSDK({ pinataJwt: config.jwtKey });
}

function configureProxy(config) {
  if (!config || config.enabled === false) {
    return;
  }
  if (config.useProxy && config.proxyUrl) {
    setGlobalDispatcher(new ProxyAgent(config.proxyUrl));
    console.log(`🌐 Pinata proxy enabled: ${config.proxyUrl}`);
    return;
  }

  if (config.proxyUrl && !config.useProxy) {
    console.log(`🚫 Pinata proxy disabled by configuration: ${config.proxyUrl}`);
  } else {
    console.log("🌍 Pinata configured for direct connection");
  }
}

function ensureJwt(jwtKey) {
  if (pinataEnabled && !jwtKey) {
    throw new Error("PINATA_JWT_KEY is required to use Pinata");
  }
}

function resolveIdentifier(entity, record, explicitId) {
  if (explicitId !== undefined && explicitId !== null) {
    return explicitId;
  }

  if (!record || typeof record !== "object") {
    return null;
  }

  if (record.id !== undefined && record.id !== null) {
    return record.id;
  }

  const candidates = [
    `${entity}_id`,
    `${entity}Id`,
    `${entity}_uuid`,
    `${entity}UUID`,
  ];

  return candidates
    .map((key) => record[key])
    .find((value) => value !== undefined && value !== null) ?? null;
}

function buildPayload({ entity, operation, identifier, record }) {
  return {
    entity,
    operation,
    identifier,
    record,
    backupTimestamp: new Date().toISOString(),
  };
}

function buildMetadata({ entity, operation, identifier }, metadata = {}, pinataOptions = {}) {
  const provided = metadata ?? {};
  const providedKeyvalues = provided.keyvalues ?? {};
  const incomingMetadata = pinataOptions.pinataMetadata ?? {};
  const incomingKeyvalues = incomingMetadata.keyvalues ?? {};

  const keyvalues = {
    entity,
    operation,
    ...incomingKeyvalues,
    ...providedKeyvalues,
  };

  if (identifier !== null && identifier !== undefined) {
    keyvalues.identifier = String(identifier);
  }

  return {
    name:
      provided.name ??
      incomingMetadata.name ??
      `${entity}-${operation}-${identifier ?? Date.now()}`,
    keyvalues,
  };
}

export async function backupRecord(entity, record, options = {}) {
  assertEntity(entity);
  assertRecord(record);
  if (!pinata) {
    throw new Error("Pinata is disabled");
  }

  const {
    operation = "create",
    identifier,
    metadata,
    pinataOptions,
  } = options;

  const resolvedIdentifier = resolveIdentifier(entity, record, identifier);
  const payload = buildPayload({ entity, operation, identifier: resolvedIdentifier, record });
  const finalMetadata = buildMetadata(
    { entity, operation, identifier: resolvedIdentifier },
    metadata,
    pinataOptions
  );

  const file = new File(
    [JSON.stringify(payload, null, 2)],
    `${finalMetadata.name}.json`,
    { type: "application/json" }
  );

  try {
    console.log(`📤 Uploading ${finalMetadata.name} to Pinata`);

    const upload = await pinata.upload.file(file).addMetadata({
      name: finalMetadata.name,
      keyValues: finalMetadata.keyvalues,
    });

    console.log(`✅ Pinata upload successful: ${upload.cid}`);

    return {
      IpfsHash: upload.cid,
      PinSize: upload.size,
      Timestamp: upload.created_at,
      id: upload.id,
      ...upload,
    };
  } catch (error) {
    logPinataFailure(error);
    throw new Error(`Failed to upload to Pinata: ${error.message}`);
  }
}

function assertEntity(entity) {
  if (!entity || typeof entity !== "string") {
    throw new Error("entity is required to back up data to Pinata");
  }
}

function assertRecord(record) {
  if (!record) {
    throw new Error("record is required to back up data to Pinata");
  }
}

function logPinataFailure(error) {
  console.error("❌ Pinata upload failed:", {
    message: error.message,
    stack: error.stack,
    cause: error.cause,
    proxyConfigured: !!pinataConfig?.proxyUrl,
    enabled: pinataEnabled,
  });
}

export function getPinataClient() {
  return pinata;
}

export async function backupRecordSafely({
  entity,
  record,
  walletAddress = null,
  operation = "create",
  identifier,
  metadata,
  pinataOptions,
  errorMessage = "⚠️ Failed to back up record to Pinata:",
}) {
  const payload = {
    ...record,
    walletAddress: walletAddress ?? record?.walletAddress ?? null,
  };

  try {
    return await backupRecord(entity, payload, {
      operation,
      identifier,
      metadata,
      pinataOptions,
    });
  } catch (err) {
    console.error(errorMessage, err);
    return null;
  }
}
