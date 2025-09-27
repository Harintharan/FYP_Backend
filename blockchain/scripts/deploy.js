const hre = require("hardhat");

const CONTRACTS = [
  "BatchRegistry",
  "CheckpointRegistry",
  "ProductRegistry",
  "RegistrationRegistry",
  "ShipmentRegistry",
  "ShipmentSegmentAcceptance",
  "ShipmentSegmentHandover",
  "SupplyChain",
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

  console.log("\n✅ Deployment summary:");
  for (const { name, address } of deployments) {
    console.log(`  • ${name}: ${address}`);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
