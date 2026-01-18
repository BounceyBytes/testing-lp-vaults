import { TradingBot, BotStrategy, BotConfig } from '../bot/TradingBot';
import { validateConfig, config } from '../config';
import { logger } from '../logger';
import { SwapDirection } from '../strategies/PriceManipulator';

/**
 * Example: Execute a single trade
 * 
 * Useful for testing individual swaps and their price impact
 */
async function singleTradeExample() {
  try {
    validateConfig();

    if (config.poolAddresses.length === 0) {
      logger.error('Please configure POOL_ADDRESSES in your .env file');
      return;
    }

    const poolAddress = config.poolAddresses[0];
    const bot = new TradingBot();

    // Execute a single swap from Token0 to Token1
    const botConfig: BotConfig = {
      poolAddress,
      strategy: BotStrategy.SINGLE_SWAP,
      amountPerSwap: '5.0', // Larger amount for more price impact
      swapDirection: SwapDirection.TOKEN0_TO_TOKEN1,
    };

    logger.info('Executing single large swap to test price impact...');
    await bot.start(botConfig);

    logger.info('Trade completed! Check the logs for price impact details.');

  } catch (error) {
    logger.error('Single trade error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  singleTradeExample();
}

export { singleTradeExample };

