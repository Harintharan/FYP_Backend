const REQUIRED_KEYS = [
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
  "CONTRACT_ADDRESS_PRODUCT",
  "CONTRACT_ADDRESS_PACKAGE",
  // Sensor data contracts deprecated; legacy registry removed
  "CONTRACT_ADDRESS_TELEMETRY_MESSAGE",
  "CONTRACT_ADDRESS_CONDITION_BREACH",
];

const SUPPORTED_KEYS = [
  ...REQUIRED_KEYS,
  "HOST",
  "DATABASE_URL",
  "DB_USER",
  "DB_PASSWORD",
  "DB_HOST",
  "DB_PORT",
  "DB_NAME",
  "CONTRACT_ADDRESS_SHIPMENT_SEGMENT",
  "PINATA_API_KEY",
  "PINATA_SECRET_API_KEY",
  "PINATA_JWT_KEY",
  "PINATA_JWT",
  "PINATA_PROXY_URL",
  "PINATA_USE_PROXY",
  "DEFAULT_MAX_PAYLOAD_BYTES",
  "ACCESS_TOKEN_EXPIRY",
  "REFRESH_TOKEN_EXPIRY_DAYS",
];

const ADDRESS_40_REGEX = /^0x[0-9a-fA-F]{40}$/;
const PRIVATE_KEY_REGEX = /^0x[0-9a-fA-F]{64}$/;

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

function resolveDatabaseConnection(baseEnvVars) {
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

  if (connectionString && connectionString.trim() !== "") {
    return connectionString;
  }

  const segments = [
    baseEnvVars.DB_USER,
    baseEnvVars.DB_PASSWORD,
    baseEnvVars.DB_HOST,
    baseEnvVars.DB_PORT,
    baseEnvVars.DB_NAME,
  ];

  const allPresent = segments.every(
    (segment) => segment && segment.trim() !== ""
  );
  if (!allPresent) {
    throw new Error(
      "DATABASE_URL or DB_USER/DB_PASSWORD/DB_HOST/DB_PORT/DB_NAME must be provided"
    );
  }

  return `postgres://${encodeURIComponent(
    baseEnvVars.DB_USER
  )}:${encodeURIComponent(baseEnvVars.DB_PASSWORD)}@${baseEnvVars.DB_HOST}:${
    baseEnvVars.DB_PORT
  }/${baseEnvVars.DB_NAME}`;
}

function resolveShipmentSegmentAddress(baseEnvVars) {
  const address = baseEnvVars.CONTRACT_ADDRESS_SHIPMENT_SEGMENT;
  if (!address || address.trim() === "") {
    throw new Error(
      "Missing required environment variable: CONTRACT_ADDRESS_SHIPMENT_SEGMENT"
    );
  }
  return address.trim();
}

function normalizePem(value) {
  return value.replace(/\\n/g, "\n");
}

function toBaseEnvVars(env) {
  return SUPPORTED_KEYS.reduce((acc, key) => {
    acc[key] = env[key];
    return acc;
  }, {});
}

function ensureRequired(baseEnvVars) {
  const missing = REQUIRED_KEYS.filter((key) => {
    const value = baseEnvVars[key];
    return !value || value.trim() === "";
  });

  if (missing.length) {
    throw new Error(
      `Missing required environment variables: ${missing.join(", ")}`
    );
  }
}

function resolvePort(baseEnvVars) {
  const portValue = Number(baseEnvVars.PORT);
  if (!Number.isFinite(portValue) || portValue <= 0) {
    throw new Error("PORT must be a positive number");
  }
  return portValue;
}

function resolveHost(baseEnvVars) {
  const hostValue = baseEnvVars.HOST ? baseEnvVars.HOST.trim() : "";
  return hostValue !== "" ? hostValue : "0.0.0.0";
}

function resolvePinataConfig(baseEnvVars) {
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

  return {
    apiKey: pinataApiKey || null,
    secretApiKey: pinataSecretApiKey || null,
    jwtKey: pinataJwtKey || null,
    proxyUrl: baseEnvVars.PINATA_PROXY_URL || null,
    useProxy:
      baseEnvVars.PINATA_USE_PROXY === "true" ||
      baseEnvVars.PINATA_USE_PROXY === "1",
  };
}

function resolveRegistrationPayloadLimit(baseEnvVars) {
  const parsed = baseEnvVars.DEFAULT_MAX_PAYLOAD_BYTES
    ? Number.parseInt(baseEnvVars.DEFAULT_MAX_PAYLOAD_BYTES, 10)
    : Number.NaN;

  return Number.isFinite(parsed) && parsed > 0 ? parsed : 8192;
}

function resolveAccessTokenExpiry(baseEnvVars) {
  const value = baseEnvVars.ACCESS_TOKEN_EXPIRY;
  return value && value.trim() !== "" ? value.trim() : "24h";
}

function resolveRefreshTokenExpiryDays(baseEnvVars) {
  const parsed = baseEnvVars.REFRESH_TOKEN_EXPIRY_DAYS
    ? Number.parseInt(baseEnvVars.REFRESH_TOKEN_EXPIRY_DAYS, 10)
    : Number.NaN;
  return Number.isFinite(parsed) && parsed > 0 ? parsed : 7;
}

export function buildConfig(env) {
  const baseEnvVars = toBaseEnvVars(env);

  ensureRequired(baseEnvVars);

  const port = resolvePort(baseEnvVars);
  const host = resolveHost(baseEnvVars);
  const dbUrl = resolveDatabaseConnection(baseEnvVars);

  const privateKey = assertHex(
    baseEnvVars.CHAIN_PRIVATE_KEY,
    "CHAIN_PRIVATE_KEY",
    PRIVATE_KEY_REGEX,
    "CHAIN_PRIVATE_KEY must be a 0x-prefixed 32-byte hex string"
  );

  const registryAddress = assertHex(
    baseEnvVars.CONTRACT_ADDRESS_REGISTRY,
    "CONTRACT_ADDRESS_REGISTRY",
    ADDRESS_40_REGEX,
    "CONTRACT_ADDRESS_REGISTRY must be a valid 0x-prefixed address"
  );

  const operatorPrivateKey = assertHex(
    baseEnvVars.PRIVATE_KEY_OTHER,
    "PRIVATE_KEY_OTHER",
    PRIVATE_KEY_REGEX,
    "PRIVATE_KEY_OTHER must be a 0x-prefixed 32-byte hex string"
  );

  const contractAddresses = {
    batchRegistry: assertHex(
      baseEnvVars.CONTRACT_ADDRESS_BATCH,
      "CONTRACT_ADDRESS_BATCH",
      ADDRESS_40_REGEX,
      "CONTRACT_ADDRESS_BATCH must be a valid 0x-prefixed address"
    ),
    checkpointRegistry: assertHex(
      baseEnvVars.CONTRACT_ADDRESS_CHECKPOINT,
      "CONTRACT_ADDRESS_CHECKPOINT",
      ADDRESS_40_REGEX,
      "CONTRACT_ADDRESS_CHECKPOINT must be a valid 0x-prefixed address"
    ),
    shipmentRegistry: assertHex(
      baseEnvVars.CONTRACT_ADDRESS_SHIPMENT,
      "CONTRACT_ADDRESS_SHIPMENT",
      ADDRESS_40_REGEX,
      "CONTRACT_ADDRESS_SHIPMENT must be a valid 0x-prefixed address"
    ),
    shipmentSegment: assertHex(
      resolveShipmentSegmentAddress(baseEnvVars),
      "CONTRACT_ADDRESS_SHIPMENT_SEGMENT",
      ADDRESS_40_REGEX,
      "CONTRACT_ADDRESS_SHIPMENT_SEGMENT must be a valid 0x-prefixed address"
    ),
    productRegistry: assertHex(
      baseEnvVars.CONTRACT_ADDRESS_PRODUCT,
      "CONTRACT_ADDRESS_PRODUCT",
      ADDRESS_40_REGEX,
      "CONTRACT_ADDRESS_PRODUCT must be a valid 0x-prefixed address"
    ),
    packageRegistry: assertHex(
      baseEnvVars.CONTRACT_ADDRESS_PACKAGE,
      "CONTRACT_ADDRESS_PACKAGE",
      ADDRESS_40_REGEX,
      "CONTRACT_ADDRESS_PACKAGE must be a valid 0x-prefixed address"
    ),
    // sensorDataRegistry and sensorDataBreachRegistry removed
    telemetryMessageRegistry: assertHex(
      baseEnvVars.CONTRACT_ADDRESS_TELEMETRY_MESSAGE,
      "CONTRACT_ADDRESS_TELEMETRY_MESSAGE",
      ADDRESS_40_REGEX,
      "CONTRACT_ADDRESS_TELEMETRY_MESSAGE must be a valid 0x-prefixed address"
    ),
    conditionBreachRegistry: assertHex(
      baseEnvVars.CONTRACT_ADDRESS_CONDITION_BREACH,
      "CONTRACT_ADDRESS_CONDITION_BREACH",
      ADDRESS_40_REGEX,
      "CONTRACT_ADDRESS_CONDITION_BREACH must be a valid 0x-prefixed address"
    ),
  };

  return {
    host,
    port,
    dbUrl,
    jwtPrivateKey: normalizePem(baseEnvVars.JWT_PRIVATE_KEY),
    jwtPublicKey: normalizePem(baseEnvVars.JWT_PUBLIC_KEY),
    chain: {
      rpcUrl: baseEnvVars.CHAIN_RPC_URL,
      privateKey,
      registryAddress,
    },
    operatorWallet: {
      privateKey: operatorPrivateKey,
    },
    contracts: contractAddresses,
    pinata: resolvePinataConfig(baseEnvVars),
    registrationPayloadMaxBytes: resolveRegistrationPayloadLimit(baseEnvVars),
    accessTokenExpiry: resolveAccessTokenExpiry(baseEnvVars),
    refreshTokenExpiryDays: resolveRefreshTokenExpiryDays(baseEnvVars),
  };
}
