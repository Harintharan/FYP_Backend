const hre = require("hardhat");

async function main() {
  const factory = await hre.ethers.getContractFactory("RegistrationRegistry");
  const contract = await factory.deploy();
  await contract.waitForDeployment();

  console.log("RegistrationRegistry deployed to:", await contract.getAddress());
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
