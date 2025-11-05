const hre = require("hardhat");

const CONTRACTS = [
  "RegistrationRegistry",
  "BatchRegistry",
  "ProductRegistry",
  "PackageRegistry",
  "CheckpointRegistry",
  "ShipmentRegistry",
  "ShipmentSegmentRegistry",
  "SensorDataRegistry",
  "SensorDataBreachRegistry",
];

const ENV_OUTPUT_ORDER = [
  ["RegistrationRegistry", "CONTRACT_ADDRESS_REGISTRY"],
  ["BatchRegistry", "CONTRACT_ADDRESS_BATCH"],
  ["ProductRegistry", "CONTRACT_ADDRESS_PRODUCT"],
  ["PackageRegistry", "CONTRACT_ADDRESS_PACKAGE"],
  ["CheckpointRegistry", "CONTRACT_ADDRESS_CHECKPOINT"],
  ["ShipmentRegistry", "CONTRACT_ADDRESS_SHIPMENT"],
  ["ShipmentSegmentRegistry", "CONTRACT_ADDRESS_SHIPMENT_SEGMENT"],
  ["SensorDataRegistry", "CONTRACT_ADDRESS_SENSOR_DATA"],
  ["SensorDataBreachRegistry", "CONTRACT_ADDRESS_SENSOR_DATA_BREACH"],
];

async function deployContract(name) {
  try {
    console.log(`📋 Getting contract factory for ${name}...`);
    const factory = await hre.ethers.getContractFactory(name);
    
    console.log(`🚀 Deploying ${name}...`);
    const contract = await factory.deploy();
    
    console.log(`⏳ Waiting for deployment confirmation...`);
    await contract.waitForDeployment();
    
    const address = await contract.getAddress();
    console.log(`✅ ${name} deployed to: ${address}`);
    
    return { name, address };
  } catch (error) {
    console.error(`❌ Failed to deploy ${name}:`, error.message);
    throw error;
  }
}

async function main() {
  console.log("🏗️  Starting deployment of all contracts...");
  console.log(`📡 Network: ${hre.network.name}`);
  
  const [deployer] = await hre.ethers.getSigners();
  console.log(`👤 Deploying with account: ${deployer.address}`);
  
  const balance = await hre.ethers.provider.getBalance(deployer.address);
  console.log(`💰 Account balance: ${hre.ethers.formatEther(balance)} ETH`);
  
  const deployments = [];
  
  for (const name of CONTRACTS) {
    console.log(`\n� Deploying ${name}...`);
    try {
      const details = await deployContract(name);
      deployments.push(details);
    } catch (error) {
      console.error(`❌ Failed to deploy ${name}:`, error.message);
      process.exit(1);
    }
  }

  const addressByName = deployments.reduce((acc, { name, address }) => {
    acc[name] = address;
    return acc;
  }, {});

  console.log("\n� Deployment Summary:");
  console.log("=" .repeat(60));
  deployments.forEach(({ name, address }) => {
    console.log(`${name.padEnd(25)} : ${address}`);
  });

  console.log("\n�🔑 Environment configuration:");
  console.log("Copy these values to your .env file:");
  console.log("-".repeat(60));
  
  for (const [contractName, envKey] of ENV_OUTPUT_ORDER) {
    const address = addressByName[contractName];
    if (address) {
      console.log(`${envKey}=${address}`);
    } else {
      console.warn(`⚠️  Warning: ${contractName} was not deployed`);
    }
  }
  
  console.log("\n✅ All contracts deployed successfully!");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
