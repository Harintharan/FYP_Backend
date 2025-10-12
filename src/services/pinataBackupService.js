import { PinataSDK } from "pinata";
import { HttpsProxyAgent } from "https-proxy-agent";
import { setGlobalDispatcher, ProxyAgent } from "undici";
import { pinata as pinataConfig } from "../config.js";

// Configure global dispatcher with proxy if needed
if (pinataConfig.useProxy && pinataConfig.proxyUrl) {
  const proxyAgent = new ProxyAgent(pinataConfig.proxyUrl);
  setGlobalDispatcher(proxyAgent);
  console.log(`🌐 Configured Pinata to use proxy: ${pinataConfig.proxyUrl}`);
} else if (pinataConfig.proxyUrl && !pinataConfig.useProxy) {
  console.log(`🚫 Proxy available but disabled: ${pinataConfig.proxyUrl}`);
} else {
  console.log(`🌍 Pinata configured for direct connection (no proxy)`);
}

function buildPinataConfig(config) {
  const pinataConfig = {};

  if (config.jwtKey) {
    pinataConfig.pinataJwt = config.jwtKey;
  }

  // Note: The new SDK primarily uses JWT authentication
  // If you need to use API keys, you might need to handle them differently

  return pinataConfig;
}

const pinataClient = new PinataSDK(buildPinataConfig(pinataConfig));

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

  for (const key of candidates) {
    if (record[key] !== undefined && record[key] !== null) {
      return record[key];
    }
  }

  return null;
}

export async function backupRecord(entity, record, options = {}) {
  if (!entity || typeof entity !== "string") {
    throw new Error("entity is required to back up data to Pinata");
  }

  if (!record) {
    throw new Error("record is required to back up data to Pinata");
  }

  const {
    operation = "create",
    identifier,
    metadata = {},
    pinataOptions = {},
  } = options;

  const resolvedIdentifier = resolveIdentifier(entity, record, identifier);

  const payload = {
    entity,
    operation,
    identifier: resolvedIdentifier,
    record,
    backupTimestamp: new Date().toISOString(),
  };

  const providedMetadata = metadata || {};
  const providedKeyvalues = providedMetadata.keyvalues || {};
  const incomingMetadata = pinataOptions.pinataMetadata || {};
  const incomingKeyvalues = incomingMetadata.keyvalues || {};

  const mergedKeyvalues = {
    entity,
    operation,
    ...incomingKeyvalues,
    ...providedKeyvalues,
  };

  if (resolvedIdentifier !== null && resolvedIdentifier !== undefined) {
    mergedKeyvalues.identifier = String(resolvedIdentifier);
  }

  const mergedMetadata = {
    name:
      providedMetadata.name ||
      incomingMetadata.name ||
      `${entity}-${operation}-${resolvedIdentifier ?? Date.now()}`,
    keyvalues: mergedKeyvalues,
  };

  // Create a JSON file from the payload
  const jsonString = JSON.stringify(payload, null, 2);
  const file = new File([jsonString], mergedMetadata.name + ".json", {
    type: "application/json",
  });

  // Upload using the new SDK
  try {
    console.log(`📤 Attempting to upload to Pinata: ${mergedMetadata.name}`);

    const upload = await pinataClient.upload.file(file).addMetadata({
      name: mergedMetadata.name,
      keyValues: mergedKeyvalues,
    });

    console.log(`✅ Successfully uploaded to Pinata: ${upload.cid}`);

    // Return in similar format to the old SDK
    return {
      IpfsHash: upload.cid,
      PinSize: upload.size,
      Timestamp: upload.created_at,
      id: upload.id,
      ...upload,
    };
  } catch (error) {
    console.error(`❌ Pinata upload failed:`, {
      message: error.message,
      stack: error.stack,
      cause: error.cause,
      proxyConfigured: !!pinataConfig.proxyUrl,
    });
    throw new Error(`Failed to upload to Pinata: ${error.message}`);
  }
}

export function getPinataClient() {
  return pinataClient;
}
