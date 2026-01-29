/**
 * Test the SwapHelper utility
 * Verifies that swaps work correctly on QuickSwap using DirectPoolSwapper
 */

const { ethers } = require("hardhat");
const { SwapHelper } = require("./utils/swap-helper");
const config = require("../testnet-config.json");

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Testing SwapHelper");
  console.log("Signer:", signer.address);
  
  // Initialize SwapHelper
  const swapHelper = new SwapHelper(signer, { debug: true });
  
  // Get token addresses
  const USDT = config.tokens.USDT;
  const mUSD = config.tokens.mUSD;
  
  console.log("\n=== Testing QuickSwap Swap ===");
  console.log("Pool: USDT/mUSD");
  console.log("USDT:", USDT);
  console.log("mUSD:", mUSD);
  
  // Get initial balances
  const usdtToken = new ethers.Contract(USDT, ["function balanceOf(address) view returns (uint256)"], signer);
  const musdToken = new ethers.Contract(mUSD, ["function balanceOf(address) view returns (uint256)"], signer);
  
  const usdtBefore = await usdtToken.balanceOf(signer.address);
  const musdBefore = await musdToken.balanceOf(signer.address);
  
  console.log("\n=== Balances Before ===");
  console.log("USDT:", ethers.utils.formatUnits(usdtBefore, 6));
  console.log("mUSD:", ethers.utils.formatUnits(musdBefore, 6));
  
  // Execute swap: 1 USDT -> mUSD
  const amountIn = ethers.utils.parseUnits("1", 6); // 1 USDT (6 decimals)
  
  console.log("\n=== Executing Swap ===");
  try {
    const result = await swapHelper.swapQuickSwap(USDT, mUSD, amountIn);
    
    console.log("\n=== Swap Result ===");
    console.log("Success:", result.success);
    console.log("Tx Hash:", result.txHash);
    console.log("Gas Used:", result.gasUsed);
    console.log("Amount In:", ethers.utils.formatUnits(result.amountIn, 6), "USDT");
    console.log("Amount Out:", ethers.utils.formatUnits(result.amountOut, 6), "mUSD");
    
    // Get final balances
    const usdtAfter = await usdtToken.balanceOf(signer.address);
    const musdAfter = await musdToken.balanceOf(signer.address);
    
    console.log("\n=== Balances After ===");
    console.log("USDT:", ethers.utils.formatUnits(usdtAfter, 6));
    console.log("mUSD:", ethers.utils.formatUnits(musdAfter, 6));
    
    console.log("\n✅ SwapHelper test PASSED!");
    
  } catch (error) {
    console.log("\n❌ SwapHelper test FAILED!");
    console.log("Error:", error.message);
    if (error.details) {
      console.log("Details:", JSON.stringify(error.details, null, 2));
    }
  }
  
  // Test reverse swap: mUSD -> USDT
  console.log("\n\n=== Testing Reverse Swap ===");
  console.log("mUSD -> USDT");
  
  const reverseAmountIn = ethers.utils.parseUnits("1", 6); // 1 mUSD
  
  try {
    const result = await swapHelper.swapQuickSwap(mUSD, USDT, reverseAmountIn);
    
    console.log("\n=== Reverse Swap Result ===");
    console.log("Success:", result.success);
    console.log("Amount In:", ethers.utils.formatUnits(result.amountIn, 6), "mUSD");
    console.log("Amount Out:", ethers.utils.formatUnits(result.amountOut, 6), "USDT");
    
    console.log("\n✅ Reverse swap test PASSED!");
    
  } catch (error) {
    console.log("\n❌ Reverse swap test FAILED!");
    console.log("Error:", error.message);
    if (error.details) {
      console.log("Details:", JSON.stringify(error.details, null, 2));
    }
  }
}

main().catch(console.error);
