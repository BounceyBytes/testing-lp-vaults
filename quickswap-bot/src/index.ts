import { TradingBot, BotStrategy, BotConfig } from './bot/TradingBot';
import { QuickswapClient } from './contracts/QuickswapClient';
import { PoolMonitor } from './utils/PoolMonitor';
import { config, validateConfig } from './config';
import { logger } from './logger';
import { SwapDirection } from './strategies/PriceManipulator';

/**
 * Example usage of the trading bot
 */
async function main() {
  try {
    // Validate configuration
    validateConfig();

    logger.info('🚀 Quickswap Testnet Trading Bot');
    logger.info(`Network: Mantra Dukong Testnet (Chain ID: ${config.chainId})`);
    logger.info(`RPC: ${config.rpcUrl}`);
    logger.info('');

    // Check if pool addresses are configured
    if (config.poolAddresses.length === 0) {
      logger.error('No pool addresses configured!');
      logger.info('Please add pool addresses to your .env file:');
      logger.info('POOL_ADDRESSES=0xPoolAddress1,0xPoolAddress2');
      logger.info('');
      logger.info('You can find pools on the Mantrachain testnet explorer or create them using QuickSwap.');
      return;
    }

    // Initialize bot
    const bot = new TradingBot();

    // Setup graceful shutdown
    process.on('SIGINT', () => {
      logger.info('Received SIGINT, shutting down gracefully...');
      bot.stop();
      process.exit(0);
    });

    // Example: Run volatility strategy on first pool
    const poolAddress = config.poolAddresses[0];
    
    const botConfig: BotConfig = {
      poolAddress,
      strategy: BotStrategy.VOLATILITY,
      numberOfSwaps: 6,
      amountPerSwap: config.swapAmountOM,
      delayBetweenSwapsMs: config.swapIntervalMs,
    };

    await bot.start(botConfig);

    logger.info('✅ Bot execution completed');

  } catch (error) {
    logger.error('Fatal error:', error);
    process.exit(1);
  }
}

/**
 * Example: Monitor a pool without trading
 */
async function monitorPool(poolAddress: string) {
  try {
    validateConfig();

    const client = new QuickswapClient();
    const monitor = new PoolMonitor(client);

    process.on('SIGINT', async () => {
      logger.info('Stopping monitor...');
      monitor.stopMonitoring();
      await monitor.printStats(poolAddress);
      process.exit(0);
    });

    await monitor.startMonitoring(poolAddress, 10000);

  } catch (error) {
    logger.error('Monitor error:', error);
    process.exit(1);
  }
}

/**
 * Example: Run custom strategy
 */
async function runCustomStrategy() {
  try {
    validateConfig();

    if (config.poolAddresses.length === 0) {
      logger.error('No pool addresses configured!');
      return;
    }

    const bot = new TradingBot();
    
    // Example: Pump token0 to trigger rebalancing
    const botConfig: BotConfig = {
      poolAddress: config.poolAddresses[0],
      strategy: BotStrategy.PUMP_TOKEN0,
      numberOfSwaps: 5,
      amountPerSwap: '2.0',
      delayBetweenSwapsMs: 15000,
    };

    await bot.start(botConfig);

  } catch (error) {
    logger.error('Custom strategy error:', error);
    process.exit(1);
  }
}

// Run the main function
if (require.main === module) {
  main().catch((error) => {
    logger.error('Unhandled error:', error);
    process.exit(1);
  });
}

export { main, monitorPool, runCustomStrategy };

