#!/usr/bin/env node

import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const ENV_FILES = {
  proxy: ".env.ganache",
  noproxy: ".env.ganache.noproxy",
};

function showUsage() {
  console.log(`
🔧 Pinata Proxy Toggle Utility

Usage:
  node scripts/toggle-proxy.js [command]

Commands:
  on      - Enable proxy mode (copy .env.ganache.noproxy to .env.ganache and set PINATA_USE_PROXY=true)
  off     - Disable proxy mode (set PINATA_USE_PROXY=false in .env.ganache)
  status  - Show current proxy status
  help    - Show this help message

Examples:
  node scripts/toggle-proxy.js on
  node scripts/toggle-proxy.js off
  node scripts/toggle-proxy.js status
`);
}

function getCurrentStatus() {
  const envFile = path.join(__dirname, "..", ENV_FILES.proxy);

  if (!fs.existsSync(envFile)) {
    return { exists: false };
  }

  const content = fs.readFileSync(envFile, "utf-8");
  const useProxyMatch = content.match(/PINATA_USE_PROXY=(.+)/);
  const proxyUrlMatch = content.match(/PINATA_PROXY_URL=(.+)/);

  return {
    exists: true,
    useProxy: useProxyMatch ? useProxyMatch[1].trim() === "true" : false,
    proxyUrl: proxyUrlMatch ? proxyUrlMatch[1].trim() : null,
  };
}

function toggleProxy(enable) {
  const envFile = path.join(__dirname, "..", ENV_FILES.proxy);

  if (!fs.existsSync(envFile)) {
    console.error(`❌ Environment file not found: ${ENV_FILES.proxy}`);
    return;
  }

  let content = fs.readFileSync(envFile, "utf-8");

  // Update PINATA_USE_PROXY setting
  if (content.includes("PINATA_USE_PROXY=")) {
    content = content.replace(
      /PINATA_USE_PROXY=.+/,
      `PINATA_USE_PROXY=${enable}`
    );
  } else {
    // Add the setting if it doesn't exist
    content += `\nPINATA_USE_PROXY=${enable}`;
  }

  fs.writeFileSync(envFile, content);

  const status = enable ? "enabled" : "disabled";
  console.log(`✅ Proxy ${status} in ${ENV_FILES.proxy}`);
}

function showStatus() {
  const status = getCurrentStatus();

  if (!status.exists) {
    console.log(`❌ Environment file not found: ${ENV_FILES.proxy}`);
    return;
  }

  console.log(`
📊 Current Proxy Status:
  Proxy Enabled: ${status.useProxy ? "✅ YES" : "❌ NO"}
  Proxy URL: ${status.proxyUrl || "Not set"}
  
🔗 Available NPM Scripts:
  npm run dev:proxy    - Run with proxy enabled
  npm run dev:noproxy  - Run without proxy
  npm run start:proxy  - Start with proxy enabled
  npm run start:noproxy- Start without proxy
`);
}

// Main execution
const command = process.argv[2];

switch (command) {
  case "on":
    toggleProxy(true);
    showStatus();
    break;
  case "off":
    toggleProxy(false);
    showStatus();
    break;
  case "status":
    showStatus();
    break;
  case "help":
  case "--help":
  case "-h":
    showUsage();
    break;
  default:
    console.log('❌ Invalid command. Use "help" to see available commands.');
    showUsage();
    process.exit(1);
}
