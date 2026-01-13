import { loadEnvironment } from "./config/envLoader.js";
import { buildConfig } from "./config/buildConfig.js";

loadEnvironment();

const {
  host,
  port,
  dbUrl,
  jwtPrivateKey,
  jwtPublicKey,
  chain,
  operatorWallet,
  contracts,
  pinata,
  registrationPayloadMaxBytes,
  accessTokenExpiry,
  refreshTokenExpiryDays,
  checkpointRangeKm,
} = buildConfig(process.env);

const pinataEnabled = pinata?.enabled !== false;

export { host, port, dbUrl, jwtPrivateKey, jwtPublicKey };
export { chain, operatorWallet, contracts, pinata, pinataEnabled };
export {
  registrationPayloadMaxBytes,
  accessTokenExpiry,
  refreshTokenExpiryDays,
  checkpointRangeKm,
};
