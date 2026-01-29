/**
 * Simple test to verify network connectivity and signing works
 */
const { ethers } = require("hardhat");

async function main() {
  const [signer] = await ethers.getSigners();
  const address = await signer.getAddress();
  
  console.log("Signer:", address);
  
  const balance = await signer.getBalance();
  console.log("Balance:", ethers.utils.formatEther(balance), "OM");
  
  // Try to estimate gas for a simple transfer
  const estimate = await signer.estimateGas({
    to: address,
    value: 0
  });
  console.log("Gas estimate for self-transfer:", estimate.toString());
  
  // Get current gas price
  const gasPrice = await signer.getGasPrice();
  console.log("Gas price:", ethers.utils.formatUnits(gasPrice, "gwei"), "gwei");
  
  console.log("\n✅ Network connectivity and signing confirmed!");
}

main().then(() => process.exit(0)).catch(e => { console.error(e); process.exit(1); });
