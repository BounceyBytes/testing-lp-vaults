const { ethers } = require("hardhat");

async function main() {
  const poolAddress = "0xCA04b07be9Bd8773385B2ae257Dbfc44bcEF60Ef";
  const [signer] = await ethers.getSigners();
  
  const abi = [
    "function factory() view returns (address)",
    "function token0() view returns (address)",
    "function token1() view returns (address)",
    "function globalState() view returns (uint160 price, int24 tick, uint16 fee, uint16 timepointIndex, uint8 communityFeeToken0, uint8 communityFeeToken1, bool unlocked)",
    "function safelyGetStateOfAMM() view returns (uint160 sqrtPrice, int24 tick, uint16 lastFee, uint8 pluginConfig, uint128 activeLiquidity, int24 nextTick, int24 previousTick)"
  ];
  
  const pool = new ethers.Contract(poolAddress, abi, signer);
  
  console.log(`Checking QuickSwap pool: ${poolAddress}`);
  
  try {
    const factory = await pool.factory();
    console.log(`Factory: ${factory}`);
  } catch (e) {
    console.log(`factory() failed: ${e.message.slice(0, 50)}`);
  }
  
  try {
    const state = await pool.globalState();
    console.log(`globalState(): price=${state.price.toString()}, tick=${state.tick}`);
  } catch (e) {
    console.log(`globalState() failed: ${e.message.slice(0, 50)}`);
  }
  
  try {
    const state = await pool.safelyGetStateOfAMM();
    console.log(`safelyGetStateOfAMM(): sqrtPrice=${state.sqrtPrice.toString()}, tick=${state.tick}`);
  } catch (e) {
    console.log(`safelyGetStateOfAMM() failed: ${e.message.slice(0, 50)}`);
  }
}

main().catch(console.error);
