import PinataClient from "@pinata/sdk";
import { pinata as pinataConfig } from "../config.js";

function buildCredentials(config) {
  if (config.jwtKey) {
    return { pinataJWTKey: config.jwtKey };
  }

  return {
    pinataApiKey: config.apiKey,
    pinataSecretApiKey: config.secretApiKey,
  };
}

const pinataClient = new PinataClient(buildCredentials(pinataConfig));

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
  const incomingMetadata = (pinataOptions.pinataMetadata || {});
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

  const finalOptions = {
    ...pinataOptions,
    pinataMetadata: mergedMetadata,
  };

  return pinataClient.pinJSONToIPFS(payload, finalOptions);
}

export function getPinataClient() {
  return pinataClient;
}
