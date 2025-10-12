import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const rootDir = process.cwd();
const defaultEnvPath = path.resolve(rootDir, ".env");

if (fs.existsSync(defaultEnvPath)) {
  dotenv.config({ path: defaultEnvPath });
} else {
  dotenv.config();
}

const envTarget = process.env.ENV_TARGET?.trim();
if (envTarget) {
  const targetPath = path.resolve(rootDir, `.env.${envTarget}`);
  if (!fs.existsSync(targetPath)) {
    throw new Error(
      `ENV_TARGET is set to "${envTarget}" but ${targetPath} does not exist`
    );
  }
  dotenv.config({ path: targetPath, override: true });
}

const baseEnvVars = {
  PORT: process.env.PORT,
  DATABASE_URL: process.env.DATABASE_URL,
  DB_USER: process.env.DB_USER,
  DB_PASSWORD: process.env.DB_PASSWORD,
  DB_HOST: process.env.DB_HOST,
  DB_PORT: process.env.DB_PORT,
  DB_NAME: process.env.DB_NAME,
  JWT_PRIVATE_KEY: process.env.JWT_PRIVATE_KEY,
  JWT_PUBLIC_KEY: process.env.JWT_PUBLIC_KEY,
  CHAIN_RPC_URL: process.env.CHAIN_RPC_URL,
  CHAIN_PRIVATE_KEY: process.env.CHAIN_PRIVATE_KEY,
  CONTRACT_ADDRESS_REGISTRY: process.env.CONTRACT_ADDRESS_REGISTRY,
  PRIVATE_KEY_OTHER: process.env.PRIVATE_KEY_OTHER,
  CONTRACT_ADDRESS_BATCH: process.env.CONTRACT_ADDRESS_BATCH,
  CONTRACT_ADDRESS_CHECKPOINT: process.env.CONTRACT_ADDRESS_CHECKPOINT,
  CONTRACT_ADDRESS_SHIPMENT: process.env.CONTRACT_ADDRESS_SHIPMENT,
  CONTRACT_ADDRESS_SHIPMENT_SEGMENT_ACCEPTANCE:
    process.env.CONTRACT_ADDRESS_SHIPMENT_SEGMENT_ACCEPTANCE,
  CONTRACT_ADDRESS_SHIPMENT_SEGMENT_HANDOVER:
    process.env.CONTRACT_ADDRESS_SHIPMENT_SEGMENT_HANDOVER,
  CONTRACT_ADDRESS_PRODUCT: process.env.CONTRACT_ADDRESS_PRODUCT,
  PINATA_API_KEY: process.env.PINATA_API_KEY,
  PINATA_SECRET_API_KEY: process.env.PINATA_SECRET_API_KEY,
  PINATA_JWT_KEY: process.env.PINATA_JWT_KEY,
  PINATA_JWT: process.env.PINATA_JWT,
  PINATA_PROXY_URL: process.env.PINATA_PROXY_URL,
  PINATA_USE_PROXY: process.env.PINATA_USE_PROXY,
};

const required = [
  "PORT",
  "JWT_PRIVATE_KEY",
  "JWT_PUBLIC_KEY",
  "CHAIN_RPC_URL",
  "CHAIN_PRIVATE_KEY",
  "CONTRACT_ADDRESS_REGISTRY",
  "PRIVATE_KEY_OTHER",
  "CONTRACT_ADDRESS_BATCH",
  "CONTRACT_ADDRESS_CHECKPOINT",
  "CONTRACT_ADDRESS_SHIPMENT",
  "CONTRACT_ADDRESS_SHIPMENT_SEGMENT_ACCEPTANCE",
  "CONTRACT_ADDRESS_SHIPMENT_SEGMENT_HANDOVER",
  "CONTRACT_ADDRESS_PRODUCT",
];

const missing = required.filter(
  (key) => !baseEnvVars[key] || baseEnvVars[key].trim() === ""
);
if (missing.length) {
  throw new Error(
    `Missing required environment variables: ${missing.join(", ")}`
  );
}

const portValue = Number(baseEnvVars.PORT);
if (!Number.isFinite(portValue) || portValue <= 0) {
  throw new Error("PORT must be a positive number");
}

let connectionString = baseEnvVars.DATABASE_URL;
if (connectionString && connectionString.includes("${")) {
  connectionString = connectionString.replace(/\$\{([^}]+)\}/g, (_, key) => {
    const value = baseEnvVars[key];
    if (!value || value.trim() === "") {
      throw new Error(`DATABASE_URL references ${key}, but it is not set`);
    }
    const trimmed = value.trim();
    if (key === "DB_USER" || key === "DB_PASSWORD") {
      return encodeURIComponent(trimmed);
    }
    return trimmed;
  });
}

if (!connectionString || connectionString.trim() === "") {
  const segments = [
    baseEnvVars.DB_USER,
    baseEnvVars.DB_PASSWORD,
    baseEnvVars.DB_HOST,
    baseEnvVars.DB_PORT,
    baseEnvVars.DB_NAME,
  ];
  const allPresent = segments.every((v) => v && v.trim() !== "");
  if (!allPresent) {
    throw new Error(
      "DATABASE_URL or DB_USER/DB_PASSWORD/DB_HOST/DB_PORT/DB_NAME must be provided"
    );
  }
  connectionString = `postgres://${encodeURIComponent(
    baseEnvVars.DB_USER
  )}:${encodeURIComponent(baseEnvVars.DB_PASSWORD)}@${baseEnvVars.DB_HOST}:${
    baseEnvVars.DB_PORT
  }/${baseEnvVars.DB_NAME}`;
}

function assertHex(value, key, regex, message) {
  if (!value) {
    throw new Error(`${key} is required`);
  }
  const trimmed = value.trim();
  if (!regex.test(trimmed)) {
    throw new Error(message);
  }
  return trimmed;
}

const privateKey = assertHex(
  baseEnvVars.CHAIN_PRIVATE_KEY,
  "CHAIN_PRIVATE_KEY",
  /^0x[0-9a-fA-F]{64}$/,
  "CHAIN_PRIVATE_KEY must be a 0x-prefixed 32-byte hex string"
);

const registryAddress = assertHex(
  baseEnvVars.CONTRACT_ADDRESS_REGISTRY,
  "CONTRACT_ADDRESS_REGISTRY",
  /^0x[0-9a-fA-F]{40}$/,
  "CONTRACT_ADDRESS_REGISTRY must be a valid 0x-prefixed address"
);

const operatorPrivateKey = assertHex(
  baseEnvVars.PRIVATE_KEY_OTHER,
  "PRIVATE_KEY_OTHER",
  /^0x[0-9a-fA-F]{64}$/,
  "PRIVATE_KEY_OTHER must be a 0x-prefixed 32-byte hex string"
);

const contractAddresses = {
  batchRegistry: assertHex(
    baseEnvVars.CONTRACT_ADDRESS_BATCH,
    "CONTRACT_ADDRESS_BATCH",
    /^0x[0-9a-fA-F]{40}$/,
    "CONTRACT_ADDRESS_BATCH must be a valid 0x-prefixed address"
  ),
  checkpointRegistry: assertHex(
    baseEnvVars.CONTRACT_ADDRESS_CHECKPOINT,
    "CONTRACT_ADDRESS_CHECKPOINT",
    /^0x[0-9a-fA-F]{40}$/,
    "CONTRACT_ADDRESS_CHECKPOINT must be a valid 0x-prefixed address"
  ),
  shipmentRegistry: assertHex(
    baseEnvVars.CONTRACT_ADDRESS_SHIPMENT,
    "CONTRACT_ADDRESS_SHIPMENT",
    /^0x[0-9a-fA-F]{40}$/,
    "CONTRACT_ADDRESS_SHIPMENT must be a valid 0x-prefixed address"
  ),
  segmentAcceptance: assertHex(
    baseEnvVars.CONTRACT_ADDRESS_SHIPMENT_SEGMENT_ACCEPTANCE,
    "CONTRACT_ADDRESS_SHIPMENT_SEGMENT_ACCEPTANCE",
    /^0x[0-9a-fA-F]{40}$/,
    "CONTRACT_ADDRESS_SHIPMENT_SEGMENT_ACCEPTANCE must be a valid 0x-prefixed address"
  ),
  segmentHandover: assertHex(
    baseEnvVars.CONTRACT_ADDRESS_SHIPMENT_SEGMENT_HANDOVER,
    "CONTRACT_ADDRESS_SHIPMENT_SEGMENT_HANDOVER",
    /^0x[0-9a-fA-F]{40}$/,
    "CONTRACT_ADDRESS_SHIPMENT_SEGMENT_HANDOVER must be a valid 0x-prefixed address"
  ),
  productRegistry: assertHex(
    baseEnvVars.CONTRACT_ADDRESS_PRODUCT,
    "CONTRACT_ADDRESS_PRODUCT",
    /^0x[0-9a-fA-F]{40}$/,
    "CONTRACT_ADDRESS_PRODUCT must be a valid 0x-prefixed address"
  ),
};

const pinataApiKey = baseEnvVars.PINATA_API_KEY
  ? baseEnvVars.PINATA_API_KEY.trim()
  : "";
const pinataSecretApiKey = baseEnvVars.PINATA_SECRET_API_KEY
  ? baseEnvVars.PINATA_SECRET_API_KEY.trim()
  : "";
const pinataJwtKey = (() => {
  const jwtKey = baseEnvVars.PINATA_JWT_KEY || baseEnvVars.PINATA_JWT;
  return jwtKey ? jwtKey.trim() : "";
})();

if (!pinataJwtKey) {
  throw new Error(
    "PINATA_JWT_KEY (or PINATA_JWT) is required for the new Pinata SDK"
  );
}

function normalizePem(value) {
  return value.replace(/\\n/g, "\n");
}

export const port = portValue;
export const dbUrl = connectionString;
export const jwtPrivateKey = normalizePem(baseEnvVars.JWT_PRIVATE_KEY);
export const jwtPublicKey = normalizePem(baseEnvVars.JWT_PUBLIC_KEY);

export const chain = {
  rpcUrl: baseEnvVars.CHAIN_RPC_URL,
  privateKey,
  registryAddress,
};

export const operatorWallet = {
  privateKey: operatorPrivateKey,
};

export const contracts = contractAddresses;

export const pinata = {
  apiKey: pinataApiKey || null,
  secretApiKey: pinataSecretApiKey || null,
  jwtKey: pinataJwtKey || null,
  proxyUrl: baseEnvVars.PINATA_PROXY_URL || null,
  useProxy:
    baseEnvVars.PINATA_USE_PROXY === "true" ||
    baseEnvVars.PINATA_USE_PROXY === "1",
};
