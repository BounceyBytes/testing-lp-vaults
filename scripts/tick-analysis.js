/**
 * Analyze tick mechanics for Algebra V4 / Uniswap V3 style pools
 * 
 * In concentrated liquidity AMMs (UniV3, Algebra), ticks work as follows:
 * - Price at tick i = 1.0001^i
 * - Each tick represents a 0.01% (1 basis point) price change
 * - Tick 0 = price of 1.0
 * - Tick 1 = price of 1.0001
 * - Tick -1 = price of 0.9999
 */

const { ethers } = require("hardhat");
const config = require("../testnet-config.json");

// Calculate price from tick
function tickToPrice(tick) {
  return Math.pow(1.0001, tick);
}

// Calculate tick from price
function priceToTick(price) {
  return Math.log(price) / Math.log(1.0001);
}

async function main() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║                    TICK ANALYSIS FOR ALGEBRA V4                           ║
╚═══════════════════════════════════════════════════════════════════════════╝

📐 TICK FORMULA: price = 1.0001^tick

Each tick represents a 0.01% (1 basis point) price change.
`);

  // Examples
  console.log(`📊 Example Tick Values:`);
  console.log(`  Tick 0      → Price: ${tickToPrice(0).toFixed(8)}`);
  console.log(`  Tick 1      → Price: ${tickToPrice(1).toFixed(8)} (+0.01%)`);
  console.log(`  Tick 100    → Price: ${tickToPrice(100).toFixed(8)} (+1%)`);
  console.log(`  Tick 1000   → Price: ${tickToPrice(1000).toFixed(8)} (+10.5%)`);
  console.log(`  Tick 10000  → Price: ${tickToPrice(10000).toFixed(8)} (+171%)`);
  console.log(`  Tick -1     → Price: ${tickToPrice(-1).toFixed(8)} (-0.01%)`);
  console.log(`  Tick -100   → Price: ${tickToPrice(-100).toFixed(8)} (-1%)`);
  console.log(`  Tick -1000  → Price: ${tickToPrice(-1000).toFixed(8)} (-9.5%)`);
  
  console.log(`\n📈 Vault Position Analysis:\n`);
  
  // Analyze the actual vault ranges
  const vaults = [
    { name: "WETH-USDT", lower: -1963632, upper: 1349380, currentTick: 83140 },
    { name: "WBTC-USDC", lower: -7331824, upper: 348484, currentTick: 115986 },
    { name: "USDC-USDT", lower: -7305916, upper: 7351825, currentTick: -120 }
  ];
  
  for (const v of vaults) {
    const currentPrice = tickToPrice(v.currentTick);
    const lowerPrice = tickToPrice(v.lower);
    const upperPrice = tickToPrice(v.upper);
    
    console.log(`  ${v.name}:`);
    console.log(`    Current Tick: ${v.currentTick} → Price: ${currentPrice.toExponential(4)}`);
    console.log(`    Lower Tick: ${v.lower} → Price: ${lowerPrice.toExponential(4)}`);
    console.log(`    Upper Tick: ${v.upper} → Price: ${upperPrice.toExponential(4)}`);
    console.log(`    Tick Span: ${v.upper - v.lower} ticks`);
    console.log(`    Price Range: ${lowerPrice.toExponential(2)} to ${upperPrice.toExponential(2)}`);
    console.log(`    Price Range Factor: ${(upperPrice / lowerPrice).toExponential(2)}x`);
    console.log();
  }
  
  console.log(`\n📏 What do extreme ticks mean?`);
  console.log(`  Tick -7,000,000 → Price: ${tickToPrice(-7000000).toExponential(4)} (essentially 0)`);
  console.log(`  Tick +7,000,000 → Price: ${tickToPrice(7000000).toExponential(4)} (essentially ∞)`);
  console.log(`  Tick 887272 (MAX_TICK in UniV3) → Price: ${tickToPrice(887272).toExponential(4)}`);
  console.log(`  Tick -887272 (MIN_TICK in UniV3) → Price: ${tickToPrice(-887272).toExponential(4)}`);
  
  console.log(`\n⚠️  NOTE: Ticks beyond ±887,272 are outside standard UniV3 range!`);
  console.log(`   These CLM vaults appear to use extended tick ranges.`);
}

main().catch(console.error);
