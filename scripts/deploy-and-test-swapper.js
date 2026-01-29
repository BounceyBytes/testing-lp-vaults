const { ethers } = require('hardhat');

/**
 * Deploy and test the DirectPoolSwapper contract
 * This bypasses the router's broken pool address computation
 */
async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Deployer:", signer.address);
  
  // Deploy the swapper
  console.log("\n=== Deploying DirectPoolSwapper ===");
  const DirectPoolSwapper = await ethers.getContractFactory("DirectPoolSwapper");
  
  // Use 50 gwei gas price (testnet requirement)
  const swapper = await DirectPoolSwapper.deploy({
    gasPrice: ethers.utils.parseUnits("50", "gwei")
  });
  await swapper.deployed();
  console.log("DirectPoolSwapper deployed to:", swapper.address);
  
  // Test with USDT/mUSD pool
  const USDT = "0x21e56013a76a7f1f86cf7ee95c0a5670c7b7e44d";
  const mUSD = "0x4b545d0758eda6601b051259bd977125fbda7ba2";
  const POOL = "0xf22D49e30794AEe1e74E114332B37dEBd79eE64a";
  
  // Get token contracts
  const usdt = new ethers.Contract(USDT, [
    "function balanceOf(address) view returns (uint256)",
    "function approve(address,uint256) returns (bool)",
    "function decimals() view returns (uint8)"
  ], signer);
  
  const musd = new ethers.Contract(mUSD, [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)"
  ], signer);
  
  // Check balances before
  console.log("\n=== Balances Before ===");
  const usdtBefore = await usdt.balanceOf(signer.address);
  const musdBefore = await musd.balanceOf(signer.address);
  console.log("USDT:", ethers.utils.formatUnits(usdtBefore, 6));
  console.log("mUSD:", ethers.utils.formatUnits(musdBefore, 6));
  
  // Approve the swapper to spend USDT
  const amountIn = ethers.utils.parseUnits("1", 6); // 1 USDT
  console.log("\n=== Approving USDT ===");
  const approveTx = await usdt.approve(swapper.address, amountIn, {
    gasPrice: ethers.utils.parseUnits("50", "gwei")
  });
  await approveTx.wait();
  console.log("Approved 1 USDT for swapper");
  
  // Execute swap: USDT -> mUSD
  // USDT is token0 (lower address), so zeroToOne = true
  console.log("\n=== Executing Swap ===");
  console.log("Swapping 1 USDT for mUSD...");
  
  try {
    const swapTx = await swapper.swap(
      POOL,
      true, // zeroToOne (USDT -> mUSD)
      amountIn, // positive = exact input
      0, // no price limit
      {
        gasLimit: 500000,
        gasPrice: ethers.utils.parseUnits("50", "gwei")
      }
    );
    console.log("Swap tx hash:", swapTx.hash);
    const receipt = await swapTx.wait();
    console.log("Swap confirmed in block:", receipt.blockNumber);
    console.log("Gas used:", receipt.gasUsed.toString());
    
    // Check balances after
    console.log("\n=== Balances After ===");
    const usdtAfter = await usdt.balanceOf(signer.address);
    const musdAfter = await musd.balanceOf(signer.address);
    console.log("USDT:", ethers.utils.formatUnits(usdtAfter, 6));
    console.log("mUSD:", ethers.utils.formatUnits(musdAfter, 6));
    
    const usdtDiff = usdtBefore.sub(usdtAfter);
    const musdDiff = musdAfter.sub(musdBefore);
    console.log("\n=== Swap Result ===");
    console.log("USDT spent:", ethers.utils.formatUnits(usdtDiff, 6));
    console.log("mUSD received:", ethers.utils.formatUnits(musdDiff, 6));
    console.log("\n✅ SWAP SUCCESSFUL!");
    
  } catch (e) {
    console.log("Swap failed:", e.message);
    
    // Try to get more details
    if (e.transactionHash) {
      console.log("Transaction hash:", e.transactionHash);
    }
  }
}

main().catch(console.error);
