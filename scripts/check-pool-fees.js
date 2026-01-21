/**
 * Pool Fee Checker
 * 
 * Checks the actual fee tiers of pools on Lotus and QuickSwap
 */

const { ethers } = require("hardhat");
const config = require("../testnet-config.json");

// UniV3-style pool ABI
const UNIV3_POOL_ABI = [
  "function fee() view returns (uint24)",
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)",
  "function liquidity() view returns (uint128)",
  "function token0() view returns (address)",
  "function token1() view returns (address)"
];

// Algebra-style pool ABI (QuickSwap)
const ALGEBRA_POOL_ABI = [
  "function globalState() view returns (uint160 price, int24 tick, uint16 fee, uint16, uint8, uint8, bool)",
  "function liquidity() view returns (uint128)",
  "function token0() view returns (address)",
  "function token1() view returns (address)"
];

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)"
];

const POOLS = [
  { name: "QuickSwap USDC/USDT", address: config.pools.quickswap.USDC_USDT, dex: "quickswap" },
  { name: "Lotus WETH/USDT", address: config.pools.lotus.WETH_USDT, dex: "lotus" },
  { name: "Lotus USDC/USDT", address: config.pools.lotus.USDC_USDT, dex: "lotus" },
  { name: "Lotus WBTC/USDC", address: config.pools.lotus.WBTC_USDC, dex: "lotus" }
];

async function checkPool(provider, pool) {
  console.log(`\n${'─'.repeat(60)}`);
  console.log(`📊 ${pool.name}`);
  console.log(`   Address: ${pool.address}`);
  console.log(`${'─'.repeat(60)}`);
  
  if (pool.dex === "lotus") {
    // Try UniV3-style
    const contract = new ethers.Contract(pool.address, UNIV3_POOL_ABI, provider);
    
    try {
      const fee = await contract.fee();
      console.log(`  Fee: ${fee} (${fee / 10000}%)`);
      
      const [sqrtPriceX96, tick] = await contract.slot0();
      console.log(`  Current Tick: ${tick}`);
      console.log(`  sqrtPriceX96: ${sqrtPriceX96.toString()}`);
      
      const liquidity = await contract.liquidity();
      console.log(`  Liquidity: ${liquidity.toString()}`);
      
      const token0 = await contract.token0();
      const token1 = await contract.token1();
      
      const t0 = new ethers.Contract(token0, ERC20_ABI, provider);
      const t1 = new ethers.Contract(token1, ERC20_ABI, provider);
      
      const [sym0, sym1] = await Promise.all([t0.symbol(), t1.symbol()]);
      console.log(`  Token0: ${sym0} (${token0})`);
      console.log(`  Token1: ${sym1} (${token1})`);
      
      return { fee, tick, liquidity: liquidity.toString() };
    } catch (e) {
      console.log(`  ❌ Error reading pool: ${e.message}`);
      return null;
    }
  } else {
    // Try Algebra-style (QuickSwap)
    const contract = new ethers.Contract(pool.address, ALGEBRA_POOL_ABI, provider);
    
    try {
      const [price, tick, fee] = await contract.globalState();
      console.log(`  Fee (from globalState): ${fee} (${fee / 100}%)`);
      console.log(`  Current Tick: ${tick}`);
      console.log(`  Price: ${price.toString()}`);
      
      const liquidity = await contract.liquidity();
      console.log(`  Liquidity: ${liquidity.toString()}`);
      
      const token0 = await contract.token0();
      const token1 = await contract.token1();
      
      const t0 = new ethers.Contract(token0, ERC20_ABI, provider);
      const t1 = new ethers.Contract(token1, ERC20_ABI, provider);
      
      const [sym0, sym1] = await Promise.all([t0.symbol(), t1.symbol()]);
      console.log(`  Token0: ${sym0} (${token0})`);
      console.log(`  Token1: ${sym1} (${token1})`);
      
      return { fee, tick, liquidity: liquidity.toString() };
    } catch (e) {
      console.log(`  ❌ Error reading Algebra pool: ${e.message}`);
      
      // Try UniV3 style as fallback
      console.log(`  Trying UniV3 ABI as fallback...`);
      const fallback = new ethers.Contract(pool.address, UNIV3_POOL_ABI, provider);
      try {
        const fee = await fallback.fee();
        console.log(`  Fee (UniV3): ${fee} (${fee / 10000}%)`);
        return { fee, type: "univ3" };
      } catch (e2) {
        console.log(`  ❌ UniV3 fallback also failed: ${e2.message}`);
        return null;
      }
    }
  }
}

async function main() {
  const [signer] = await ethers.getSigners();
  
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║                    POOL FEE CHECKER                                       ║
║                    MANTRA Dukong Testnet                                  ║
╚═══════════════════════════════════════════════════════════════════════════╝
  `);
  
  const results = {};
  
  for (const pool of POOLS) {
    const info = await checkPool(signer.provider, pool);
    if (info) {
      results[pool.name] = info;
    }
  }
  
  console.log(`\n${'═'.repeat(60)}`);
  console.log(`📋 SUMMARY - Recommended Fee Tiers`);
  console.log(`${'═'.repeat(60)}`);
  
  for (const [name, info] of Object.entries(results)) {
    if (info.fee) {
      console.log(`  ${name}: ${info.fee}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });

