/**
 * Check pool plugin and try direct pool swap
 */

const { ethers } = require("hardhat");
const config = require("../testnet-config.json");

async function main() {
  console.log("=== Pool Plugin & Direct Swap Test ===\n");
  
  const [signer] = await ethers.getSigners();
  const address = await signer.getAddress();
  
  const poolAddress = config.pools.quickswap.USDT_mUSD;
  
  // Pool ABI with more functions
  const POOL_ABI = [
    "function token0() view returns (address)",
    "function token1() view returns (address)",
    "function liquidity() view returns (uint128)",
    "function safelyGetStateOfAMM() view returns (uint160 sqrtPriceX96, int24 tick, uint16 lastFee, uint8 pluginConfig, uint128 activeLiquidity, int24 nextTick, int24 previousTick)",
    "function plugin() view returns (address)",
    "function communityVault() view returns (address)",
    "function swap(address recipient, bool zeroToOne, int256 amountRequired, uint160 limitSqrtPrice, bytes data) returns (int256 amount0, int256 amount1)"
  ];
  
  const PLUGIN_ABI = [
    "function BEFORE_SWAP_FLAG() view returns (uint256)",
    "function AFTER_SWAP_FLAG() view returns (uint256)",
    "function beforeSwap(address sender, address recipient, bool zeroToOne, int256 amountRequired, uint160 limitSqrtPrice, bool withPaymentInAdvance, bytes data) view returns (bytes4)"
  ];
  
  const ERC20_ABI = [
    "function symbol() view returns (string)",
    "function approve(address, uint256) returns (bool)",
    "function balanceOf(address) view returns (uint256)",
    "function transfer(address, uint256) returns (bool)"
  ];
  
  const pool = new ethers.Contract(poolAddress, POOL_ABI, signer);
  
  console.log("Pool:", poolAddress);
  
  // Get pool state
  const state = await pool.safelyGetStateOfAMM();
  const token0Addr = await pool.token0();
  const token1Addr = await pool.token1();
  const pluginAddr = await pool.plugin();
  
  const token0 = new ethers.Contract(token0Addr, ERC20_ABI, signer);
  const token1 = new ethers.Contract(token1Addr, ERC20_ABI, signer);
  const sym0 = await token0.symbol();
  const sym1 = await token1.symbol();
  
  console.log(`Token0: ${sym0} (${token0Addr})`);
  console.log(`Token1: ${sym1} (${token1Addr})`);
  console.log(`Plugin: ${pluginAddr}`);
  console.log(`Plugin config: ${state.pluginConfig}`);
  console.log(`Active liquidity: ${state.activeLiquidity.toString()}`);
  
  // Check if plugin has swap hooks
  if (pluginAddr !== ethers.constants.AddressZero) {
    console.log("\n--- Plugin Analysis ---");
    const pluginCode = await signer.provider.getCode(pluginAddr);
    console.log(`Plugin code size: ${pluginCode.length} bytes`);
    
    const plugin = new ethers.Contract(pluginAddr, PLUGIN_ABI, signer);
    try {
      const beforeFlag = await plugin.BEFORE_SWAP_FLAG();
      console.log(`BEFORE_SWAP_FLAG: ${beforeFlag.toString()}`);
    } catch (e) {
      console.log(`No BEFORE_SWAP_FLAG function`);
    }
  }
  
  // Check community vault
  try {
    const vault = await pool.communityVault();
    console.log(`Community vault: ${vault}`);
  } catch (e) {
    console.log(`No community vault`);
  }
  
  // Now let's try calling the pool's swap directly
  // This bypasses the router
  console.log("\n--- Direct Pool Swap Test ---");
  console.log("Attempting direct swap on pool (bypassing router)...");
  
  // For a direct swap, we need to pass callback data
  // The pool expects the callback contract to transfer tokens
  // This is complex - let's check what happens
  
  // Amount to swap: 1 USDT (6 decimals)
  const amountIn = ethers.BigNumber.from("1000000"); // 1 USDT
  
  // zeroToOne = true means swap token0 (USDT) -> token1 (mUSD)
  // amountRequired > 0 means exact input
  // limitSqrtPrice = 0 means no limit (use MIN_SQRT_RATIO for zeroToOne)
  const MIN_SQRT_RATIO = ethers.BigNumber.from("4295128739");
  const MAX_SQRT_RATIO = ethers.BigNumber.from("1461446703485210103287273052203988822378723970342");
  
  // The callback data should encode how the pool should receive tokens
  // For testing, let's see what happens with empty data
  
  console.log("Note: Direct pool.swap() requires a callback - this may fail differently");
  
  try {
    // Simulate the swap call
    const result = await pool.callStatic.swap(
      address,           // recipient
      true,              // zeroToOne (USDT -> mUSD)
      amountIn,          // positive = exact input
      MIN_SQRT_RATIO.add(1), // limit price (minimum for zeroToOne)
      "0x"               // empty callback data
    );
    console.log(`Simulation result: amount0=${result.amount0}, amount1=${result.amount1}`);
  } catch (e) {
    console.log(`Direct swap simulation failed: ${e.message.slice(0, 200)}`);
    
    // The error might give us a clue about what's happening
    if (e.errorArgs) {
      console.log(`Error args: ${JSON.stringify(e.errorArgs)}`);
    }
  }
  
  console.log("\n=== Test Complete ===");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
