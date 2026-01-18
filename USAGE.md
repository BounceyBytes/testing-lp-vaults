# Usage Guide

This guide covers how to use the Quickswap Testnet Trading Bot for testing CLM vault rebalancing.

## Table of Contents

1. [Quick Start](#quick-start)
2. [Available Commands](#available-commands)
3. [Trading Strategies Explained](#trading-strategies-explained)
4. [Testing CLM Vaults](#testing-clm-vaults)
5. [Monitoring Pools](#monitoring-pools)
6. [Advanced Configuration](#advanced-configuration)
7. [Troubleshooting](#troubleshooting)

## Quick Start

### 1. Run the Default Strategy

The default configuration runs a volatility strategy:

```bash
npm start
```

or for development mode with better error messages:

```bash
npm run dev
```

### 2. Monitor a Pool

To watch price changes without trading:

```bash
npm run monitor
```

### 3. Execute a Single Trade

To test with just one swap:

```bash
npm run single-trade
```

### 4. Run Custom Strategy

For advanced multi-phase testing:

```bash
npm run custom-strategy
```

## Available Commands

| Command | Description |
|---------|-------------|
| `npm run build` | Compile TypeScript to JavaScript |
| `npm start` | Run compiled bot |
| `npm run dev` | Run bot in development mode |
| `npm run monitor` | Monitor pool without trading |
| `npm run single-trade` | Execute one swap |
| `npm run custom-strategy` | Run multi-phase test strategy |
| `npm run lint` | Check code quality |

## Trading Strategies Explained

### 1. Volatility Strategy

**Purpose**: Create rapid price fluctuations to test bidirectional rebalancing

**How it works**:
- Alternates between Token0→Token1 and Token1→Token0 swaps
- Creates wave-like price movement
- Good for testing frequent rebalancing

**Configuration**:
```typescript
{
  strategy: BotStrategy.VOLATILITY,
  numberOfSwaps: 6,        // 6 alternating swaps
  amountPerSwap: '1.0',    // 1.0 tokens per swap
  delayBetweenSwapsMs: 30000  // 30 seconds between swaps
}
```

**Use case**: Testing if your CLM vault responds correctly to price oscillations

### 2. Pump Token0 Strategy

**Purpose**: Drive price strongly in one direction (Token1 gets more expensive)

**How it works**:
- Multiple consecutive Token0→Token1 swaps
- Pushes price upward steadily
- Tests upper range boundary

**Configuration**:
```typescript
{
  strategy: BotStrategy.PUMP_TOKEN0,
  numberOfSwaps: 5,
  amountPerSwap: '2.0',
  delayBetweenSwapsMs: 20000
}
```

**Use case**: Testing rebalancing when price exits the upper bound of your vault's range

### 3. Pump Token1 Strategy

**Purpose**: Drive price strongly in opposite direction (Token0 gets more expensive)

**How it works**:
- Multiple consecutive Token1→Token0 swaps
- Pushes price downward steadily
- Tests lower range boundary

**Configuration**:
```typescript
{
  strategy: BotStrategy.PUMP_TOKEN1,
  numberOfSwaps: 5,
  amountPerSwap: '2.0',
  delayBetweenSwapsMs: 20000
}
```

**Use case**: Testing rebalancing when price exits the lower bound of your vault's range

### 4. Single Swap Strategy

**Purpose**: Test individual swap impact

**How it works**:
- Executes just one swap
- Allows precise control over direction and amount
- Good for measuring exact price impact

**Configuration**:
```typescript
{
  strategy: BotStrategy.SINGLE_SWAP,
  amountPerSwap: '5.0',    // Larger amount for bigger impact
  swapDirection: SwapDirection.TOKEN0_TO_TOKEN1
}
```

**Use case**: Calibrating the right swap size to trigger rebalancing

### 5. Continuous Strategy

**Purpose**: Run indefinitely for long-term testing

**How it works**:
- Keeps swapping until manually stopped (Ctrl+C)
- Alternates direction
- Good for stress testing

**Configuration**:
```typescript
{
  strategy: BotStrategy.CONTINUOUS,
  amountPerSwap: '1.0',
  delayBetweenSwapsMs: 60000  // 1 minute between swaps
}
```

**Use case**: Multi-hour testing sessions to verify vault stability

## Testing CLM Vaults

### Understanding CLM Vault Rebalancing

CLM (Concentrated Liquidity Market) vaults typically rebalance when:
1. Price moves beyond a threshold (e.g., ±5% from center)
2. Time-based triggers (e.g., every X hours)
3. Manual triggers

### Recommended Testing Flow

#### Phase 1: Baseline Test

1. Start pool monitoring in one terminal:
```bash
npm run monitor
```

2. Note the current price and your vault's range

3. In another terminal, run a small volatility test:
```bash
npm run dev
```

4. Watch for rebalancing events in your vault

#### Phase 2: Edge Case Testing

Test what happens at range boundaries:

```typescript
// Edit src/index.ts or create custom script
const botConfig = {
  poolAddress: '0xYourPool',
  strategy: BotStrategy.PUMP_TOKEN0,
  numberOfSwaps: 10,
  amountPerSwap: '3.0',
  delayBetweenSwapsMs: 15000,
};
```

#### Phase 3: Stress Testing

Run continuous strategy overnight:

```typescript
const botConfig = {
  poolAddress: '0xYourPool',
  strategy: BotStrategy.CONTINUOUS,
  amountPerSwap: '1.5',
  delayBetweenSwapsMs: 120000, // 2 minutes
};
```

### Measuring Success

Your CLM vault should:
- ✅ Rebalance when price moves beyond threshold
- ✅ Maintain liquidity within active range
- ✅ Not rebalance too frequently (wasting gas)
- ✅ Not wait too long (missing fees)

### Monitoring Vault Performance

While the bot runs, monitor:

1. **Vault rebalancing transactions**
   - Check block explorer for your vault address
   - Look for "rebalance" or similar function calls

2. **Price vs. Range**
   - Current pool price
   - Your vault's active range
   - Distance to range boundaries

3. **Gas costs**
   - Track rebalancing gas usage
   - Ensure it's economical

4. **Fee collection**
   - Monitor fees earned
   - Compare active vs. out-of-range periods

## Monitoring Pools

### Real-time Monitoring

```bash
npm run monitor
```

This displays:
- Current price (sqrtPriceX96)
- Current tick
- Liquidity in range
- Timestamp

Press Ctrl+C to stop and see statistics.

### Custom Monitoring Script

Create `my-monitor.ts`:

```typescript
import { QuickswapClient } from './src/contracts/QuickswapClient';
import { PoolMonitor } from './src/utils/PoolMonitor';

const client = new QuickswapClient();
const monitor = new PoolMonitor(client);

// Custom callback for each price update
const callback = (poolInfo) => {
  console.log(`Price: ${poolInfo.currentPrice.toString()}`);
  
  // Add your custom logic here
  // e.g., alert if price moves more than 5%
};

monitor.startMonitoring('0xYourPool', 5000, callback);
```

### Statistics Available

After monitoring, the bot provides:
- Start/end prices
- Min/max prices observed
- Price change percentage
- Volatility (standard deviation)
- Total snapshots taken
- Duration

## Advanced Configuration

### Adjusting Swap Amounts

**Small amounts (0.1 - 1.0)**:
- Gentle price movements
- Good for initial testing
- Lower gas costs

**Medium amounts (1.0 - 5.0)**:
- Moderate price impact
- Good for typical testing
- Reasonable gas costs

**Large amounts (5.0+)**:
- Significant price impact
- Use for stress testing
- Higher gas costs

### Adjusting Time Intervals

**Fast (5-15 seconds)**:
- Rapid price changes
- High gas usage
- Good for quick tests

**Medium (30-60 seconds)**:
- Balanced testing
- Moderate gas usage
- Recommended default

**Slow (2-5 minutes)**:
- Gradual price changes
- Lower gas usage
- Good for overnight tests

### Adjusting Slippage

In `.env`:

```env
# Conservative (may revert more often)
MAX_SLIPPAGE_PERCENT=5

# Balanced
MAX_SLIPPAGE_PERCENT=10

# Aggressive (less likely to revert)
MAX_SLIPPAGE_PERCENT=20
```

## Troubleshooting

### Bot stops with "Insufficient balance"

**Solution**:
1. Check token balances:
```typescript
const client = new QuickswapClient();
const balance = await client.getTokenBalance('0xTokenAddress');
console.log(balance.toString());
```

2. Get more testnet tokens from faucet
3. Reduce `SWAP_AMOUNT_OM` in `.env`

### "Transaction reverted" errors

**Possible causes and solutions**:

1. **Slippage too tight**:
   - Increase `MAX_SLIPPAGE_PERCENT`

2. **Pool has low liquidity**:
   - Reduce `SWAP_AMOUNT_OM`
   - Choose a pool with more liquidity

3. **Price moved between quote and execution**:
   - Increase `MAX_SLIPPAGE_PERCENT`
   - Reduce `SWAP_AMOUNT_OM`

### Price not moving enough

**Solutions**:

1. **Increase swap amount**:
```env
SWAP_AMOUNT_OM=5.0
```

2. **Use pump strategy** instead of volatility:
```typescript
strategy: BotStrategy.PUMP_TOKEN0
```

3. **Reduce time between swaps**:
```env
SWAP_INTERVAL_MS=15000
```

### Can't find pool addresses

**Solutions**:

1. **Query AlgebraFactory**:
```typescript
const factory = new Contract(
  '0x10253594A832f967994b44f33411940533302ACb',
  factoryABI,
  provider
);

const poolAddress = await factory.poolByPair(token0, token1);
```

2. **Check block explorer**:
   - Go to https://explorer.dukong.io
   - Look for pool creation events

3. **Use Quickswap interface**:
   - Find pool in UI
   - Extract address from URL

### Bot runs but no rebalancing occurs

**Check**:

1. **Is price moving enough?**
   - Check logs for "Price impact: X%"
   - May need larger swaps

2. **Vault rebalancing threshold**:
   - Verify your vault's trigger percentage
   - May need more extreme price movement

3. **Vault contract state**:
   - Check if vault is paused
   - Verify vault has liquidity

## Best Practices

### Before Testing

1. ✅ Use a dedicated testnet wallet
2. ✅ Start with small amounts
3. ✅ Monitor in one terminal, trade in another
4. ✅ Document your vault's rebalancing parameters
5. ✅ Have sufficient testnet tokens

### During Testing

1. ✅ Watch both bot logs and vault transactions
2. ✅ Take notes on what triggers rebalancing
3. ✅ Monitor gas usage
4. ✅ Check pool liquidity remains healthy
5. ✅ Stop immediately if something looks wrong

### After Testing

1. ✅ Review bot logs (`bot-activity.log`)
2. ✅ Check vault performance metrics
3. ✅ Document successful strategies
4. ✅ Clean up: stop monitoring, review final state
5. ✅ Archive logs for future reference

## Examples Repository

Check `src/examples/` for:
- `monitor-example.ts` - Pool monitoring
- `single-trade.ts` - Single swap test
- `custom-strategy.ts` - Multi-phase test

Customize these for your specific needs!

---

**Need more help?** Check [README.md](README.md) and [SETUP.md](SETUP.md) or review the source code comments.

