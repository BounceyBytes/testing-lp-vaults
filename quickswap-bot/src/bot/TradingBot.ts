import { QuickswapClient } from '../contracts/QuickswapClient';
import { PriceManipulator, SwapDirection } from '../strategies/PriceManipulator';
import { logger } from '../logger';
import { config } from '../config';
import { formatUnits } from 'ethers';

export enum BotStrategy {
  VOLATILITY = 'volatility',      // Alternating swaps to create volatility
  PUMP_TOKEN0 = 'pump_token0',    // Consecutive swaps token0 -> token1
  PUMP_TOKEN1 = 'pump_token1',    // Consecutive swaps token1 -> token0
  SINGLE_SWAP = 'single_swap',    // Single directional swap
  CONTINUOUS = 'continuous',       // Continuous alternating swaps
  TARGET_IMPACT = 'target_impact', // Swap until price impact target is reached
}

export interface BotConfig {
  poolAddress: string;
  strategy: BotStrategy;
  numberOfSwaps?: number;
  amountPerSwap: string;
  delayBetweenSwapsMs?: number;
  swapDirection?: SwapDirection;
  targetPriceImpactPercent?: number;
}

export class TradingBot {
  private client: QuickswapClient;
  private manipulator: PriceManipulator;
  private isRunning: boolean = false;

  constructor() {
    this.client = new QuickswapClient();
    this.manipulator = new PriceManipulator(this.client);
  }

  async start(botConfig: BotConfig): Promise<void> {
    this.isRunning = true;

    try {
      await this.client.validateSetup();

      logger.info('='.repeat(60));
      logger.info('🤖 Trading Bot Starting');
      logger.info('='.repeat(60));

      // Get initial pool info
      const poolInfo = await this.client.getPoolInfo(botConfig.poolAddress);
      logger.info(`Pool: ${poolInfo.token0Symbol}/${poolInfo.token1Symbol}`);
      logger.info(`Pool Address: ${poolInfo.address}`);
      logger.info(`Token0: ${poolInfo.token0} (${poolInfo.token0Symbol})`);
      logger.info(`Token1: ${poolInfo.token1} (${poolInfo.token1Symbol})`);
      logger.info(`Current Price: ${poolInfo.currentPrice.toString()}`);
      logger.info(`Current Tick: ${poolInfo.currentTick}`);
      logger.info(`Liquidity: ${poolInfo.liquidity.toString()}`);
      logger.info(`Strategy: ${botConfig.strategy}`);
      logger.info('='.repeat(60));

      // Check wallet balances
      await this.logBalances(poolInfo.token0, poolInfo.token1);

      // Execute strategy
      switch (botConfig.strategy) {
        case BotStrategy.VOLATILITY:
          await this.executeVolatilityStrategy(botConfig);
          break;

        case BotStrategy.PUMP_TOKEN0:
          await this.executePumpStrategy(botConfig, SwapDirection.TOKEN0_TO_TOKEN1);
          break;

        case BotStrategy.PUMP_TOKEN1:
          await this.executePumpStrategy(botConfig, SwapDirection.TOKEN1_TO_TOKEN0);
          break;

        case BotStrategy.SINGLE_SWAP:
          await this.executeSingleSwapStrategy(botConfig);
          break;

        case BotStrategy.CONTINUOUS:
          await this.executeContinuousStrategy(botConfig);
          break;

        case BotStrategy.TARGET_IMPACT:
          await this.executeTargetImpactStrategy(botConfig);
          break;

        default:
          throw new Error(`Unknown strategy: ${botConfig.strategy}`);
      }

      // Final pool info
      logger.info('='.repeat(60));
      logger.info('📊 Final Pool State');
      logger.info('='.repeat(60));
      const finalPoolInfo = await this.client.getPoolInfo(botConfig.poolAddress);
      logger.info(`Final Price: ${finalPoolInfo.currentPrice.toString()}`);
      logger.info(`Final Tick: ${finalPoolInfo.currentTick}`);
      logger.info(`Price Change: ${poolInfo.currentPrice.toString()} -> ${finalPoolInfo.currentPrice.toString()}`);
      
      // Final balances
      await this.logBalances(poolInfo.token0, poolInfo.token1);

      logger.info('='.repeat(60));
      logger.info('✅ Trading Bot Completed Successfully');
      logger.info('='.repeat(60));

    } catch (error) {
      logger.error('❌ Bot execution failed:', error);
      throw error;
    } finally {
      this.isRunning = false;
    }
  }

  private async executeVolatilityStrategy(botConfig: BotConfig): Promise<void> {
    logger.info('📈 Executing Volatility Strategy');
    const numberOfSwaps = botConfig.numberOfSwaps || 4;
    const delayMs = botConfig.delayBetweenSwapsMs || config.swapIntervalMs;
    
    const poolInfo = await this.client.getPoolInfo(botConfig.poolAddress);
    
    await this.manipulator.executeVolatilityPattern(
      poolInfo,
      numberOfSwaps,
      botConfig.amountPerSwap,
      delayMs
    );
  }

  private async executePumpStrategy(botConfig: BotConfig, direction: SwapDirection): Promise<void> {
    const directionName = direction === SwapDirection.TOKEN0_TO_TOKEN1 ? 'Token0 -> Token1' : 'Token1 -> Token0';
    logger.info(`🚀 Executing Pump Strategy (${directionName})`);
    
    const numberOfSwaps = botConfig.numberOfSwaps || 3;
    const delayMs = botConfig.delayBetweenSwapsMs || config.swapIntervalMs;
    
    const poolInfo = await this.client.getPoolInfo(botConfig.poolAddress);
    
    await this.manipulator.executePumpPattern(
      poolInfo,
      direction,
      numberOfSwaps,
      botConfig.amountPerSwap,
      delayMs
    );
  }

  private async executeSingleSwapStrategy(botConfig: BotConfig): Promise<void> {
    logger.info('🎯 Executing Single Swap Strategy');
    
    const direction = botConfig.swapDirection || SwapDirection.TOKEN0_TO_TOKEN1;
    const poolInfo = await this.client.getPoolInfo(botConfig.poolAddress);
    
    await this.manipulator.executeDirectionalSwap(
      poolInfo,
      direction,
      botConfig.amountPerSwap
    );
  }

  private async executeContinuousStrategy(botConfig: BotConfig): Promise<void> {
    logger.info('♾️  Executing Continuous Strategy (Press Ctrl+C to stop)');
    
    const delayMs = botConfig.delayBetweenSwapsMs || config.swapIntervalMs;
    let swapCount = 0;
    
    while (this.isRunning) {
      try {
        const direction = swapCount % 2 === 0 
          ? SwapDirection.TOKEN0_TO_TOKEN1 
          : SwapDirection.TOKEN1_TO_TOKEN0;
        
        const poolInfo = await this.client.getPoolInfo(botConfig.poolAddress);
        
        await this.manipulator.executeDirectionalSwap(
          poolInfo,
          direction,
          botConfig.amountPerSwap
        );
        
        swapCount++;
        logger.info(`Completed ${swapCount} swaps. Waiting ${delayMs}ms...`);
        
        await this.sleep(delayMs);
      } catch (error) {
        logger.error('Error in continuous strategy:', error);
        await this.sleep(delayMs);
      }
    }
  }

  private async executeTargetImpactStrategy(botConfig: BotConfig): Promise<void> {
    const targetImpact = botConfig.targetPriceImpactPercent ?? config.priceImpactTarget;
    const maxSwaps = botConfig.numberOfSwaps || 20;
    const delayMs = botConfig.delayBetweenSwapsMs || config.swapIntervalMs;
    const direction = botConfig.swapDirection || SwapDirection.TOKEN0_TO_TOKEN1;

    logger.info(`🎯 Executing Target Impact Strategy (target: ${targetImpact}%)`);

    const startPoolInfo = await this.client.getPoolInfo(botConfig.poolAddress);
    let swapCount = 0;

    while (this.isRunning && swapCount < maxSwaps) {
      const currentPoolInfo = await this.client.getPoolInfo(botConfig.poolAddress);
      const currentImpact = this.manipulator.calculatePriceImpactPercent(
        startPoolInfo.currentPrice,
        currentPoolInfo.currentPrice
      );

      if (Math.abs(currentImpact) >= targetImpact) {
        logger.info(`✅ Target impact reached: ${currentImpact.toFixed(4)}%`);
        return;
      }

      logger.info(`Current impact: ${currentImpact.toFixed(4)}% (swap ${swapCount + 1}/${maxSwaps})`);

      await this.manipulator.executeDirectionalSwap(
        currentPoolInfo,
        direction,
        botConfig.amountPerSwap
      );

      swapCount++;

      if (swapCount < maxSwaps) {
        await this.sleep(delayMs);
      }
    }

    logger.warn(`⚠️  Target not reached after ${swapCount} swaps`);
  }

  private async logBalances(token0Address: string, token1Address: string): Promise<void> {
    try {
      const [nativeBalance, token0Balance, token1Balance] = await Promise.all([
        this.client.getNativeBalance(),
        this.client.getTokenBalance(token0Address),
        this.client.getTokenBalance(token1Address),
      ]);

      logger.info('💰 Wallet Balances:');
      logger.info(`  Native (OM): ${formatUnits(nativeBalance, 18)}`);
      logger.info(`  Token0: ${token0Balance.toString()}`);
      logger.info(`  Token1: ${token1Balance.toString()}`);
    } catch (error) {
      logger.error('Error logging balances:', error);
    }
  }

  stop(): void {
    logger.info('🛑 Stopping bot...');
    this.isRunning = false;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  isActive(): boolean {
    return this.isRunning;
  }
}

