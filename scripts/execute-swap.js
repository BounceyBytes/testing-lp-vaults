/**
 * Execute actual swap transaction (not simulation) and check on-chain result
 */

const { ethers } = require("hardhat");
const config = require("../testnet-config.json");

// Full SwapRouter ABI from Algebra V4
const SWAP_ROUTER_ABI = [
  "function exactInputSingle((address tokenIn, address tokenOut, address deployer, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 limitSqrtPrice)) payable returns (uint256 amountOut)",
  "function exactInputSingleSupportingFeeOnTransferTokens((address tokenIn, address tokenOut, address deployer, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 limitSqrtPrice)) payable returns (uint256 amountOut)"
];

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function approve(address, uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)"
];

async function main() {
  console.log("=== Execute Actual Swap ===\n");
  
  const [signer] = await ethers.getSigners();
  const address = await signer.getAddress();
  
  console.log("Wallet:", address);
  
  // Use USDT -> mUSD on the USDT_mUSD pool
  const tokenIn = config.tokens.USDT;
  const tokenOut = config.tokens.mUSD;
  
  const token = new ethers.Contract(tokenIn, ERC20_ABI, signer);
  const tokenOutContract = new ethers.Contract(tokenOut, ERC20_ABI, signer);
  
  const symIn = await token.symbol();
  const symOut = await tokenOutContract.symbol();
  const decIn = await token.decimals();
  const decOut = await tokenOutContract.decimals();
  
  console.log(`Swap: ${symIn} -> ${symOut}`);
  console.log(`TokenIn: ${tokenIn} (${decIn} decimals)`);
  console.log(`TokenOut: ${tokenOut} (${decOut} decimals)`);
  
  // Amount: 1 USDT (6 decimals)
  const amountIn = ethers.utils.parseUnits("1", decIn);
  console.log(`Amount: 1 ${symIn} (raw: ${amountIn.toString()})`);
  
  // Check balances before
  const balBefore = await tokenOutContract.balanceOf(address);
  console.log(`\n${symOut} balance before: ${ethers.utils.formatUnits(balBefore, decOut)}`);
  
  // Approve
  console.log("\n1. Approving...");
  const approveTx = await token.approve(config.quickswap.router, ethers.constants.MaxUint256);
  await approveTx.wait();
  console.log("   ✓ Approved");
  
  // Build params
  const deadline = Math.floor(Date.now() / 1000) + 1200; // 20 min
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
  
  console.log("\n2. Params:");
  console.log(JSON.stringify({
    ...params,
    amountIn: ethers.utils.formatUnits(amountIn, decIn),
    deadline: new Date(deadline * 1000).toISOString()
  }, null, 2));
  
  const router = new ethers.Contract(config.quickswap.router, SWAP_ROUTER_ABI, signer);
  
  // Try regular exactInputSingle first
  console.log("\n3. Executing exactInputSingle (actual tx, not simulation)...");
  
  // Get current gas price and use higher of that or 50 gwei
  const currentGasPrice = await signer.getGasPrice();
  const minGasPrice = ethers.utils.parseUnits("50", "gwei");
  const gasPrice = currentGasPrice.gt(minGasPrice) ? currentGasPrice : minGasPrice;
  console.log(`   Using gas price: ${ethers.utils.formatUnits(gasPrice, "gwei")} gwei`);
  
  try {
    const tx = await router.exactInputSingle(params, { 
      gasLimit: 500000,
      gasPrice: gasPrice
    });
    console.log(`   Tx hash: ${tx.hash}`);
    console.log("   Waiting for confirmation...");
    
    const receipt = await tx.wait();
    
    if (receipt.status === 1) {
      console.log(`   ✅ SUCCESS! Block: ${receipt.blockNumber}, Gas: ${receipt.gasUsed.toString()}`);
      
      // Check balance after
      const balAfter = await tokenOutContract.balanceOf(address);
      console.log(`   ${symOut} balance after: ${ethers.utils.formatUnits(balAfter, decOut)}`);
      console.log(`   Received: ${ethers.utils.formatUnits(balAfter.sub(balBefore), decOut)} ${symOut}`);
    } else {
      console.log(`   ❌ Transaction reverted on-chain`);
    }
  } catch (e) {
    console.log(`   ❌ Failed: ${e.message.slice(0, 150)}`);
    
    // Try the fee-on-transfer version
    console.log("\n4. Trying exactInputSingleSupportingFeeOnTransferTokens...");
    try {
      const tx = await router.exactInputSingleSupportingFeeOnTransferTokens(params, {
        gasLimit: 500000,
        gasPrice: gasPrice
      });
      console.log(`   Tx hash: ${tx.hash}`);
      const receipt = await tx.wait();
      
      if (receipt.status === 1) {
        console.log(`   ✅ SUCCESS with fee-on-transfer!`);
      } else {
        console.log(`   ❌ Also reverted`);
      }
    } catch (e2) {
      console.log(`   ❌ Also failed: ${e2.message.slice(0, 100)}`);
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
