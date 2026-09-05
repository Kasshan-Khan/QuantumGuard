const hre = require("hardhat");

async function main() {
  console.log("Deploying SignatureRegistry...");
  
  const SignatureRegistry = await hre.ethers.getContractFactory("SignatureRegistry");
  const registry = await SignatureRegistry.deploy();

  await registry.waitForDeployment();

  console.log(`SignatureRegistry deployed to: ${await registry.getAddress()}`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});