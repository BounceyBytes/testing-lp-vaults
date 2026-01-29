/**
 * Debug script to diagnose QuickSwap quoting issues
 */

const { ethers } = require("hardhat");
const config = require("../testnet-config.json");

// Algebra pool ABI (QuickSwap uses Algebra V3)
const ALGEBRA_POOL_ABI = [
  "function globalState() view returns (uint160 price, int24 tick, uint16 feeZto, uint16 feeOtz, uint16 timepointIndex, uint8 communityFeeToken0, uint8 communityFeeToken1, bool unlocked)",
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function liquidity() view returns (uint128)",
  "function token0() view returns (address)",
  "function token1() view returns (address)"
];

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)"
];

// Try different QuoterV2 function signatures that Algebra might use
const QUOTER_V2_OPTIONS = {
  // Option 1: Standard Algebra QuoterV2
  standardAlgebra: [
    "function quoteExactInputSingle(address tokenIn, address tokenOut, address deployer, uint256 amountIn, uint160 limitSqrtPrice) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)"
  ],
  // Option 2: Without deployer (older versions)
  withoutDeployer: [
    "function quoteExactInputSingle(address tokenIn, address tokenOut, uint256 amountIn, uint160 limitSqrtPrice) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)"
  ],
  // Option 3: Struct-based params
  structBased: [
    "function quoteExactInputSingle((address tokenIn, address tokenOut, uint256 amountIn, uint160 limitSqrtPrice)) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)"
  ],
  // Option 4: Algebra integral with fee
  algebraIntegral: [
    "function quoteExactInputSingle(address tokenIn, address tokenOut, uint256 amountIn, uint24 fee, uint160 sqrtPriceLimitX96) returns (uint256 amountOut)"
  ]
};

async function main() {
  console.log("=== QuickSwap Quote Diagnosis ===\n");
  
  const [signer] = await ethers.getSigners();
  
  // Use the actual QuickSwap pool from config: USDT_mUSD or wOM_USDC
  // Let's check what pools exist
  console.log("Available QuickSwap pools in config:");
  console.log(JSON.stringify(config.pools.quickswap, null, 2));
  
  const poolAddress = config.pools.quickswap.wOM_USDC; // Using wOM_USDC pool
  console.log(`\nPool Address: ${poolAddress}`);
  
  const pool = new ethers.Contract(poolAddress, ALGEBRA_POOL_ABI, signer);
  
  // Try globalState first (Algebra uses this instead of slot0)
  console.log("\n--- Pool State ---");
  try {
    const globalState = await pool.globalState();
    console.log(`✅ globalState() works!`);
    console.log(`   Price (sqrtPriceX96): ${globalState.price.toString()}`);
    console.log(`   Tick: ${globalState.tick}`);
    console.log(`   Fee ZtO: ${globalState.feeZto}`);
    console.log(`   Fee OtZ: ${globalState.feeOtz}`);
    console.log(`   Unlocked: ${globalState.unlocked}`);
  } catch (e) {
    console.log(`❌ globalState() failed: ${e.message.slice(0, 100)}`);
    
    // Try slot0 as fallback
    try {
      const slot0 = await pool.slot0();
      console.log(`✅ slot0() works!`);
      console.log(`   sqrtPriceX96: ${slot0.sqrtPriceX96.toString()}`);
      console.log(`   Tick: ${slot0.tick}`);
    } catch (e2) {
      console.log(`❌ slot0() also failed: ${e2.message.slice(0, 100)}`);
    }
  }
  
  // Check liquidity
  try {
    const liquidity = await pool.liquidity();
    console.log(`   Liquidity: ${liquidity.toString()}`);
    if (liquidity.eq(0)) {
      console.log(`   ⚠️  WARNING: Pool has ZERO liquidity!`);
    }
  } catch (e) {
    console.log(`   Could not read liquidity: ${e.message.slice(0, 50)}`);
  }
  
  // Check tokens
  try {
    const token0 = await pool.token0();
    const token1 = await pool.token1();
    console.log(`   Token0: ${token0}`);
    console.log(`   Token1: ${token1}`);
    
    // Verify these match our config
    if (token0.toLowerCase() === config.tokens.USDC.toLowerCase()) {
      console.log(`   ✓ Token0 is USDC`);
    } else if (token0.toLowerCase() === config.tokens.USDT.toLowerCase()) {
      console.log(`   ✓ Token0 is USDT`);
    }
  } catch (e) {
    console.log(`   Could not read tokens: ${e.message.slice(0, 50)}`);
  }
  
  // Now try different quoter function signatures
  console.log("\n--- Testing QuoterV2 Signatures ---");
  const quoterAddress = config.quickswap.quoterV2;
  console.log(`QuoterV2 Address: ${quoterAddress}`);
  
  // Use wOM and USDC from config for the wOM_USDC pool
  const tokenIn = config.tokens.wOM;
  const tokenOut = config.tokens.USDC;
  const deployer = config.quickswap.poolDeployer;
  const amountIn = ethers.utils.parseEther("1");
  
  console.log(`Token In (wOM): ${tokenIn}`);
  console.log(`Token Out (USDC): ${tokenOut}`);
  
  for (const [name, abi] of Object.entries(QUOTER_V2_OPTIONS)) {
    console.log(`\nTrying ${name}...`);
    const quoter = new ethers.Contract(quoterAddress, abi, signer);
    
    try {
      let result;
      if (name === "standardAlgebra") {
        result = await quoter.callStatic.quoteExactInputSingle(
          tokenIn, tokenOut, deployer, amountIn, 0
        );
      } else if (name === "withoutDeployer") {
        result = await quoter.callStatic.quoteExactInputSingle(
          tokenIn, tokenOut, amountIn, 0
        );
      } else if (name === "structBased") {
        result = await quoter.callStatic.quoteExactInputSingle({
          tokenIn, tokenOut, amountIn, limitSqrtPrice: 0
        });
      } else if (name === "algebraIntegral") {
        result = await quoter.callStatic.quoteExactInputSingle(
          tokenIn, tokenOut, amountIn, 100, 0 // 100 = 0.01% fee
        );
      }
      
      console.log(`✅ ${name} WORKS!`);
      console.log(`   Result: ${JSON.stringify(result, (k, v) => typeof v === 'bigint' ? v.toString() : v)}`);
    } catch (e) {
      console.log(`❌ ${name} failed: ${e.message.slice(0, 100)}`);
    }
  }
  
  // Also try the older quoter
  console.log("\n--- Testing Legacy Quoter ---");
  const legacyQuoterAddress = config.quickswap.quoter;
  console.log(`Legacy Quoter Address: ${legacyQuoterAddress}`);
  
  const LEGACY_QUOTER_ABI = [
    "function quoteExactInputSingle(address tokenIn, address tokenOut, uint256 amountIn, uint160 limitSqrtPrice) returns (uint256 amountOut, uint16 fee)"
  ];
  
  try {
    const legacyQuoter = new ethers.Contract(legacyQuoterAddress, LEGACY_QUOTER_ABI, signer);
    const result = await legacyQuoter.callStatic.quoteExactInputSingle(
      tokenIn, tokenOut, amountIn, 0
    );
    console.log(`✅ Legacy quoter works!`);
    console.log(`   Amount out: ${ethers.utils.formatEther(result.amountOut)}`);
    console.log(`   Fee: ${result.fee}`);
  } catch (e) {
    console.log(`❌ Legacy quoter failed: ${e.message.slice(0, 150)}`);
  }
  
  // Try executing a swap directly without quoting (for testing)
  console.log("\n--- Direct Swap Test (small amount) ---");
  console.log("Attempting direct swap of 0.1 USDC -> USDT...");
  
  const SwapRouterABI = require("../quickswap-bot/src/abis/SwapRouter.json");
  const router = new ethers.Contract(config.quickswap.router, SwapRouterABI, signer);
  
  const token = new ethers.Contract(tokenIn, [
    "function approve(address, uint256) returns (bool)",
    "function allowance(address, address) view returns (uint256)"
  ], signer);
  
  const smallAmount = ethers.utils.parseEther("0.1");
  
  try {
    // Approve
    const approveTx = await token.approve(config.quickswap.router, smallAmount);
    await approveTx.wait();
    console.log("✓ Approval done");
    
    // Swap
    const deadline = Math.floor(Date.now() / 1000) + 600;
    const params = {
      tokenIn,
      tokenOut,
      deployer: config.quickswap.poolDeployer,
      recipient: await signer.getAddress(),
      deadline,
      amountIn: smallAmount,
      amountOutMinimum: 0,  // Accept any amount for testing
      limitSqrtPrice: 0
    };
    
    const tx = await router.exactInputSingle(params, { gasLimit: 500000 });
    const receipt = await tx.wait();
    console.log(`✅ SWAP SUCCESSFUL!`);
    console.log(`   Tx: ${receipt.transactionHash}`);
    console.log(`   Gas used: ${receipt.gasUsed.toString()}`);
  } catch (e) {
    console.log(`❌ Swap failed: ${e.message.slice(0, 200)}`);
  }
  
  console.log("\n=== Diagnosis Complete ===");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
