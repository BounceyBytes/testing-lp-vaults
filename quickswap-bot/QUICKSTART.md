# Quick Start Guide

Get up and running in 5 minutes!

## Prerequisites Checklist

- [ ] Node.js v18+ installed
- [ ] Testnet wallet with private key
- [ ] Testnet OM tokens (for gas)
- [ ] Testnet pool tokens
- [ ] Pool address(es) you want to test

## Setup (5 Steps)

### 1. Install Dependencies

```bash
npm install
```

### 2. Create Configuration

```bash
cp .env.example .env
```

### 3. Edit .env File

```env
PRIVATE_KEY=your_testnet_wallet_private_key
POOL_ADDRESSES=0xYourPoolAddress1,0xYourPoolAddress2
```

### 4. Build

```bash
npm run build
```

### 5. Run

```bash
npm run dev
```

## First Test

Start with monitoring (no trading):

```bash
npm run monitor
```

This will show you:
- Pool information
- Current price
- Real-time updates

Press Ctrl+C to stop.

## First Trade

Execute a single test swap:

```bash
npm run single-trade
```

This will:
- Execute one swap
- Show price impact
- Log results

## Watch for CLM Rebalancing

### Terminal 1: Monitor Pool
```bash
npm run monitor
```

### Terminal 2: Run Bot
```bash
npm run dev
```

### Terminal 3: Watch Vault
Check your vault contract on block explorer:
```
https://explorer.dukong.io/address/YOUR_VAULT_ADDRESS
```

Look for rebalancing transactions!

## Available Strategies

Edit `src/index.ts` to change strategy:

### Volatility (Default)
Creates price swings back and forth
```typescript
strategy: BotStrategy.VOLATILITY
```

### Pump Token0
Pushes price up consistently
```typescript
strategy: BotStrategy.PUMP_TOKEN0
```

### Pump Token1
Pushes price down consistently
```typescript
strategy: BotStrategy.PUMP_TOKEN1
```

### Single Swap
Just one trade
```typescript
strategy: BotStrategy.SINGLE_SWAP
```

### Continuous
Runs until you stop it (Ctrl+C)
```typescript
strategy: BotStrategy.CONTINUOUS
```

## Adjusting Impact

### Bigger Price Moves

In `.env`:
```env
SWAP_AMOUNT_OM=5.0          # Increase amount
SWAP_INTERVAL_MS=15000      # Faster swaps
```

### Gentler Price Moves

```env
SWAP_AMOUNT_OM=0.5          # Decrease amount
SWAP_INTERVAL_MS=60000      # Slower swaps
```

## Common Commands

```bash
# Development mode (recommended)
npm run dev

# Production mode
npm start

# Monitor only
npm run monitor

# Single trade test
npm run single-trade

# Custom multi-phase strategy
npm run custom-strategy

# Build project
npm run build
```

## Troubleshooting

### "No pool addresses configured"
➜ Add pool addresses to `.env`

### "Insufficient balance"
➜ Get more testnet tokens

### "Transaction reverted"
➜ Increase `MAX_SLIPPAGE_PERCENT` in `.env`

### Price not moving much
➜ Increase `SWAP_AMOUNT_OM`

## Getting Testnet Tokens

1. **Native OM**: Ask Mantrachain team or use faucet
2. **Pool tokens**: Check with your team or find testnet faucets

## Network Info

- **RPC**: `https://rpc.dukong.mantrachain.io`
- **Chain ID**: `96970`
- **Explorer**: `https://explorer.dukong.io`

## Next Steps

1. ✅ Run monitor to understand pool behavior
2. ✅ Execute single swap to see impact
3. ✅ Run volatility strategy
4. ✅ Watch your CLM vault for rebalancing
5. ✅ Adjust parameters as needed
6. ✅ Try different strategies

## Need More Help?

- **Setup Details**: See [SETUP.md](SETUP.md)
- **Usage Guide**: See [USAGE.md](USAGE.md)
- **Full Documentation**: See [README.md](README.md)
- **Contract Info**: See [CONTRACTS.md](CONTRACTS.md)

## Example: Complete Test

```bash
# Terminal 1
npm run monitor

# Terminal 2
# Edit src/index.ts to configure your pool and strategy
npm run dev

# Terminal 3
# Watch block explorer for your vault address
# Look for rebalancing transactions
```

## Safety Reminders

- ⚠️ Testnet only! Never use on mainnet
- ⚠️ Use dedicated testnet wallet
- ⚠️ Don't commit .env file
- ⚠️ Start with small amounts

---

**Ready to test!** 🚀

Questions? Check the full documentation or ask your team.

