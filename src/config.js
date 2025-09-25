import dotenv from "dotenv";

dotenv.config();

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
  REGISTRY_ADDRESS: process.env.REGISTRY_ADDRESS,
};

const required = [
  "PORT",
  "JWT_PRIVATE_KEY",
  "JWT_PUBLIC_KEY",
  "CHAIN_RPC_URL",
  "CHAIN_PRIVATE_KEY",
  "REGISTRY_ADDRESS",
];

const missing = required.filter((key) => !baseEnvVars[key] || baseEnvVars[key].trim() === "");
if (missing.length) {
  throw new Error(`Missing required environment variables: ${missing.join(", ")}`);
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
    return value.trim();
  });
}

if (!connectionString || connectionString.trim() === "") {
  const segments = [baseEnvVars.DB_USER, baseEnvVars.DB_PASSWORD, baseEnvVars.DB_HOST, baseEnvVars.DB_PORT, baseEnvVars.DB_NAME];
  const allPresent = segments.every((v) => v && v.trim() !== "");
  if (!allPresent) {
    throw new Error("DATABASE_URL or DB_USER/DB_PASSWORD/DB_HOST/DB_PORT/DB_NAME must be provided");
  }
  connectionString = `postgres://${encodeURIComponent(baseEnvVars.DB_USER)}:${encodeURIComponent(baseEnvVars.DB_PASSWORD)}@${baseEnvVars.DB_HOST}:${baseEnvVars.DB_PORT}/${baseEnvVars.DB_NAME}`;
}

const privateKey = baseEnvVars.CHAIN_PRIVATE_KEY.trim();
if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey)) {
  throw new Error("CHAIN_PRIVATE_KEY must be a 0x-prefixed 32-byte hex string");
}

const registryAddress = baseEnvVars.REGISTRY_ADDRESS.trim();
if (!/^0x[0-9a-fA-F]{40}$/.test(registryAddress)) {
  throw new Error("REGISTRY_ADDRESS must be a valid 0x-prefixed address");
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
