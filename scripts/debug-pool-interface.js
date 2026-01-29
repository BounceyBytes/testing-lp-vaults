/**
 * Deep debug of pool interface
 */

const { ethers } = require("hardhat");
const config = require("../testnet-config.json");

// Try multiple possible pool interfaces
const POOL_ABI = [
  // Algebra V1/V2 uses slot0
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  // Algebra V3 uses globalState
  "function globalState() view returns (uint160 price, int24 tick, uint16 feeZto, uint16 feeOtz, uint16 timepointIndex, uint8 communityFeeToken0, uint8 communityFeeToken1, bool unlocked)",
  // Common
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function liquidity() view returns (uint128)",
  // Try various price functions
  "function safelyGetStateOfAMM() view returns (uint160 sqrtPriceX96, int24 tick, uint16 lastFee, uint8 pluginConfig, uint128 activeLiquidity, int24 nextTick, int24 previousTick)",
  "function getReserves() view returns (uint112, uint112, uint32)"
];

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)",
  "function allowance(address, address) view returns (uint256)"
];

async function main() {
  console.log("=== Deep Pool Interface Debug ===\n");
  
  const [signer] = await ethers.getSigners();
  const poolAddress = config.pools.quickswap.wOM_USDC;
  
  console.log(`Pool: ${poolAddress}`);
  
  const pool = new ethers.Contract(poolAddress, POOL_ABI, signer);
  
  // Try different state functions
  console.log("\n--- Testing State Functions ---");
  
  try {
    const slot0 = await pool.slot0();
    console.log("✅ slot0() works:");
    console.log(`   sqrtPriceX96: ${slot0.sqrtPriceX96.toString()}`);
    console.log(`   tick: ${slot0.tick}`);
    console.log(`   unlocked: ${slot0.unlocked}`);
  } catch (e) {
    console.log(`❌ slot0() failed: ${e.message.slice(0, 80)}`);
  }
  
  try {
    const state = await pool.globalState();
    console.log("✅ globalState() works:");
    console.log(`   price: ${state.price.toString()}`);
    console.log(`   tick: ${state.tick}`);
  } catch (e) {
    console.log(`❌ globalState() failed: ${e.message.slice(0, 80)}`);
  }
  
  try {
    const state = await pool.safelyGetStateOfAMM();
    console.log("✅ safelyGetStateOfAMM() works:");
    console.log(`   sqrtPriceX96: ${state.sqrtPriceX96.toString()}`);
    console.log(`   tick: ${state.tick}`);
    console.log(`   activeLiquidity: ${state.activeLiquidity.toString()}`);
  } catch (e) {
    console.log(`❌ safelyGetStateOfAMM() failed: ${e.message.slice(0, 80)}`);
  }
  
  // Check pool balance of tokens
  console.log("\n--- Pool Token Balances ---");
  const token0Addr = await pool.token0();
  const token1Addr = await pool.token1();
  
  const token0 = new ethers.Contract(token0Addr, ERC20_ABI, signer);
  const token1 = new ethers.Contract(token1Addr, ERC20_ABI, signer);
  
  const sym0 = await token0.symbol();
  const sym1 = await token1.symbol();
  const bal0 = await token0.balanceOf(poolAddress);
  const bal1 = await token1.balanceOf(poolAddress);
  
  console.log(`${sym0}: ${ethers.utils.formatEther(bal0)}`);
  console.log(`${sym1}: ${ethers.utils.formatEther(bal1)}`);
  
  // Check router code exists
  console.log("\n--- Router Contract Check ---");
  const routerCode = await signer.provider.getCode(config.quickswap.router);
  console.log(`Router (${config.quickswap.router}) has code: ${routerCode.length > 10}`);
  
  // Let me try to find what functions exist on the router
  // Using the interface from the ABI file
  const SwapRouterABI = require("../quickswap-bot/src/abis/SwapRouter.json");
  console.log(`SwapRouter ABI functions: ${SwapRouterABI.map(f => f.name).filter(Boolean).join(', ')}`);
  
  // Check approval is still valid
  console.log("\n--- Check Approval ---");
  const wOM = new ethers.Contract(config.tokens.wOM, ERC20_ABI, signer);
  const allowance = await wOM.allowance(await signer.getAddress(), config.quickswap.router);
  console.log(`wOM allowance for router: ${ethers.utils.formatEther(allowance)}`);
  
  // Let me try a minimal swap simulation
  console.log("\n--- Simulating Swap Call ---");
  const router = new ethers.Contract(config.quickswap.router, SwapRouterABI, signer);
  
  const deadline = Math.floor(Date.now() / 1000) + 600;
  const params = {
    tokenIn: config.tokens.wOM,
    tokenOut: config.tokens.USDC,
    deployer: config.quickswap.poolDeployer,
    recipient: await signer.getAddress(),
    deadline,
    amountIn: ethers.utils.parseEther("0.01"), // Even smaller amount
    amountOutMinimum: 0,
    limitSqrtPrice: 0
  };
  
  try {
    const result = await router.callStatic.exactInputSingle(params, { gasLimit: 500000 });
    console.log(`✅ Simulation succeeded! Output: ${ethers.utils.formatEther(result)}`);
  } catch (e) {
    console.log(`❌ Simulation failed: ${e.message}`);
    
    // Try to decode the error
    if (e.errorArgs) {
      console.log(`   Error args: ${JSON.stringify(e.errorArgs)}`);
    }
    if (e.error && e.error.data) {
      console.log(`   Error data: ${e.error.data}`);
    }
  }
  
  console.log("\n=== Debug Complete ===");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
