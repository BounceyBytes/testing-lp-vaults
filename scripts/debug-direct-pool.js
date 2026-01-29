const { ethers } = require('hardhat');

/**
 * Test swapping directly on the pool - bypassing the router
 * The pool uses the `swap` function with a callback pattern
 */
async function main() {
  const [signer] = await ethers.getSigners();
  console.log("Signer:", signer.address);
  
  // Tokens 
  const USDT = "0x21e56013a76a7f1f86cf7ee95c0a5670c7b7e44d";
  const mUSD = "0x4b545d0758eda6601b051259bd977125fbda7ba2";
  const POOL = "0xf22D49e30794AEe1e74E114332B37dEBd79eE64a";
  
  // Get token contracts
  const usdt = new ethers.Contract(USDT, [
    "function balanceOf(address) view returns (uint256)",
    "function approve(address,uint256) returns (bool)",
    "function transfer(address,uint256) returns (bool)",
    "function decimals() view returns (uint8)"
  ], signer);
  
  const musd = new ethers.Contract(mUSD, [
    "function balanceOf(address) view returns (uint256)",
    "function decimals() view returns (uint8)"
  ], signer);
  
  // Get pool contract
  const pool = new ethers.Contract(POOL, [
    "function token0() view returns (address)",
    "function token1() view returns (address)",
    "function safelyGetStateOfAMM() view returns (uint160 sqrtPriceX96, int24 tick, uint16 lastFee, uint8 pluginConfig, uint16 communityFee, bool unlocked)",
    "function swap(address recipient, bool zeroToOne, int256 amountRequired, uint160 limitSqrtPrice, bytes calldata data) returns (int256 amount0, int256 amount1)",
    "function liquidity() view returns (uint128)"
  ], signer);
  
  // Check balances
  console.log("\n=== Current Balances ===");
  const usdtBal = await usdt.balanceOf(signer.address);
  const musdBal = await musd.balanceOf(signer.address);
  console.log("USDT:", ethers.utils.formatUnits(usdtBal, 6));
  console.log("mUSD:", ethers.utils.formatUnits(musdBal, 6));
  
  // Check pool state
  console.log("\n=== Pool State ===");
  const token0 = await pool.token0();
  const token1 = await pool.token1();
  const state = await pool.safelyGetStateOfAMM();
  const liquidity = await pool.liquidity();
  
  console.log("token0:", token0);
  console.log("token1:", token1);
  console.log("sqrtPriceX96:", state.sqrtPriceX96.toString());
  console.log("tick:", state.tick);
  console.log("lastFee:", state.lastFee);
  console.log("pluginConfig:", state.pluginConfig);
  console.log("unlocked:", state.unlocked);
  console.log("liquidity:", liquidity.toString());
  
  // The pool's swap function requires a callback
  // When you call swap(), it will call your contract's algebraSwapCallback
  // with the amounts owed. If you're an EOA, you can't provide this callback.
  // 
  // This is why you MUST use a router contract.
  // The problem is this router has wrong pool address computation.
  
  console.log("\n=== The Problem ===");
  console.log("The Algebra pool.swap() requires a callback pattern.");
  console.log("EOAs cannot implement callbacks - you need a router.");
  console.log("But the router's pool address computation is broken on this testnet.");
  console.log("");
  console.log("Solutions:");
  console.log("1. Deploy a custom router with correct POOL_INIT_CODE_HASH");
  console.log("2. Ask the testnet team to redeploy the router");
  console.log("3. Use a different DEX for testing");
  
  // Let's verify the init code hash mismatch by computing expected address
  console.log("\n=== Attempting to compute expected addresses ===");
  
  // Standard Algebra pool CREATE2 computation
  // address = keccak256(0xff, deployer, salt, initCodeHash)
  // salt = keccak256(token0, token1)
  
  const poolDeployer = "0xd7cB0E0692f2D55A17bA81c1fE5501D66774fC4A";
  
  // Common init code hashes from various Algebra versions
  const knownInitCodeHashes = [
    "0x6ec6c9c8091d160c0aa74b2b14ba9c1717e95093bd3ac085cee99a49aab294a4", // Algebra 1.9
    "0x6cf16d4c1d7b5b5a2b3a8e1a2d7c5b8e1a2d7c5b8e1a2d7c5b8e1a2d7c5b8e1a", // example
    "0x817e07951f93017a93327ac8cc31e946540203a19e1ecc37bc1761965c2d1090", // QuickSwap
  ];
  
  // Compute salt
  const salt = ethers.utils.keccak256(
    ethers.utils.defaultAbiCoder.encode(
      ['address', 'address'],
      [token0.toLowerCase(), token1.toLowerCase()]
    )
  );
  console.log("Computed salt:", salt);
  
  // Try to reverse-engineer the init code hash from the actual pool address
  // This is complex - let's just verify the router is using wrong computation
  
  // Try calling the quoter which should have the same issue
  console.log("\n=== Testing Quoter ===");
  const quoter = new ethers.Contract(
    "0xa77aD9f635a3FB3bCCC5E6d1A87cB269746Aba17",
    [
      "function quoteExactInputSingle(address tokenIn, address tokenOut, address deployer, uint256 amountIn, uint160 limitSqrtPrice) view returns (uint256 amountOut, uint16 fee)"
    ],
    ethers.provider
  );
  
  try {
    const quote = await quoter.quoteExactInputSingle(
      USDT,
      mUSD,
      poolDeployer,
      ethers.utils.parseUnits("1", 6), // 1 USDT
      0
    );
    console.log("Quote succeeded! AmountOut:", quote.amountOut.toString());
  } catch (e) {
    console.log("Quote failed (expected - same pool computation issue)");
    console.log("Error:", e.message.slice(0, 150));
  }
}

main().catch(console.error);
