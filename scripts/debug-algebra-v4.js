/**
 * Algebra V4 Debug - Check pool state and try swap with correct interface
 */

const { ethers } = require("hardhat");
const config = require("../testnet-config.json");

// Algebra V4 Pool ABI (using safelyGetStateOfAMM)
const ALGEBRA_V4_POOL_ABI = [
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function liquidity() view returns (uint128)",
  "function safelyGetStateOfAMM() view returns (uint160 sqrtPriceX96, int24 tick, uint16 lastFee, uint8 pluginConfig, uint128 activeLiquidity, int24 nextTick, int24 previousTick)",
  "function tickSpacing() view returns (int24)"
];

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function approve(address, uint256) returns (bool)",
  "function allowance(address, address) view returns (uint256)"
];

// Algebra V4 SwapRouter ABI (confirmed from GitHub)
const SWAP_ROUTER_ABI = [
  "function exactInputSingle((address tokenIn, address tokenOut, address deployer, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 limitSqrtPrice)) external payable returns (uint256 amountOut)"
];

async function main() {
  console.log("=== Algebra V4 Swap Debug ===\n");
  
  const [signer] = await ethers.getSigners();
  const address = await signer.getAddress();
  console.log(`Wallet: ${address}`);
  
  // Use the USDT/mUSD pool - it might have better liquidity balance
  const poolAddress = config.pools.quickswap.USDT_mUSD;
  console.log(`\nPool: ${poolAddress} (USDT/mUSD)`);
  
  const pool = new ethers.Contract(poolAddress, ALGEBRA_V4_POOL_ABI, signer);
  
  // Get pool state
  console.log("\n--- Pool State ---");
  const state = await pool.safelyGetStateOfAMM();
  const token0Addr = await pool.token0();
  const token1Addr = await pool.token1();
  const tickSpacing = await pool.tickSpacing();
  
  const token0 = new ethers.Contract(token0Addr, ERC20_ABI, signer);
  const token1 = new ethers.Contract(token1Addr, ERC20_ABI, signer);
  
  const sym0 = await token0.symbol();
  const sym1 = await token1.symbol();
  const dec0 = await token0.decimals();
  const dec1 = await token1.decimals();
  
  console.log(`Token0: ${token0Addr} (${sym0}, ${dec0} decimals)`);
  console.log(`Token1: ${token1Addr} (${sym1}, ${dec1} decimals)`);
  console.log(`sqrtPriceX96: ${state.sqrtPriceX96.toString()}`);
  console.log(`Tick: ${state.tick}`);
  console.log(`Active Liquidity: ${state.activeLiquidity.toString()}`);
  console.log(`Last Fee: ${state.lastFee}`);
  console.log(`Tick Spacing: ${tickSpacing}`);
  
  // Calculate price
  const sqrtPrice = Number(state.sqrtPriceX96) / (2 ** 96);
  const price = sqrtPrice ** 2;
  const adjustedPrice = price * (10 ** dec0) / (10 ** dec1);
  console.log(`Price (${sym1} per ${sym0}): ${adjustedPrice}`);
  
  // Pool balances
  const bal0 = await token0.balanceOf(poolAddress);
  const bal1 = await token1.balanceOf(poolAddress);
  console.log(`\nPool Balances:`);
  console.log(`  ${sym0}: ${ethers.utils.formatUnits(bal0, dec0)}`);
  console.log(`  ${sym1}: ${ethers.utils.formatUnits(bal1, dec1)}`);
  
  // Check user balances
  console.log("\n--- User Balances ---");
  const userBal0 = await token0.balanceOf(address);
  const userBal1 = await token1.balanceOf(address);
  console.log(`${sym0}: ${ethers.utils.formatUnits(userBal0, dec0)}`);
  console.log(`${sym1}: ${ethers.utils.formatUnits(userBal1, dec1)}`);
  
  // Determine which direction we can swap
  const canSwap0to1 = userBal0.gt(0) && bal1.gt(0);
  const canSwap1to0 = userBal1.gt(0) && bal0.gt(0);
  
  console.log(`\nCan swap ${sym0} -> ${sym1}: ${canSwap0to1}`);
  console.log(`Can swap ${sym1} -> ${sym0}: ${canSwap1to0}`);
  
  if (!canSwap0to1 && !canSwap1to0) {
    console.log("\n❌ Cannot swap - insufficient balances or liquidity");
    return;
  }
  
  // Try swap in the direction that works
  console.log("\n--- Attempting Swap ---");
  
  const router = new ethers.Contract(config.quickswap.router, SWAP_ROUTER_ABI, signer);
  
  let tokenIn, tokenOut, amountIn, amountInDisplay;
  if (canSwap0to1) {
    tokenIn = token0Addr;
    tokenOut = token1Addr;
    amountIn = ethers.utils.parseUnits("1", dec0); // 1 token
    amountInDisplay = ethers.utils.formatUnits(amountIn, dec0);
    console.log(`Swap: 1 ${sym0} -> ${sym1}`);
  } else {
    tokenIn = token1Addr;
    tokenOut = token0Addr;
    amountIn = ethers.utils.parseUnits("1", dec1); // 1 token
    amountInDisplay = ethers.utils.formatUnits(amountIn, dec1);
    console.log(`Swap: 1 ${sym1} -> ${sym0}`);
  }
  
  // Approve
  const tokenInContract = new ethers.Contract(tokenIn, ERC20_ABI, signer);
  console.log("1. Approving tokens...");
  const approveTx = await tokenInContract.approve(config.quickswap.router, amountIn);
  await approveTx.wait();
  console.log("   ✓ Approved");
  
  // Build swap params
  const deadline = Math.floor(Date.now() / 1000) + 600;
  const params = {
    tokenIn,
    tokenOut,
    deployer: config.quickswap.poolDeployer,
    recipient: address,
    deadline,
    amountIn,
    amountOutMinimum: 0,
    limitSqrtPrice: 0
  };
  
  console.log("2. Swap params:");
  console.log(`   tokenIn: ${tokenIn}`);
  console.log(`   tokenOut: ${tokenOut}`);
  console.log(`   deployer: ${params.deployer}`);
  console.log(`   amountIn: ${amountInDisplay} (raw: ${amountIn.toString()})`);
  console.log(`   recipient: ${address}`);
  
  // Try simulation first
  console.log("\n3. Simulating swap...");
  try {
    const result = await router.callStatic.exactInputSingle(params);
    console.log(`   ✅ Simulation succeeded! Output: ${ethers.utils.formatEther(result)}`);
    
    // Execute for real
    console.log("\n4. Executing swap...");
    const tx = await router.exactInputSingle(params, { gasLimit: 500000 });
    console.log(`   Tx: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`   ✅ SWAP SUCCESSFUL!`);
    console.log(`   Block: ${receipt.blockNumber}`);
    console.log(`   Gas: ${receipt.gasUsed.toString()}`);
  } catch (e) {
    console.log(`   ❌ Failed: ${e.message.slice(0, 200)}`);
    
    // Try with different deployer - maybe it's the factory?
    console.log("\n--- Trying with Factory as deployer ---");
    params.deployer = config.quickswap.factory;
    try {
      const result = await router.callStatic.exactInputSingle(params);
      console.log(`   ✅ Works with factory! Output: ${ethers.utils.formatEther(result)}`);
    } catch (e2) {
      console.log(`   ❌ Also failed: ${e2.message.slice(0, 100)}`);
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
