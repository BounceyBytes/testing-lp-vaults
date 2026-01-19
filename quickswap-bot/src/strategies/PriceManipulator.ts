import { ethers, parseUnits, formatUnits } from 'ethers';
import { QuickswapClient, PoolInfo, SwapParams } from '../contracts/QuickswapClient';
import { logger } from '../logger';
import { config } from '../config';

export enum SwapDirection {
  TOKEN0_TO_TOKEN1,
  TOKEN1_TO_TOKEN0,
  ALTERNATE,
}

export interface PriceManipulationResult {
  txHash: string;
  priceBeforeSwap: bigint;
  priceAfterSwap: bigint;
  priceImpactPercent: number;
  amountIn: bigint;
  amountOut: bigint;
}

export class PriceManipulator {
  private client: QuickswapClient;

  constructor(client: QuickswapClient) {
    this.client = client;
  }

  /**
   * Execute a single swap to move the price in a specific direction
   */
  async executeDirectionalSwap(
    poolInfo: PoolInfo,
    direction: SwapDirection,
    amountInToken: string
  ): Promise<PriceManipulationResult> {
    const shouldSwap0To1 = direction === SwapDirection.TOKEN0_TO_TOKEN1;
    
    const tokenIn = shouldSwap0To1 ? poolInfo.token0 : poolInfo.token1;
    const tokenOut = shouldSwap0To1 ? poolInfo.token1 : poolInfo.token0;
    const decimalsIn = shouldSwap0To1 ? poolInfo.token0Decimals : poolInfo.token1Decimals;
    const tokenInSymbol = shouldSwap0To1 ? poolInfo.token0Symbol : poolInfo.token1Symbol;
    const tokenOutSymbol = shouldSwap0To1 ? poolInfo.token1Symbol : poolInfo.token0Symbol;

    const amountIn = parseUnits(amountInToken, decimalsIn);

    // Ensure wallet has enough balance for the swap
    const balanceIn = await this.client.getTokenBalance(tokenIn);
    if (balanceIn < amountIn) {
      throw new Error(
        `Insufficient balance for swap. Need ${amountInToken} ${tokenInSymbol}, ` +
        `have ${formatUnits(balanceIn, decimalsIn)} ${tokenInSymbol}.`
      );
    }

    // Get price before swap
    const priceBeforeSwap = poolInfo.currentPrice;

    // Get quote for the swap
    logger.info(`Getting quote for ${amountInToken} ${tokenInSymbol} -> ${tokenOutSymbol}`);
    const quote = await this.client.getQuote(tokenIn, tokenOut, amountIn);
    
    // Calculate minimum amount out with slippage
    const slippageFactor = BigInt(10000 - Math.floor(config.maxSlippagePercent * 100));
    const amountOutMinimum = (quote.amountOut * slippageFactor) / BigInt(10000);

    logger.info(`Expected output: ${formatUnits(quote.amountOut, shouldSwap0To1 ? poolInfo.token1Decimals : poolInfo.token0Decimals)} ${tokenOutSymbol}`);
    logger.info(`Minimum output (with slippage): ${formatUnits(amountOutMinimum, shouldSwap0To1 ? poolInfo.token1Decimals : poolInfo.token0Decimals)} ${tokenOutSymbol}`);

    // Approve token
    await this.client.approveToken(tokenIn, amountIn);

    // Execute swap
    const swapParams: SwapParams = {
      tokenIn,
      tokenOut,
      amountIn,
      amountOutMinimum,
      recipient: this.client.getWalletAddress(),
    };

    const txHash = await this.client.executeSwap(swapParams);

    // Get price after swap
    const poolInfoAfter = await this.client.getPoolInfo(poolInfo.address);
    const priceAfterSwap = poolInfoAfter.currentPrice;

    // Calculate price impact
    const priceImpactPercent = this.calculatePriceImpactPercent(priceBeforeSwap, priceAfterSwap);

    logger.info(`Price impact: ${priceImpactPercent.toFixed(4)}%`);
    logger.info(`Price change: ${priceBeforeSwap.toString()} -> ${priceAfterSwap.toString()}`);

    return {
      txHash,
      priceBeforeSwap,
      priceAfterSwap,
      priceImpactPercent,
      amountIn,
      amountOut: quote.amountOut,
    };
  }

  /**
   * Execute multiple swaps to create price volatility
   */
  async executeVolatilityPattern(
    poolInfo: PoolInfo,
    numberOfSwaps: number,
    amountPerSwap: string,
    delayMs: number = 5000
  ): Promise<PriceManipulationResult[]> {
    const results: PriceManipulationResult[] = [];
    
    logger.info(`Starting volatility pattern: ${numberOfSwaps} swaps with ${delayMs}ms delay`);

    for (let i = 0; i < numberOfSwaps; i++) {
      const direction = i % 2 === 0 
        ? SwapDirection.TOKEN0_TO_TOKEN1 
        : SwapDirection.TOKEN1_TO_TOKEN0;

      logger.info(`Swap ${i + 1}/${numberOfSwaps}: ${direction === SwapDirection.TOKEN0_TO_TOKEN1 ? 'Token0 -> Token1' : 'Token1 -> Token0'}`);

      try {
        // Refresh pool info before each swap
        const currentPoolInfo = await this.client.getPoolInfo(poolInfo.address);
        
        const result = await this.executeDirectionalSwap(
          currentPoolInfo,
          direction,
          amountPerSwap
        );

        results.push(result);

        if (i < numberOfSwaps - 1) {
          logger.info(`Waiting ${delayMs}ms before next swap...`);
          await this.sleep(delayMs);
        }
      } catch (error) {
        logger.error(`Error in swap ${i + 1}:`, error);
        // Continue with next swap
      }
    }

    return results;
  }

  /**
   * Execute a "pump" pattern - multiple swaps in the same direction
   */
  async executePumpPattern(
    poolInfo: PoolInfo,
    direction: SwapDirection,
    numberOfSwaps: number,
    amountPerSwap: string,
    delayMs: number = 5000
  ): Promise<PriceManipulationResult[]> {
    const results: PriceManipulationResult[] = [];
    
    logger.info(`Starting pump pattern: ${numberOfSwaps} swaps in ${direction === SwapDirection.TOKEN0_TO_TOKEN1 ? 'Token0 -> Token1' : 'Token1 -> Token0'} direction`);

    for (let i = 0; i < numberOfSwaps; i++) {
      logger.info(`Pump swap ${i + 1}/${numberOfSwaps}`);

      try {
        const currentPoolInfo = await this.client.getPoolInfo(poolInfo.address);
        
        const result = await this.executeDirectionalSwap(
          currentPoolInfo,
          direction,
          amountPerSwap
        );

        results.push(result);

        if (i < numberOfSwaps - 1) {
          logger.info(`Waiting ${delayMs}ms before next swap...`);
          await this.sleep(delayMs);
        }
      } catch (error) {
        logger.error(`Error in pump swap ${i + 1}:`, error);
      }
    }

    return results;
  }

  /**
   * Calculate the percentage price impact of a swap
   */
  calculatePriceImpactPercent(priceBefore: bigint, priceAfter: bigint): number {
    if (priceBefore === 0n) return 0;
    const delta = priceAfter - priceBefore;
    const scaled = (delta * 1_000_000n) / priceBefore; // percent * 10,000
    return Number(scaled) / 10_000;
  }

  /**
   * Helper to sleep for a specified duration
   */
  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Monitor a pool for a specified duration and log price changes
   */
  async monitorPool(poolAddress: string, durationMs: number, intervalMs: number = 5000): Promise<void> {
    logger.info(`Starting pool monitoring for ${durationMs}ms with ${intervalMs}ms interval`);
    
    const startTime = Date.now();
    const initialPoolInfo = await this.client.getPoolInfo(poolAddress);
    let previousPrice = initialPoolInfo.currentPrice;

    logger.info(`Initial price: ${previousPrice.toString()}`);
    logger.info(`Pool: ${initialPoolInfo.token0Symbol}/${initialPoolInfo.token1Symbol}`);

    while (Date.now() - startTime < durationMs) {
      await this.sleep(intervalMs);

      try {
        const currentPoolInfo = await this.client.getPoolInfo(poolAddress);
        const currentPrice = currentPoolInfo.currentPrice;
        const priceChange = this.calculatePriceImpactPercent(previousPrice, currentPrice);

        logger.info(`Current price: ${currentPrice.toString()} | Change: ${priceChange.toFixed(4)}%`);
        
        previousPrice = currentPrice;
      } catch (error) {
        logger.error('Error monitoring pool:', error);
      }
    }

    logger.info('Pool monitoring completed');
  }
}

