const { ethers } = require("hardhat");

async function main() {
  const [signer] = await ethers.getSigners();
  const address = await signer.getAddress();
  const balance = await signer.getBalance();

  console.log("=== Wallet Information ===");
  console.log("Address:", address);
  console.log("Balance:", ethers.utils.formatEther(balance), "OM");

  const network = await signer.provider.getNetwork();
  console.log("\n=== Network Information ===");
  console.log("Chain ID:", network.chainId);
  console.log("Network Name:", network.name);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
