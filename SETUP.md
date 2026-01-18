# Setup Guide

This guide will walk you through setting up the Quickswap Testnet Trading Bot for testing CLM vault rebalancing.

## Prerequisites

### 1. Node.js and npm

Ensure you have Node.js v18 or higher installed:

```bash
node --version
npm --version
```

If not installed, download from [nodejs.org](https://nodejs.org/)

### 2. Get Testnet Wallet

You'll need a wallet with a private key for the Mantra Dukong testnet.

**Option A: Use MetaMask**
1. Create a new account in MetaMask
2. Export the private key (Settings → Security & Privacy → Reveal Private Key)
3. **Important**: Use a fresh wallet, never your mainnet wallet!

**Option B: Create with ethers.js**
```bash
node -e "const ethers = require('ethers'); const wallet = ethers.Wallet.createRandom(); console.log('Address:', wallet.address); console.log('Private Key:', wallet.privateKey);"
```

### 3. Add Mantrachain Testnet to MetaMask

Network Configuration:
- **Network Name**: Mantra Dukong Testnet
- **RPC URL**: `https://rpc.dukong.mantrachain.io`
- **Chain ID**: `96970`
- **Currency Symbol**: `OM`
- **Block Explorer**: `https://explorer.dukong.io`

### 4. Get Testnet Tokens

You'll need:
1. **Native OM tokens** (for gas fees)
2. **Pool tokens** (the tokens in the pools you want to trade)

**Finding Testnet Faucets:**
- Check Mantrachain documentation for faucet links
- Ask in Mantrachain Discord/Telegram
- If you're on a team, ask your colleagues for testnet tokens

## Installation Steps

### 1. Clone/Download the Project

If you have the project files, navigate to the directory:

```bash
cd quickswap-testnet-bot
```

### 2. Install Dependencies

```bash
npm install
```

This will install:
- `ethers` (v6.9.0) - Ethereum library
- `dotenv` - Environment variable management
- `winston` - Logging
- TypeScript and related dev dependencies

### 3. Create Configuration File

Copy the example environment file:

```bash
cp .env.example .env
```

### 4. Configure Your Environment

Edit `.env` with your details:

```env
# Network Configuration
RPC_URL=https://rpc.dukong.mantrachain.io
CHAIN_ID=96970

# Wallet Configuration (REQUIRED)
PRIVATE_KEY=your_private_key_here_without_0x_prefix

# Trading Configuration
SWAP_AMOUNT_OM=1.0                    # Amount to swap per transaction
PRICE_IMPACT_TARGET=5.0               # Target price impact percentage
SWAP_INTERVAL_MS=30000                # 30 seconds between swaps
MAX_SLIPPAGE_PERCENT=10               # Maximum acceptable slippage

# Pool Addresses (REQUIRED)
# Add the Quickswap pool addresses you want to test
# Separate multiple pools with commas
POOL_ADDRESSES=0xYourPoolAddress1,0xYourPoolAddress2

# Logging
LOG_LEVEL=info
```

### 5. Find Pool Addresses

You need the addresses of Quickswap/Algebra pools on Mantrachain testnet.

**Option A: From Quickswap Interface**
- Visit Quickswap on Mantrachain testnet
- Navigate to the pool you're interested in
- Copy the pool contract address from the URL or interface

**Option B: From Factory Contract**
You can query the AlgebraFactory contract (`0x10253594A832f967994b44f33411940533302ACb`) to find pools.

**Option C: From Block Explorer**
- Visit https://explorer.dukong.io
- Search for the AlgebraFactory contract
- Look at recent pool creation events

### 6. Build the Project

```bash
npm run build
```

This compiles TypeScript to JavaScript in the `dist/` folder.

### 7. Verify Setup

Check your wallet balance:

```bash
npm run dev
```

If everything is configured correctly, you should see:
- Bot initialization messages
- Your wallet address
- Network information

If you see "No pool addresses configured", add pool addresses to your `.env` file.

## Testing Your Setup

### Test 1: Check Pool Info

Create a simple test script `test-setup.ts`:

```typescript
import { QuickswapClient } from './src/contracts/QuickswapClient';
import { config } from './src/config';

async function test() {
  const client = new QuickswapClient();
  
  console.log('Wallet:', client.getWalletAddress());
  console.log('Native balance:', await client.getNativeBalance());
  
  if (config.poolAddresses.length > 0) {
    const poolInfo = await client.getPoolInfo(config.poolAddresses[0]);
    console.log('Pool:', poolInfo.token0Symbol, '/', poolInfo.token1Symbol);
    console.log('Price:', poolInfo.currentPrice.toString());
  }
}

test();
```

Run it:
```bash
npx ts-node test-setup.ts
```

### Test 2: Monitor a Pool

```bash
npx ts-node src/examples/monitor-example.ts
```

This should start monitoring the pool without executing any trades.

### Test 3: Execute a Single Swap

Once you have tokens:

```bash
npx ts-node src/examples/single-trade.ts
```

## Common Setup Issues

### Issue: "PRIVATE_KEY is required"

**Solution**: Ensure your `.env` file has a valid private key:
```env
PRIVATE_KEY=abc123...  # Your actual private key, without 0x prefix
```

### Issue: "No pool addresses configured"

**Solution**: Add pool addresses to `.env`:
```env
POOL_ADDRESSES=0xPoolAddress1,0xPoolAddress2
```

### Issue: "Insufficient funds"

**Solution**: 
1. Check your wallet balance
2. Get testnet tokens from faucet
3. Ensure you have both tokens in the trading pair

### Issue: "Cannot connect to RPC"

**Solution**:
1. Check your internet connection
2. Verify RPC URL is correct
3. Try alternative RPC if available

### Issue: "Transaction reverted"

**Solution**:
1. Check you have enough token balance
2. Increase `MAX_SLIPPAGE_PERCENT` in `.env`
3. Reduce `SWAP_AMOUNT_OM`
4. Verify pool has sufficient liquidity

## Security Checklist

Before running the bot:

- [ ] Using a dedicated testnet wallet (not your mainnet wallet)
- [ ] `.env` file is in `.gitignore`
- [ ] Never committed private keys to Git
- [ ] Only testing on testnet (Chain ID 96970)
- [ ] Backed up your private key securely

## Next Steps

Once setup is complete:

1. Review the [README.md](README.md) for usage instructions
2. Check out example scripts in `src/examples/`
3. Start with small swap amounts
4. Monitor your CLM vault while the bot runs
5. Adjust strategies based on your testing needs

## Getting Help

If you encounter issues:

1. Check the logs in `bot-error.log`
2. Enable debug logging: `LOG_LEVEL=debug` in `.env`
3. Review the Mantrachain documentation
4. Check the Mantrachain Discord/community

---

**Ready to test!** 🚀

Proceed to [README.md](README.md) for usage instructions.

