/**
 * Quick test script to verify QuickSwap swap functionality
 */

const { ethers } = require("hardhat");
const config = require("../testnet-config.json");
const { SwapHelper } = require('./utils/swap-helper');

async function main() {
  console.log("=== QuickSwap Swap Test ===\n");
  
  const [signer] = await ethers.getSigners();
  const address = await signer.getAddress();
  console.log(`Wallet: ${address}`);
  
  // Initialize SwapHelper with debug mode
  const swapHelper = new SwapHelper(signer, { debug: true, slippageBps: 100 });
  
  // Test tokens: USDC -> USDT on QuickSwap
  const tokenIn = config.tokens.USDC;
  const tokenOut = config.tokens.USDT;
  const amountIn = ethers.utils.parseEther("1"); // 1 USDC
  
  console.log(`\nTest: Swap 1 USDC -> USDT on QuickSwap`);
  console.log(`Pool: ${config.pools.quickswap.USDC_USDT}`);
  console.log(`Token In: ${tokenIn}`);
  console.log(`Token Out: ${tokenOut}`);
  console.log(`Amount: ${ethers.utils.formatEther(amountIn)} USDC`);
  
  // Step 1: Test quoting
  console.log(`\n--- Step 1: Testing Quote ---`);
  try {
    const quote = await swapHelper.getQuickSwapQuote(tokenIn, tokenOut, amountIn);
    if (quote.success) {
      console.log(`✅ Quote successful!`);
      console.log(`   Expected output: ${ethers.utils.formatEther(quote.amountOut)} USDT`);
      console.log(`   Ticks crossed: ${quote.initializedTicksCrossed}`);
    } else {
      console.log(`❌ Quote failed: ${quote.error}`);
      return;
    }
  } catch (error) {
    console.log(`❌ Quote error: ${error.message}`);
    return;
  }
  
  // Step 2: Execute swap
  console.log(`\n--- Step 2: Executing Swap ---`);
  try {
    const result = await swapHelper.swapQuickSwap(tokenIn, tokenOut, amountIn);
    console.log(`\n✅ Swap successful!`);
    console.log(`   Tx Hash: ${result.txHash}`);
    console.log(`   Block: ${result.blockNumber}`);
    console.log(`   Gas Used: ${result.gasUsed}`);
    if (result.expectedOutput) {
      console.log(`   Expected Output: ${ethers.utils.formatEther(result.expectedOutput)} USDT`);
    }
  } catch (error) {
    console.log(`\n❌ Swap failed: ${error.message}`);
    if (error.code) {
      console.log(`   Error code: ${error.code}`);
    }
    if (error.details) {
      console.log(`   Details:`, JSON.stringify(error.details, null, 2));
    }
  }
  
  console.log(`\n=== Test Complete ===`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
