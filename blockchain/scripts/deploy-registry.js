const hre = require("hardhat");

async function main() {
  const RegistryFactory = await hre.ethers.getContractFactory("RegistrationRegistry");
  const registry = await RegistryFactory.deploy();
  await registry.waitForDeployment();

  const address = await registry.getAddress();
  console.log("RegistrationRegistry deployed to:", address);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
