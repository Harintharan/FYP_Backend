const hre = require("hardhat");

async function main() {
  const SupplyChain = await hre.ethers.getContractFactory("ShipmentSegmentHandover");
  const contract = await SupplyChain.deploy();

  // In ethers v6:
  await contract.waitForDeployment();

  console.log("✅ SupplyChain deployed to:", await contract.getAddress());
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
