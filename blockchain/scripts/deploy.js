const hre = require("hardhat");

const CONTRACTS = [
  "RegistrationRegistry",
  "BatchRegistry",
  "ProductRegistry",
  "PackageRegistry",
  "CheckpointRegistry",
  "ShipmentRegistry",
  "ShipmentSegmentRegistry",
];

const ENV_OUTPUT_ORDER = [
  ["RegistrationRegistry", "CONTRACT_ADDRESS_REGISTRY"],
  ["BatchRegistry", "CONTRACT_ADDRESS_BATCH"],
  ["ProductRegistry", "CONTRACT_ADDRESS_PRODUCT"],
  ["PackageRegistry", "CONTRACT_ADDRESS_PACKAGE"],
  ["CheckpointRegistry", "CONTRACT_ADDRESS_CHECKPOINT"],
  ["ShipmentRegistry", "CONTRACT_ADDRESS_SHIPMENT"],
  ["ShipmentSegmentRegistry", "CONTRACT_ADDRESS_SHIPMENT_SEGMENT"],
];

async function deployContract(name) {
  const factory = await hre.ethers.getContractFactory(name);
  const contract = await factory.deploy();
  await contract.waitForDeployment();
  const address = await contract.getAddress();
  console.log(`${name} deployed to: ${address}`);
  return { name, address };
}

async function main() {
  const deployments = [];
  for (const name of CONTRACTS) {
    console.log(`\n🚀 Deploying ${name}...`);
    const details = await deployContract(name);
    deployments.push(details);
  }

  const addressByName = deployments.reduce((acc, { name, address }) => {
    acc[name] = address;
    return acc;
  }, {});

  console.log("\n🔑 Environment configuration:");
  for (const [contractName, envKey] of ENV_OUTPUT_ORDER) {
    const address = addressByName[contractName];
    if (address) {
      console.log(`${envKey}=${address}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
