# Quickswap Testnet Trading Bot

A sophisticated trading bot designed to test CLM (Concentrated Liquidity Market) vault rebalancing on Quickswap's Mantrachain testnet deployment.

## 🎯 Purpose

This bot helps test CLM vault rebalancing by:
- Creating price volatility in liquidity pools
- Executing directional price movements (pumps)
- Monitoring pool state changes in real-time
- Providing detailed logging and statistics

## 🏗️ Architecture

The bot is built with TypeScript and ethers.js v6, featuring:

- **QuickswapClient**: Core client for interacting with Quickswap/Algebra contracts
- **PriceManipulator**: Advanced strategies for price manipulation
- **TradingBot**: Main orchestrator with multiple trading strategies
- **PoolMonitor**: Real-time pool monitoring and statistics

## 📋 Prerequisites

- Node.js v18 or higher
- npm or yarn
- A wallet with testnet OM tokens (MANTRA testnet)
- Testnet tokens for the pools you want to trade

## 🚀 Quick Start

### 1. Installation

```bash
npm install
```

### 2. Configuration

Create a `.env` file in the project root:

```bash
cp .env.example .env
```

Edit `.env` with your configuration:

```env
# Mantrachain Testnet Configuration
RPC_URL=https://rpc.dukong.mantrachain.io
CHAIN_ID=96970

# Your wallet private key (NEVER commit this!)
PRIVATE_KEY=your_private_key_here

# Trading Configuration
SWAP_AMOUNT_OM=1.0
PRICE_IMPACT_TARGET=5.0
SWAP_INTERVAL_MS=30000
MAX_SLIPPAGE_PERCENT=10

# Pool Addresses (comma-separated)
POOL_ADDRESSES=0xYourPoolAddress1,0xYourPoolAddress2

# Logging
LOG_LEVEL=info

# Advanced (optional overrides)
POOL_DEPLOYER=0x10253594A832f967994b44f33411940533302ACb
QUOTER=0x03f8B4b140249Dc7B2503C928E7258CCe1d91F1A
```

### 3. Build

```bash
npm run build
```

### 4. Run

```bash
npm start
```

Or for development with auto-reload:

```bash
npm run dev
```

## 📊 Trading Strategies

The bot supports six different strategies:

### 1. Volatility Strategy (Default)
Alternates between buying and selling to create price volatility.

```typescript
const botConfig: BotConfig = {
  poolAddress: '0x...',
  strategy: BotStrategy.VOLATILITY,
  numberOfSwaps: 6,
  amountPerSwap: '1.0',
  delayBetweenSwapsMs: 30000,
};
```

### 2. Pump Token0
Executes multiple swaps in the Token0 → Token1 direction to pump Token1 price.

```typescript
const botConfig: BotConfig = {
  poolAddress: '0x...',
  strategy: BotStrategy.PUMP_TOKEN0,
  numberOfSwaps: 5,
  amountPerSwap: '2.0',
  delayBetweenSwapsMs: 15000,
};
```

### 3. Pump Token1
Executes multiple swaps in the Token1 → Token0 direction to pump Token0 price.

```typescript
const botConfig: BotConfig = {
  poolAddress: '0x...',
  strategy: BotStrategy.PUMP_TOKEN1,
  numberOfSwaps: 5,
  amountPerSwap: '2.0',
  delayBetweenSwapsMs: 15000,
};
```

### 4. Single Swap
Executes a single directional swap.

```typescript
const botConfig: BotConfig = {
  poolAddress: '0x...',
  strategy: BotStrategy.SINGLE_SWAP,
  amountPerSwap: '5.0',
  swapDirection: SwapDirection.TOKEN0_TO_TOKEN1,
};
```

### 5. Continuous Strategy
Runs indefinitely, alternating swaps until stopped (Ctrl+C).

```typescript
const botConfig: BotConfig = {
  poolAddress: '0x...',
  strategy: BotStrategy.CONTINUOUS,
  amountPerSwap: '1.0',
  delayBetweenSwapsMs: 60000,
};
```

### 6. Target Impact
Swaps until the target price impact is reached (or max swaps).

```typescript
const botConfig: BotConfig = {
  poolAddress: '0x...',
  strategy: BotStrategy.TARGET_IMPACT,
  amountPerSwap: '1.0',
  numberOfSwaps: 20,
  targetPriceImpactPercent: 5.0,
  swapDirection: SwapDirection.TOKEN0_TO_TOKEN1,
};
```

## 🔧 Advanced Usage

### Custom Script Example

Create a custom script in `src/examples/`:

```typescript
import { TradingBot, BotStrategy } from '../bot/TradingBot';
import { validateConfig } from '../config';

async function customTest() {
  validateConfig();
  
  const bot = new TradingBot();
  
  // Strategy 1: Create volatility
  await bot.start({
    poolAddress: '0xYourPoolAddress',
    strategy: BotStrategy.VOLATILITY,
    numberOfSwaps: 10,
    amountPerSwap: '1.5',
    delayBetweenSwapsMs: 20000,
  });
  
  // Wait 5 minutes
  await new Promise(resolve => setTimeout(resolve, 300000));
  
  // Strategy 2: Pump in one direction
  await bot.start({
    poolAddress: '0xYourPoolAddress',
    strategy: BotStrategy.PUMP_TOKEN0,
    numberOfSwaps: 5,
    amountPerSwap: '3.0',
    delayBetweenSwapsMs: 30000,
  });
}

customTest().catch(console.error);
```

### Pool Monitoring Only

Monitor a pool without trading:

```typescript
import { QuickswapClient } from './contracts/QuickswapClient';
import { PoolMonitor } from './utils/PoolMonitor';

const client = new QuickswapClient();
const monitor = new PoolMonitor(client);

// Monitor for 10 minutes
monitor.startMonitoring('0xYourPoolAddress', 10000);

// Stop after 10 minutes and print stats
setTimeout(async () => {
  monitor.stopMonitoring();
  await monitor.printStats('0xYourPoolAddress');
}, 600000);
```

## 📝 Contract Addresses (Mantra Dukong Testnet)

The bot automatically uses these testnet contracts:

- **SwapRouter**: `0x3012E9049d05B4B5369D690114D5A5861EbB85cb`
- **QuoterV2**: `0xa77aD9f635a3FB3bCCC5E6d1A87cB269746Aba17`
- **AlgebraFactory**: `0x10253594A832f967994b44f33411940533302ACb`
- **NonfungiblePositionManager**: `0x69D57B9D705eaD73a5d2f2476C30c55bD755cc2F`

Source: [Mantrachain Documentation](https://docs.mantrachain.io/resources/contracts/testnet)

## 📊 Logging

The bot provides comprehensive logging:

- **Console**: Real-time colored output
- **bot-activity.log**: All bot activities
- **bot-error.log**: Errors only

Log levels: `error`, `warn`, `info`, `debug`

Set in `.env`:
```env
LOG_LEVEL=info
```

## 🧪 Testing CLM Vault Rebalancing

To effectively test vault rebalancing:

1. **Identify your CLM vault's rebalancing thresholds**
   - Usually triggers when price moves X% from the center

2. **Start with Volatility Strategy**
   - Creates rapid price movements in both directions
   - Good for testing bidirectional rebalancing

3. **Use Pump Strategies for edge cases**
   - Test what happens when price moves strongly in one direction
   - Useful for testing range boundaries

4. **Monitor concurrently**
   - Run the bot in one terminal
   - Monitor your vault in another
   - Watch for rebalancing transactions

### Recommended Test Sequence

```bash
# Terminal 1: Monitor the pool
npm run dev -- monitor 0xYourPoolAddress

# Terminal 2: Run trading strategies
npm run dev
```

## ⚠️ Important Notes

### Safety

- **This is for TESTNET only!** Never use on mainnet.
- Store your private key securely
- Never commit `.env` file to version control
- Use a dedicated testnet wallet

### Performance

- Adjust `SWAP_INTERVAL_MS` based on block time
- Larger `SWAP_AMOUNT` = more price impact
- Monitor gas costs (even on testnet)

### Troubleshooting

**"Insufficient balance" error:**
- Get testnet tokens from faucet
- Ensure you have both tokens in the pair

**"Transaction reverted" error:**
- Increase `MAX_SLIPPAGE_PERCENT`
- Reduce `SWAP_AMOUNT_OM`
- Check pool liquidity

**"No pool addresses configured":**
- Add pool addresses to `.env`
- Find pools on testnet explorer

## 🔗 Resources

- [Mantrachain Docs](https://docs.mantrachain.io)
- [Quickswap Testnet Contracts](https://docs.mantrachain.io/resources/contracts/testnet)
- [Mantrachain Testnet Explorer](https://explorer.dukong.io)
- [Mantrachain Testnet RPC](https://rpc.dukong.mantrachain.io)

## 📜 License

MIT

## 🤝 Contributing

This is a testing tool. Feel free to customize for your specific needs.

## 💡 Tips

1. **Start small**: Test with small amounts first
2. **Monitor closely**: Watch both pool and vault
3. **Adjust timing**: Find the right interval for your tests
4. **Document results**: Keep notes on what triggers rebalancing
5. **Test edge cases**: Try extreme price movements

---

**Built for testing CLM vault rebalancing on Quickswap/Mantrachain testnet** 🚀

