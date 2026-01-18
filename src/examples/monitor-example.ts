import { QuickswapClient } from '../contracts/QuickswapClient';
import { PoolMonitor } from '../utils/PoolMonitor';
import { validateConfig, config } from '../config';
import { logger } from '../logger';

/**
 * Example: Monitor a pool without executing any trades
 * 
 * This script demonstrates how to use the PoolMonitor to track
 * price changes in a liquidity pool over time.
 */
async function monitorExample() {
  try {
    validateConfig();

    if (config.poolAddresses.length === 0) {
      logger.error('Please configure POOL_ADDRESSES in your .env file');
      return;
    }

    const poolAddress = config.poolAddresses[0];
    logger.info(`Starting monitoring for pool: ${poolAddress}`);

    const client = new QuickswapClient();
    const monitor = new PoolMonitor(client);

    // Setup graceful shutdown
    process.on('SIGINT', async () => {
      logger.info('Stopping monitor...');
      monitor.stopMonitoring();
      await monitor.printStats(poolAddress);
      process.exit(0);
    });

    // Start monitoring with 10 second intervals
    await monitor.startMonitoring(
      poolAddress,
      10000,
      (poolInfo) => {
        // Optional callback for each update
        logger.debug(`Callback: Current tick = ${poolInfo.currentTick}`);
      }
    );

  } catch (error) {
    logger.error('Monitor error:', error);
    process.exit(1);
  }
}

// Run if executed directly
if (require.main === module) {
  monitorExample();
}

export { monitorExample };

