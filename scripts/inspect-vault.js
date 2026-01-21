/**
 * Inspect vault contract to find available methods for tick boundaries
 */
const { ethers } = require("hardhat");

// Common CLM vault function signatures to probe
const PROBE_FUNCTIONS = [
  // Position-related
  "function positionMain() view returns (int24, int24, uint128)",
  "function position() view returns (int24, int24, uint128)",
  "function range() view returns (int24, int24)",
  "function tickLower() view returns (int24)",
  "function tickUpper() view returns (int24)",
  "function tick() view returns (int24)",
  "function ticks() view returns (int24, int24)",
  "function getPositionTicks() view returns (int24, int24)",
  "function positionTicks() view returns (int24, int24)",
  
  // Strategy-related  
  "function strategy() view returns (address)",
  "function want() view returns (address)",
  "function pool() view returns (address)",
  
  // Liquidity
  "function liquidity() view returns (uint128)",
  "function totalLiquidity() view returns (uint128)",
  
  // Fees
  "function fees() view returns (uint256, uint256)",
  "function fees0() view returns (uint256)",
  "function fees1() view returns (uint256)",
  "function pendingFees() view returns (uint256, uint256)",
  "function unclaimedFees() view returns (uint256, uint256)",
  "function accumulatedFees() view returns (uint256, uint256)",
  
  // Balances
  "function balances() view returns (uint256, uint256)",
  "function getBalances() view returns (uint256, uint256)",
  "function balance() view returns (uint256)",
  "function totalAssets() view returns (uint256)",
  
  // Price
  "function getPricePerFullShare() view returns (uint256)",
  "function pricePerShare() view returns (uint256)"
];

async function main() {
  const [signer] = await ethers.getSigners();
  
  const vaults = [
    { name: "Lotus WETH-USDT", address: "0x1e27612d5240d25b70608cdabe1446e67ae7c48f" },
    { name: "Lotus WBTC-USDC", address: "0xacd6e64e56f66e4f010709d54686792ea96b7230" },
    { name: "Lotus USDC-USDT", address: "0xbbbd57224d28ec578dfe4adc4f50a524804251fe" }
  ];
  
  for (const vault of vaults) {
    console.log(`\n${'═'.repeat(70)}`);
    console.log(`📊 ${vault.name}: ${vault.address}`);
    console.log(`${'═'.repeat(70)}`);
    
    console.log(`\n  VAULT CONTRACT:`);
    for (const func of PROBE_FUNCTIONS) {
      try {
        const contract = new ethers.Contract(vault.address, [func], signer);
        const methodName = func.match(/function (\w+)/)[1];
        const result = await contract[methodName]();
        console.log(`  ✅ ${methodName}(): ${JSON.stringify(result, (k, v) => typeof v === 'bigint' ? v.toString() : v?._isBigNumber ? v.toString() : v)}`);
      } catch (e) {
        // Method doesn't exist or failed
      }
    }
    
    // Try to get strategy and probe it
    try {
      const vaultContract = new ethers.Contract(vault.address, ["function strategy() view returns (address)"], signer);
      const strategyAddr = await vaultContract.strategy();
      console.log(`\n  STRATEGY CONTRACT (${strategyAddr}):`);
      
      for (const func of PROBE_FUNCTIONS) {
        try {
          const contract = new ethers.Contract(strategyAddr, [func], signer);
          const methodName = func.match(/function (\w+)/)[1];
          const result = await contract[methodName]();
          console.log(`  ✅ ${methodName}(): ${JSON.stringify(result, (k, v) => typeof v === 'bigint' ? v.toString() : v?._isBigNumber ? v.toString() : v)}`);
        } catch (e) {
          // Method doesn't exist or failed
        }
      }
    } catch {}
  }
}

main().catch(console.error);
