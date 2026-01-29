/**
 * Simple direct swap test on QuickSwap
 */

const { ethers } = require("hardhat");
const config = require("../testnet-config.json");

async function main() {
  console.log("=== Simple QuickSwap Swap Test ===\n");
  
  const [signer] = await ethers.getSigners();
  const address = await signer.getAddress();
  console.log(`Wallet: ${address}`);
  
  // Use wOM -> USDC swap on the wOM_USDC pool
  const tokenIn = config.tokens.wOM;
  const tokenOut = config.tokens.USDC;
  const poolAddress = config.pools.quickswap.wOM_USDC;
  
  console.log(`\nPool: ${poolAddress}`);
  console.log(`wOM: ${tokenIn}`);
  console.log(`USDC: ${tokenOut}`);
  
  // Check wOM balance
  const ERC20_ABI = [
    "function balanceOf(address) view returns (uint256)",
    "function symbol() view returns (string)",
    "function decimals() view returns (uint8)",
    "function approve(address, uint256) returns (bool)"
  ];
  
  const wOMToken = new ethers.Contract(tokenIn, ERC20_ABI, signer);
  const usdcToken = new ethers.Contract(tokenOut, ERC20_ABI, signer);
  
  const wOMBalance = await wOMToken.balanceOf(address);
  const usdcBalance = await usdcToken.balanceOf(address);
  
  console.log(`\nwOM balance: ${ethers.utils.formatEther(wOMBalance)} wOM`);
  console.log(`USDC balance: ${ethers.utils.formatEther(usdcBalance)} USDC`);
  
  if (wOMBalance.eq(0)) {
    console.log("\n❌ No wOM balance to swap. Let's try USDT -> mUSD instead.");
    
    // Try USDT -> mUSD pool
    const usdtToken = new ethers.Contract(config.tokens.USDT, ERC20_ABI, signer);
    const usdtBalance = await usdtToken.balanceOf(address);
    console.log(`USDT balance: ${ethers.utils.formatEther(usdtBalance)} USDT`);
    
    if (usdtBalance.eq(0)) {
      console.log("❌ No USDT either. Cannot test swap.");
      return;
    }
    
    // Use USDT -> mUSD pool
    console.log("\n--- Testing USDT -> mUSD swap on QuickSwap ---");
    const swapTokenIn = config.tokens.USDT;
    const swapTokenOut = config.tokens.mUSD;
    const swapAmount = ethers.utils.parseEther("0.1");
    
    await executeSwap(signer, swapTokenIn, swapTokenOut, swapAmount);
    return;
  }
  
  // Swap wOM -> USDC
  console.log("\n--- Testing wOM -> USDC swap ---");
  const swapAmount = ethers.utils.parseEther("0.1");
  await executeSwap(signer, tokenIn, tokenOut, swapAmount);
}

async function executeSwap(signer, tokenIn, tokenOut, amountIn) {
  const SwapRouterABI = require("../quickswap-bot/src/abis/SwapRouter.json");
  const router = new ethers.Contract(config.quickswap.router, SwapRouterABI, signer);
  
  const ERC20_ABI = ["function approve(address, uint256) returns (bool)"];
  const token = new ethers.Contract(tokenIn, ERC20_ABI, signer);
  
  console.log(`Swapping ${ethers.utils.formatEther(amountIn)} tokens...`);
  
  // Approve
  console.log("1. Approving...");
  const approveTx = await token.approve(config.quickswap.router, amountIn);
  await approveTx.wait();
  console.log("   ✓ Approved");
  
  // Swap
  console.log("2. Executing swap...");
  const deadline = Math.floor(Date.now() / 1000) + 600;
  const recipient = await signer.getAddress();
  
  const params = {
    tokenIn,
    tokenOut,
    deployer: config.quickswap.poolDeployer,
    recipient,
    deadline,
    amountIn,
    amountOutMinimum: 0,
    limitSqrtPrice: 0
  };
  
  console.log("   Params:", JSON.stringify({
    ...params,
    amountIn: ethers.utils.formatEther(params.amountIn)
  }, null, 2));
  
  try {
    const tx = await router.exactInputSingle(params, { gasLimit: 500000 });
    console.log(`   Tx sent: ${tx.hash}`);
    const receipt = await tx.wait();
    console.log(`   ✅ SWAP SUCCESSFUL!`);
    console.log(`   Block: ${receipt.blockNumber}`);
    console.log(`   Gas used: ${receipt.gasUsed.toString()}`);
  } catch (error) {
    console.log(`   ❌ Swap failed: ${error.message}`);
    
    // Try to decode revert reason
    if (error.error && error.error.data) {
      console.log(`   Revert data: ${error.error.data}`);
    }
  }
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
