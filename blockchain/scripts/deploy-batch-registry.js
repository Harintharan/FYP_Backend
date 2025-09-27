const hre = require("hardhat");

async function main() {
  const factory = await hre.ethers.getContractFactory("BatchRegistry");
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  console.log("BatchRegistry deployed to:", await contract.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
