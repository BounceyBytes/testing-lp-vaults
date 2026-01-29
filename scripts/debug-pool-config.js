/**
 * Debug pool and router configuration
 */

const { ethers } = require("hardhat");
const config = require("../testnet-config.json");

const ALGEBRA_FACTORY_ABI = [
  "function poolByPair(address, address) view returns (address)"
];

const ALGEBRA_POOL_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function liquidity() view returns (uint128)",
  "function globalState() view returns (uint160 price, int24 tick, uint16 feeZto, uint16 feeOtz, uint16 timepointIndex, uint8 communityFeeToken0, uint8 communityFeeToken1, bool unlocked)"
];

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)"
];

async function main() {
  console.log("=== Pool Configuration Debug ===\n");
  
  const [signer] = await ethers.getSigners();
  
  // Tokens
  const wOM = config.tokens.wOM;
  const usdc = config.tokens.USDC;
  const usdt = config.tokens.USDT;
  const musd = config.tokens.mUSD;
  
  console.log("Token addresses:");
  console.log(`  wOM: ${wOM}`);
  console.log(`  USDC: ${usdc}`);
  console.log(`  USDT: ${usdt}`);
  console.log(`  mUSD: ${musd}`);
  
  // Check what pool the factory returns for wOM/USDC pair
  const factory = new ethers.Contract(config.quickswap.factory, ALGEBRA_FACTORY_ABI, signer);
  
  console.log("\n--- Checking Factory Pool Lookup ---");
  
  // wOM/USDC
  const pool1 = await factory.poolByPair(wOM, usdc);
  console.log(`Factory.poolByPair(wOM, USDC): ${pool1}`);
  console.log(`Config.pools.quickswap.wOM_USDC: ${config.pools.quickswap.wOM_USDC}`);
  console.log(`Match: ${pool1.toLowerCase() === config.pools.quickswap.wOM_USDC.toLowerCase()}`);
  
  // USDT/mUSD
  const pool2 = await factory.poolByPair(usdt, musd);
  console.log(`\nFactory.poolByPair(USDT, mUSD): ${pool2}`);
  console.log(`Config.pools.quickswap.USDT_mUSD: ${config.pools.quickswap.USDT_mUSD}`);
  console.log(`Match: ${pool2.toLowerCase() === config.pools.quickswap.USDT_mUSD.toLowerCase()}`);
  
  // Check the wOM/USDC pool state
  console.log("\n--- wOM/USDC Pool State ---");
  if (pool1 !== ethers.constants.AddressZero) {
    const pool = new ethers.Contract(pool1, ALGEBRA_POOL_ABI, signer);
    
    const token0 = await pool.token0();
    const token1 = await pool.token1();
    const liquidity = await pool.liquidity();
    
    const t0 = new ethers.Contract(token0, ERC20_ABI, signer);
    const t1 = new ethers.Contract(token1, ERC20_ABI, signer);
    const sym0 = await t0.symbol();
    const sym1 = await t1.symbol();
    
    console.log(`Token0: ${token0} (${sym0})`);
    console.log(`Token1: ${token1} (${sym1})`);
    console.log(`Liquidity: ${liquidity.toString()}`);
    
    try {
      const state = await pool.globalState();
      console.log(`Price: ${state.price.toString()}`);
      console.log(`Tick: ${state.tick}`);
      console.log(`Unlocked: ${state.unlocked}`);
    } catch (e) {
      console.log(`globalState error: ${e.message.slice(0, 100)}`);
    }
  } else {
    console.log("Pool does not exist!");
  }
  
  // Check USDT/mUSD pool state
  console.log("\n--- USDT/mUSD Pool State ---");
  if (pool2 !== ethers.constants.AddressZero) {
    const pool = new ethers.Contract(pool2, ALGEBRA_POOL_ABI, signer);
    
    const token0 = await pool.token0();
    const token1 = await pool.token1();
    const liquidity = await pool.liquidity();
    
    const t0 = new ethers.Contract(token0, ERC20_ABI, signer);
    const t1 = new ethers.Contract(token1, ERC20_ABI, signer);
    const sym0 = await t0.symbol();
    const sym1 = await t1.symbol();
    
    console.log(`Token0: ${token0} (${sym0})`);
    console.log(`Token1: ${token1} (${sym1})`);
    console.log(`Liquidity: ${liquidity.toString()}`);
    
    try {
      const state = await pool.globalState();
      console.log(`Price: ${state.price.toString()}`);
      console.log(`Tick: ${state.tick}`);
      console.log(`Unlocked: ${state.unlocked}`);
    } catch (e) {
      console.log(`globalState error: ${e.message.slice(0, 100)}`);
    }
  } else {
    console.log("Pool does not exist!");
  }
  
  console.log("\n=== Debug Complete ===");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
