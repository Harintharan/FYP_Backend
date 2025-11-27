const hre = require("hardhat");

async function main() {
  console.log("Deploying ConditionBreachRegistry...");

  const ConditionBreachRegistry = await hre.ethers.getContractFactory(
    "ConditionBreachRegistry"
  );
  const conditionBreachRegistry = await ConditionBreachRegistry.deploy();

  await conditionBreachRegistry.waitForDeployment();

  const address = await conditionBreachRegistry.getAddress();

  console.log("✅ ConditionBreachRegistry deployed to:", address);

  return address;
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
