/**
 * Price Mover Script for LP Vault Testing
 *
 * This script executes swaps on QuickSwap and Lotus DEX to move prices
 * for comprehensive testing of LP vault rebalancing and position management.
 *
 * Usage:
 *   node scripts/price-mover.js <dex> <pair> <scenario> [options]
 *
 * Examples:
 *   node scripts/price-mover.js quickswap WETH/USDC small-up
 *   node scripts/price-mover.js lotus WETH/USDC large-down
 *   node scripts/price-mover.js both WETH/USDC volatility
 */

const { ethers } = require("hardhat");
const config = require("../testnet-config.json");

// ABI fragments for the DEX routers
const QUICKSWAP_ROUTER_ABI = [
  "function exactInputSingle((address tokenIn, address tokenOut, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 limitSqrtPrice)) external payable returns (uint256 amountOut)",
  "function exactOutputSingle((address tokenIn, address tokenOut, uint256 fee, address recipient, uint256 deadline, uint256 amountOut, uint256 amountInMaximum, uint160 limitSqrtPrice)) external payable returns (uint256 amountIn)"
];

const LOTUS_ROUTER_ABI = [
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)",
  "function exactOutputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountOut, uint256 amountInMaximum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountIn)"
];

const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)"
];

const POOL_ABI = [
  "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)"
];

class PriceMover {
  constructor(signer) {
    this.signer = signer;
    this.quickswapRouter = new ethers.Contract(
      config.quickswap.router,
      QUICKSWAP_ROUTER_ABI,
      signer
    );
    this.lotusRouter = new ethers.Contract(
      config.lotus.swapRouter,
      LOTUS_ROUTER_ABI,
      signer
    );
  }

  /**
   * Get token contract
   */
  getToken(tokenAddress) {
    return new ethers.Contract(tokenAddress, ERC20_ABI, this.signer);
  }

  /**
   * Approve token spending
   */
  async approveToken(tokenAddress, spenderAddress, amount) {
    const token = this.getToken(tokenAddress);
    const symbol = await token.symbol();
    console.log(`Approving ${symbol} for spending...`);

    const tx = await token.approve(spenderAddress, amount);
    await tx.wait();
    console.log(`✓ Approved ${symbol}`);
  }

  /**
   * Get current pool price
   */
  async getPoolPrice(poolAddress) {
    const pool = new ethers.Contract(poolAddress, POOL_ABI, this.signer);
    const [sqrtPriceX96, tick] = await pool.slot0();
    const token0Address = await pool.token0();
    const token1Address = await pool.token1();

    const token0 = this.getToken(token0Address);
    const token1 = this.getToken(token1Address);

    const decimals0 = await token0.decimals();
    const decimals1 = await token1.decimals();

    // Calculate actual price from sqrtPriceX96
    const price = (sqrtPriceX96 / (2 ** 96)) ** 2;
    const adjustedPrice = price * (10 ** decimals0) / (10 ** decimals1);

    return {
      sqrtPriceX96: sqrtPriceX96.toString(),
      tick: tick,
      price: adjustedPrice,
      token0: await token0.symbol(),
      token1: await token1.symbol()
    };
  }

  /**
   * Execute swap on QuickSwap
   */
  async swapQuickSwap(tokenIn, tokenOut, amountIn, minAmountOut = 0) {
    console.log("\n--- QuickSwap Swap ---");
    console.log(`Swapping ${ethers.utils.formatEther(amountIn)} tokens`);

    // Approve tokens
    await this.approveToken(tokenIn, config.quickswap.router, amountIn);

    const params = {
      tokenIn: tokenIn,
      tokenOut: tokenOut,
      recipient: await this.signer.getAddress(),
      deadline: Math.floor(Date.now() / 1000) + 3600, // 1 hour
      amountIn: amountIn,
      amountOutMinimum: minAmountOut,
      limitSqrtPrice: 0 // No price limit
    };

    try {
      const tx = await this.quickswapRouter.exactInputSingle(params);
      const receipt = await tx.wait();
      console.log(`✓ QuickSwap swap successful! Tx: ${receipt.transactionHash}`);
      return receipt;
    } catch (error) {
      console.error(`✗ QuickSwap swap failed:`, error.message);
      throw error;
    }
  }

  /**
   * Execute swap on Lotus DEX
   */
  async swapLotus(tokenIn, tokenOut, feeTier, amountIn, minAmountOut = 0) {
    console.log("\n--- Lotus DEX Swap ---");
    console.log(`Swapping ${ethers.utils.formatEther(amountIn)} tokens`);

    // Approve tokens
    await this.approveToken(tokenIn, config.lotus.swapRouter, amountIn);

    const params = {
      tokenIn: tokenIn,
      tokenOut: tokenOut,
      fee: feeTier,
      recipient: await this.signer.getAddress(),
      deadline: Math.floor(Date.now() / 1000) + 3600, // 1 hour
      amountIn: amountIn,
      amountOutMinimum: minAmountOut,
      sqrtPriceLimitX96: 0 // No price limit
    };

    try {
      const tx = await this.lotusRouter.exactInputSingle(params);
      const receipt = await tx.wait();
      console.log(`✓ Lotus swap successful! Tx: ${receipt.transactionHash}`);
      return receipt;
    } catch (error) {
      console.error(`✗ Lotus swap failed:`, error.message);
      throw error;
    }
  }

  /**
   * Move price up by buying token1 with token0
   */
  async movePriceUp(dex, token0, token1, feeTier, percentMove) {
    console.log(`\n🔼 Moving price UP by ${percentMove}%`);

    // Calculate swap amount based on percent move
    // This is a simplified calculation - in production you'd use the quoter
    const baseAmount = ethers.utils.parseEther("1");
    const swapAmount = baseAmount.mul(percentMove).div(100);

    if (dex === "quickswap" || dex === "both") {
      await this.swapQuickSwap(token0, token1, swapAmount);
    }

    if (dex === "lotus" || dex === "both") {
      await this.swapLotus(token0, token1, feeTier, swapAmount);
    }
  }

  /**
   * Move price down by selling token1 for token0
   */
  async movePriceDown(dex, token0, token1, feeTier, percentMove) {
    console.log(`\n🔽 Moving price DOWN by ${percentMove}%`);

    const baseAmount = ethers.utils.parseEther("1");
    const swapAmount = baseAmount.mul(percentMove).div(100);

    if (dex === "quickswap" || dex === "both") {
      await this.swapQuickSwap(token1, token0, swapAmount);
    }

    if (dex === "lotus" || dex === "both") {
      await this.swapLotus(token1, token0, feeTier, swapAmount);
    }
  }

  /**
   * Create price volatility by executing multiple swaps
   */
  async createVolatility(dex, token0, token1, feeTier, duration = 10, intensity = "medium") {
    console.log(`\n⚡ Creating price volatility for ${duration} swaps`);

    const swapSizes = {
      low: [1, 2, 1, 2, 1],
      medium: [2, 5, 3, 5, 2],
      high: [5, 10, 7, 10, 5]
    };

    const sizes = swapSizes[intensity] || swapSizes.medium;

    for (let i = 0; i < duration; i++) {
      const percentMove = sizes[i % sizes.length];
      const direction = i % 2 === 0;

      console.log(`\nSwap ${i + 1}/${duration}`);

      if (direction) {
        await this.movePriceUp(dex, token0, token1, feeTier, percentMove);
      } else {
        await this.movePriceDown(dex, token0, token1, feeTier, percentMove);
      }

      // Small delay between swaps
      await new Promise(resolve => setTimeout(resolve, 2000));
    }
  }

  /**
   * Push price out of range for rebalancing tests
   */
  async pushOutOfRange(dex, token0, token1, feeTier, direction = "up") {
    console.log(`\n🎯 Pushing price OUT OF RANGE (${direction})`);

    // Large moves to force rebalancing
    const largeMove = 20; // 20% move should push out of most ranges

    if (direction === "up") {
      await this.movePriceUp(dex, token0, token1, feeTier, largeMove);
      await this.movePriceUp(dex, token0, token1, feeTier, largeMove);
    } else {
      await this.movePriceDown(dex, token0, token1, feeTier, largeMove);
      await this.movePriceDown(dex, token0, token1, feeTier, largeMove);
    }
  }

  /**
   * Gradual price drift
   */
  async gradualDrift(dex, token0, token1, feeTier, direction = "up", steps = 5) {
    console.log(`\n📈 Creating gradual price drift ${direction}`);

    for (let i = 0; i < steps; i++) {
      console.log(`\nStep ${i + 1}/${steps}`);
      const smallMove = 2; // 2% per step

      if (direction === "up") {
        await this.movePriceUp(dex, token0, token1, feeTier, smallMove);
      } else {
        await this.movePriceDown(dex, token0, token1, feeTier, smallMove);
      }

      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }
}

/**
 * Main execution function
 */
async function main() {
  const args = process.argv.slice(2);

  if (args.length < 3) {
    console.log(`
Usage: node scripts/price-mover.js <dex> <pair> <scenario> [options]

DEX: quickswap | lotus | both
Pair: WETH/USDC | WETH/USDT | WBTC/WETH | MATIC/USDC | USDC/USDT | DAI/USDC
Scenario:
  - small-up: Small upward price move (~2-5%)
  - small-down: Small downward price move (~2-5%)
  - large-up: Large upward price move (~10-20%)
  - large-down: Large downward price move (~10-20%)
  - volatility: Create volatile price action (multiple swaps)
  - out-of-range-up: Push price out of range upward (for rebalance testing)
  - out-of-range-down: Push price out of range downward
  - gradual-up: Gradual upward drift
  - gradual-down: Gradual downward drift

Examples:
  node scripts/price-mover.js quickswap WETH/USDC small-up
  node scripts/price-mover.js lotus WETH/USDC volatility
  node scripts/price-mover.js both WETH/USDC out-of-range-up
    `);
    process.exit(1);
  }

  const [dex, pairName, scenario] = args;

  // Validate DEX
  if (!["quickswap", "lotus", "both"].includes(dex)) {
    console.error("Error: DEX must be 'quickswap', 'lotus', or 'both'");
    process.exit(1);
  }

  // Find pair config
  const pairConfig = config.pairs.find(p => p.name === pairName);
  if (!pairConfig) {
    console.error(`Error: Pair ${pairName} not found in config`);
    process.exit(1);
  }

  // Get token addresses
  const token0Address = config.tokens[pairConfig.token0];
  const token1Address = config.tokens[pairConfig.token1];

  if (!token0Address || !token1Address) {
    console.error(`Error: Token addresses not configured for ${pairName}`);
    console.error("Please update testnet-config.json with correct token addresses");
    process.exit(1);
  }

  // Get signer
  const [signer] = await ethers.getSigners();
  console.log(`\n💼 Using account: ${await signer.getAddress()}`);

  // Initialize price mover
  const mover = new PriceMover(signer);

  // Execute scenario
  console.log(`\n🎬 Executing scenario: ${scenario} on ${dex} for ${pairName}`);
  console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  try {
    switch (scenario) {
      case "small-up":
        await mover.movePriceUp(dex, token0Address, token1Address, pairConfig.feeTier, 3);
        break;

      case "small-down":
        await mover.movePriceDown(dex, token0Address, token1Address, pairConfig.feeTier, 3);
        break;

      case "large-up":
        await mover.movePriceUp(dex, token0Address, token1Address, pairConfig.feeTier, 15);
        break;

      case "large-down":
        await mover.movePriceDown(dex, token0Address, token1Address, pairConfig.feeTier, 15);
        break;

      case "volatility":
        await mover.createVolatility(dex, token0Address, token1Address, pairConfig.feeTier, 10, "medium");
        break;

      case "out-of-range-up":
        await mover.pushOutOfRange(dex, token0Address, token1Address, pairConfig.feeTier, "up");
        break;

      case "out-of-range-down":
        await mover.pushOutOfRange(dex, token0Address, token1Address, pairConfig.feeTier, "down");
        break;

      case "gradual-up":
        await mover.gradualDrift(dex, token0Address, token1Address, pairConfig.feeTier, "up", 5);
        break;

      case "gradual-down":
        await mover.gradualDrift(dex, token0Address, token1Address, pairConfig.feeTier, "down", 5);
        break;

      default:
        console.error(`Error: Unknown scenario '${scenario}'`);
        process.exit(1);
    }

    console.log(`\n✅ Scenario completed successfully!`);
    console.log(`━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━`);

  } catch (error) {
    console.error(`\n❌ Scenario failed:`, error.message);
    process.exit(1);
  }
}

// Execute if run directly
if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { PriceMover };
