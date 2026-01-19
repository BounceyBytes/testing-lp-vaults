import { TradingBot, BotStrategy, BotConfig } from '../bot/TradingBot';
import { validateConfig, config } from '../config';
import { logger } from '../logger';
import { SwapDirection } from '../strategies/PriceManipulator';

/**
 * Example: Custom trading strategy for CLM vault testing
 * 
 * This demonstrates a comprehensive test scenario:
 * 1. Create initial volatility
 * 2. Wait for potential rebalancing
 * 3. Pump price in one direction
 * 4. Wait and observe
 * 5. Pump back in the other direction
 */
async function customStrategy() {
  try {
    validateConfig();

    if (config.poolAddresses.length === 0) {
      logger.error('Please configure POOL_ADDRESSES in your .env file');
      return;
    }

    const poolAddress = config.poolAddresses[0];
    const bot = new TradingBot();

    logger.info('='.repeat(60));
    logger.info('🧪 Starting Custom CLM Vault Test Strategy');
    logger.info('='.repeat(60));

    // Phase 1: Create initial volatility
    logger.info('📊 Phase 1: Creating volatility (6 swaps)');
    await bot.start({
      poolAddress,
      strategy: BotStrategy.VOLATILITY,
      numberOfSwaps: 6,
      amountPerSwap: '1.0',
      delayBetweenSwapsMs: 20000,
    });

    logger.info('⏳ Waiting 2 minutes for potential rebalancing...');
    await sleep(120000);

    // Phase 2: Pump Token0 -> Token1
    logger.info('📈 Phase 2: Pumping Token1 price (5 swaps)');
    await bot.start({
      poolAddress,
      strategy: BotStrategy.PUMP_TOKEN0,
      numberOfSwaps: 5,
      amountPerSwap: '1.5',
      delayBetweenSwapsMs: 25000,
    });

    logger.info('⏳ Waiting 3 minutes for potential rebalancing...');
    await sleep(180000);

    // Phase 3: Pump Token1 -> Token0 (reverse)
    logger.info('📉 Phase 3: Pumping Token0 price (5 swaps)');
    await bot.start({
      poolAddress,
      strategy: BotStrategy.PUMP_TOKEN1,
      numberOfSwaps: 5,
      amountPerSwap: '1.5',
      delayBetweenSwapsMs: 25000,
    });

    logger.info('⏳ Waiting 2 minutes for observation...');
    await sleep(120000);

    // Phase 4: Final volatility burst
    logger.info('🎆 Phase 4: Final volatility burst (4 swaps)');
    await bot.start({
      poolAddress,
      strategy: BotStrategy.VOLATILITY,
      numberOfSwaps: 4,
      amountPerSwap: '2.0',
      delayBetweenSwapsMs: 30000,
    });

    logger.info('='.repeat(60));
    logger.info('✅ Custom Strategy Completed');
    logger.info('Check your CLM vault for rebalancing events!');
    logger.info('='.repeat(60));

  } catch (error) {
    logger.error('Custom strategy error:', error);
    process.exit(1);
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Run if executed directly
if (require.main === module) {
  customStrategy();
}

export { customStrategy };

