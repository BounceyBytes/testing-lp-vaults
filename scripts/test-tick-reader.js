const { ethers } = require("hardhat");
const config = require("../testnet-config.json");
const TickReader = require("./utils/TickReader");

async function main() {
  console.log("🧪 Testing Resilient Tick Reader");
  console.log("================================");

  const [signer] = await ethers.getSigners();
  const reader = new TickReader(signer);

  const vaults = [
    { name: "Vault 1 (QuickSwap USDC-USDT)", address: config.vaults.vault1 },
    { name: "Vault 2 (Lotus WETH-USDT)", address: config.vaults.vault2 },
    { name: "Vault 3 (Lotus WBTC-USDC)", address: config.vaults.vault3 },
    { name: "Vault 4 (Lotus USDC-USDT)", address: config.vaults.vault4 }
  ];

  let successCount = 0;

  for (const vaultInfo of vaults) {
    console.log(`\nChecking ${vaultInfo.name} at ${vaultInfo.address}...`);
    try {
      const result = await reader.getTickRange(vaultInfo.address);
      if (result) {
        console.log(`  ✅ Success!`);
        console.log(`     Method: ${result.method}`);
        console.log(`     Range: [${result.tickLower}, ${result.tickUpper}]`);
        console.log(`     Width: ${result.tickUpper - result.tickLower} ticks`);
        successCount++;
      } else {
        console.log(`  ❌ Failed to detect range.`);
      }
    } catch (e) {
      console.log(`  ❌ Error: ${e.message}`);
    }
  }

  console.log("\n================================");
  console.log(`Summary: ${successCount}/${vaults.length} vaults passed.`);
  
  if (successCount < vaults.length) {
    console.log("Test Failed: Could not read all vaults.");
    process.exit(1);
  } else {
    console.log("Test Passed!");
    process.exit(0);
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
