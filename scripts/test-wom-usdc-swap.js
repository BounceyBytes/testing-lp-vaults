const { ethers } = require("hardhat");
const { SwapHelper } = require("./utils/swap-helper");
const config = require("../testnet-config.json");

async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Testing wOM/USDC SwapHelper");
  console.log("Signer:", signer.address);
  
  const swapHelper = new SwapHelper(signer, { debug: true });
  
  const wOM = config.tokens.wOM;
  const USDC = config.tokens.USDC;
  
  console.log("\n=== Testing QuickSwap wOM/USDC Swap ===");
  console.log("wOM:", wOM);
  console.log("USDC:", USDC);
  
  // Check balances
  const womToken = new ethers.Contract(wOM, ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"], signer);
  const usdcToken = new ethers.Contract(USDC, ["function balanceOf(address) view returns (uint256)", "function decimals() view returns (uint8)"], signer);
  
  const womDecimals = await womToken.decimals();
  const usdcDecimals = await usdcToken.decimals();
  
  console.log("wOM decimals:", womDecimals);
  console.log("USDC decimals:", usdcDecimals);
  
  const womBefore = await womToken.balanceOf(signer.address);
  const usdcBefore = await usdcToken.balanceOf(signer.address);
  
  console.log("\n=== Balances Before ===");
  console.log("wOM:", ethers.utils.formatUnits(womBefore, womDecimals));
  console.log("USDC:", ethers.utils.formatUnits(usdcBefore, usdcDecimals));
  
  // Swap 1 wOM -> USDC
  const amountIn = ethers.utils.parseUnits("1", womDecimals);
  
  console.log("\n=== Executing Swap ===");
  try {
    const result = await swapHelper.swapQuickSwap(wOM, USDC, amountIn);
    
    console.log("\n=== Swap Result ===");
    console.log("Success:", result.success);
    console.log("Tx Hash:", result.txHash);
    console.log("\n✅ wOM/USDC swap PASSED!");
    
  } catch (error) {
    console.log("\n❌ wOM/USDC swap FAILED!");
    console.log("Error:", error.message);
    if (error.details) {
      console.log("Details:", JSON.stringify(error.details, null, 2));
    }
  }
}

main().catch(console.error);
