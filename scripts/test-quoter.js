/**
 * Test Algebra V4 Quoter directly to understand what's happening
 */

const { ethers } = require("hardhat");
const config = require("../testnet-config.json");

async function main() {
  console.log("=== Algebra V4 Quoter Test ===\n");
  
  const [signer] = await ethers.getSigners();
  
  // Token addresses - using 6 decimal tokens
  const USDT = config.tokens.USDT;  // 6 decimals
  const mUSD = config.tokens.mUSD;  // 6 decimals
  const wOM = config.tokens.wOM;    // 18 decimals
  const USDC = config.tokens.USDC;  // 18 decimals based on earlier output
  
  console.log("Tokens:");
  console.log(`  USDT: ${USDT}`);
  console.log(`  mUSD: ${mUSD}`);
  console.log(`  wOM: ${wOM}`);
  console.log(`  USDC: ${USDC}`);
  
  const quoterAddress = config.quickswap.quoterV2;
  const quoterLegacy = config.quickswap.quoter;
  
  console.log(`\nQuoterV2: ${quoterAddress}`);
  console.log(`Quoter (legacy): ${quoterLegacy}`);
  
  // Get the 4-byte function selectors from the deployed quoter
  console.log("\n--- Checking Quoter Contract Code ---");
  const quoterCode = await signer.provider.getCode(quoterAddress);
  console.log(`QuoterV2 code length: ${quoterCode.length} bytes`);
  
  // Extract some function selectors from first part of code
  // Common Algebra V4 quoter functions:
  // quoteExactInputSingle with deployer: 0x57028211
  // quoteExactInputSingle without deployer: 0xc6a5026a
  
  console.log("\n--- Testing Different Quoter ABIs ---");
  
  // Try various quoter interfaces
  const QUOTER_ABIS = {
    // Algebra V4 with deployer (from our ABI file)
    v4_with_deployer: [
      "function quoteExactInputSingle(address tokenIn, address tokenOut, address deployer, uint256 amountIn, uint160 limitSqrtPrice) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)"
    ],
    // Without deployer
    v4_without_deployer: [
      "function quoteExactInputSingle(address tokenIn, address tokenOut, uint256 amountIn, uint160 limitSqrtPrice) returns (uint256 amountOut, uint160 sqrtPriceX96After, uint32 initializedTicksCrossed, uint256 gasEstimate)"
    ],
    // Simpler return type
    v3_simple: [
      "function quoteExactInputSingle(address tokenIn, address tokenOut, uint256 amountIn, uint160 limitSqrtPrice) returns (uint256 amountOut)"
    ],
    // With fee (like Uniswap V3)
    uniswap_style: [
      "function quoteExactInputSingle(address tokenIn, address tokenOut, uint24 fee, uint256 amountIn, uint160 sqrtPriceLimitX96) returns (uint256 amountOut)"
    ]
  };
  
  // Amount for USDT (6 decimals)
  const amountIn = ethers.BigNumber.from("1000000"); // 1 USDT
  
  for (const [name, abi] of Object.entries(QUOTER_ABIS)) {
    console.log(`\nTrying ${name}...`);
    const quoter = new ethers.Contract(quoterAddress, abi, signer);
    
    try {
      let result;
      if (name === "v4_with_deployer") {
        result = await quoter.callStatic.quoteExactInputSingle(
          USDT, mUSD, config.quickswap.poolDeployer, amountIn, 0
        );
      } else if (name === "v4_without_deployer" || name === "v3_simple") {
        result = await quoter.callStatic.quoteExactInputSingle(
          USDT, mUSD, amountIn, 0
        );
      } else if (name === "uniswap_style") {
        result = await quoter.callStatic.quoteExactInputSingle(
          USDT, mUSD, 500, amountIn, 0 // 500 = 0.05% fee
        );
      }
      
      console.log(`  ✅ ${name} works!`);
      if (typeof result === 'object' && result.amountOut) {
        console.log(`     amountOut: ${result.amountOut.toString()}`);
      } else {
        console.log(`     result: ${result.toString()}`);
      }
    } catch (e) {
      const errMsg = e.message.slice(0, 80);
      console.log(`  ❌ ${name} failed: ${errMsg}`);
    }
  }
  
  // Try legacy quoter
  console.log("\n--- Testing Legacy Quoter ---");
  for (const [name, abi] of Object.entries(QUOTER_ABIS)) {
    console.log(`\nTrying legacy ${name}...`);
    const quoter = new ethers.Contract(quoterLegacy, abi, signer);
    
    try {
      let result;
      if (name === "v4_with_deployer") {
        result = await quoter.callStatic.quoteExactInputSingle(
          USDT, mUSD, config.quickswap.poolDeployer, amountIn, 0
        );
      } else if (name === "v4_without_deployer" || name === "v3_simple") {
        result = await quoter.callStatic.quoteExactInputSingle(
          USDT, mUSD, amountIn, 0
        );
      } else if (name === "uniswap_style") {
        result = await quoter.callStatic.quoteExactInputSingle(
          USDT, mUSD, 500, amountIn, 0
        );
      }
      
      console.log(`  ✅ legacy ${name} works!`);
      if (typeof result === 'object' && result.amountOut) {
        console.log(`     amountOut: ${result.amountOut.toString()}`);
      } else {
        console.log(`     result: ${result.toString()}`);
      }
    } catch (e) {
      const errMsg = e.message.slice(0, 80);
      console.log(`  ❌ legacy ${name} failed: ${errMsg}`);
    }
  }
  
  // Maybe the issue is with how we're calling - try raw call
  console.log("\n--- Raw Function Call Test ---");
  
  // Function selector for quoteExactInputSingle(address,address,address,uint256,uint160)
  // = 0x57028211
  const selector = "0x57028211";
  const encodedParams = ethers.utils.defaultAbiCoder.encode(
    ["address", "address", "address", "uint256", "uint160"],
    [USDT, mUSD, config.quickswap.poolDeployer, amountIn, 0]
  );
  const calldata = selector + encodedParams.slice(2);
  
  console.log(`Calldata: ${calldata.slice(0, 100)}...`);
  
  try {
    const result = await signer.provider.call({
      to: quoterAddress,
      data: calldata
    });
    console.log(`Raw call result: ${result}`);
  } catch (e) {
    console.log(`Raw call failed: ${e.message.slice(0, 100)}`);
  }
  
  console.log("\n=== Test Complete ===");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
