import { QuickswapClient, PoolInfo } from '../contracts/QuickswapClient';
import { logger } from '../logger';
import { formatUnits } from 'ethers';

export interface PriceSnapshot {
  timestamp: number;
  price: bigint;
  tick: number;
  liquidity: bigint;
}

export interface MonitoringStats {
  poolAddress: string;
  token0Symbol: string;
  token1Symbol: string;
  startPrice: bigint;
  endPrice: bigint;
  minPrice: bigint;
  maxPrice: bigint;
  priceChangePercent: number;
  totalSnapshots: number;
  duration: number;
  volatility: number;
}

export class PoolMonitor {
  private client: QuickswapClient;
  private snapshots: Map<string, PriceSnapshot[]>;
  private isMonitoring: boolean = false;

  constructor(client: QuickswapClient) {
    this.client = client;
    this.snapshots = new Map();
  }

  /**
   * Start monitoring a pool at regular intervals
   */
  async startMonitoring(
    poolAddress: string,
    intervalMs: number = 10000,
    callback?: (poolInfo: PoolInfo) => void
  ): Promise<void> {
    this.isMonitoring = true;
    
    if (!this.snapshots.has(poolAddress)) {
      this.snapshots.set(poolAddress, []);
    }

    logger.info(`📊 Starting pool monitoring: ${poolAddress}`);
    logger.info(`Monitoring interval: ${intervalMs}ms`);

    const poolInfo = await this.client.getPoolInfo(poolAddress);
    logger.info(`Monitoring pool: ${poolInfo.token0Symbol}/${poolInfo.token1Symbol}`);

    while (this.isMonitoring) {
      try {
        const currentPoolInfo = await this.client.getPoolInfo(poolAddress);
        
        const snapshot: PriceSnapshot = {
          timestamp: Date.now(),
          price: currentPoolInfo.currentPrice,
          tick: currentPoolInfo.currentTick,
          liquidity: currentPoolInfo.liquidity,
        };

        this.snapshots.get(poolAddress)!.push(snapshot);

        logger.info(`[${new Date().toISOString()}] Price: ${snapshot.price.toString()} | Tick: ${snapshot.tick} | Liquidity: ${snapshot.liquidity.toString()}`);

        if (callback) {
          callback(currentPoolInfo);
        }

        await this.sleep(intervalMs);
      } catch (error) {
        logger.error('Error in monitoring loop:', error);
        await this.sleep(intervalMs);
      }
    }
  }

  /**
   * Stop monitoring
   */
  stopMonitoring(): void {
    logger.info('Stopping pool monitoring');
    this.isMonitoring = false;
  }

  /**
   * Get monitoring statistics for a pool
   */
  getStats(poolAddress: string): MonitoringStats | null {
    const snapshots = this.snapshots.get(poolAddress);
    
    if (!snapshots || snapshots.length < 2) {
      return null;
    }

    const prices = snapshots.map(s => s.price);
    const startPrice = snapshots[0].price;
    const endPrice = snapshots[snapshots.length - 1].price;
    
    // Find min and max prices
    let minPrice = startPrice;
    let maxPrice = startPrice;
    
    for (const price of prices) {
      if (price < minPrice) minPrice = price;
      if (price > maxPrice) maxPrice = price;
    }

    // Calculate price change percentage
    const priceChangePercent = this.calculatePriceImpactPercent(startPrice, endPrice);

    // Calculate volatility (standard deviation of price changes)
    const priceChanges: number[] = [];
    for (let i = 1; i < prices.length; i++) {
      const change = this.calculatePriceImpactPercent(prices[i - 1], prices[i]);
      priceChanges.push(change);
    }

    const avgChange = priceChanges.reduce((a, b) => a + b, 0) / priceChanges.length;
    const variance = priceChanges.reduce((sum, change) => sum + Math.pow(change - avgChange, 2), 0) / priceChanges.length;
    const volatility = Math.sqrt(variance);

    const duration = snapshots[snapshots.length - 1].timestamp - snapshots[0].timestamp;

    return {
      poolAddress,
      token0Symbol: '',
      token1Symbol: '',
      startPrice,
      endPrice,
      minPrice,
      maxPrice,
      priceChangePercent,
      totalSnapshots: snapshots.length,
      duration,
      volatility,
    };
  }

  /**
   * Print statistics to console
   */
  async printStats(poolAddress: string): Promise<void> {
    const stats = this.getStats(poolAddress);
    
    if (!stats) {
      logger.warn('No statistics available for this pool');
      return;
    }

    const poolInfo = await this.client.getPoolInfo(poolAddress);
    stats.token0Symbol = poolInfo.token0Symbol;
    stats.token1Symbol = poolInfo.token1Symbol;

    logger.info('='.repeat(60));
    logger.info('📈 Pool Monitoring Statistics');
    logger.info('='.repeat(60));
    logger.info(`Pool: ${stats.token0Symbol}/${stats.token1Symbol}`);
    logger.info(`Address: ${poolAddress}`);
    logger.info(`Duration: ${(stats.duration / 1000).toFixed(2)}s`);
    logger.info(`Total Snapshots: ${stats.totalSnapshots}`);
    logger.info('');
    logger.info(`Start Price: ${stats.startPrice.toString()}`);
    logger.info(`End Price: ${stats.endPrice.toString()}`);
    logger.info(`Min Price: ${stats.minPrice.toString()}`);
    logger.info(`Max Price: ${stats.maxPrice.toString()}`);
    logger.info(`Price Change: ${stats.priceChangePercent.toFixed(4)}%`);
    logger.info(`Volatility (Std Dev): ${stats.volatility.toFixed(4)}%`);
    logger.info('='.repeat(60));
  }

  /**
   * Clear snapshots for a pool
   */
  clearSnapshots(poolAddress: string): void {
    this.snapshots.delete(poolAddress);
    logger.info(`Cleared snapshots for pool ${poolAddress}`);
  }

  /**
   * Export snapshots to JSON
   */
  exportSnapshots(poolAddress: string): PriceSnapshot[] | null {
    return this.snapshots.get(poolAddress) || null;
  }

  private calculatePriceImpactPercent(priceBefore: bigint, priceAfter: bigint): number {
    if (priceBefore === 0n) return 0;
    const delta = priceAfter - priceBefore;
    const scaled = (delta * 1_000_000n) / priceBefore; // percent * 10,000
    return Number(scaled) / 10_000;
  }

  private sleep(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

