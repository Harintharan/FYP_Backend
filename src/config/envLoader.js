import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

export function loadEnvironment(rootDir = process.cwd()) {
  const defaultEnvPath = path.resolve(rootDir, ".env");

  if (fs.existsSync(defaultEnvPath)) {
    dotenv.config({ path: defaultEnvPath });
  } else {
    dotenv.config();
  }

  const envTarget = process.env.ENV_TARGET?.trim();
  if (!envTarget) {
    return;
  }

  const targetPath = path.resolve(rootDir, `.env.${envTarget}`);
  if (!fs.existsSync(targetPath)) {
    throw new Error(
      `ENV_TARGET is set to "${envTarget}" but ${targetPath} does not exist`
    );
  }

  dotenv.config({ path: targetPath, override: true });
}

