const hre = require("hardhat");

async function main() {
  console.log("Deploying TelemetryMessageRegistry...");

  const TelemetryMessageRegistry = await hre.ethers.getContractFactory(
    "TelemetryMessageRegistry"
  );
  const telemetryMessageRegistry = await TelemetryMessageRegistry.deploy();

  await telemetryMessageRegistry.waitForDeployment();

  const address = await telemetryMessageRegistry.getAddress();

  console.log("✅ TelemetryMessageRegistry deployed to:", address);

  return address;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
