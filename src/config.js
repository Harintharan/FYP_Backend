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
} = buildConfig(process.env);

export { host, port, dbUrl, jwtPrivateKey, jwtPublicKey };
export { chain, operatorWallet, contracts, pinata };
export {
  registrationPayloadMaxBytes,
  accessTokenExpiry,
  refreshTokenExpiryDays,
};
