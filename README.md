# Quickswap Testnet Bot

Trading + monitoring utilities for **testing CLM (concentrated liquidity) vault rebalancing** on Quickswap/Algebra on the **Mantra Dukong testnet**.

## What’s built

- **Quickswap/Algebra client** (`src/contracts/QuickswapClient.ts`)
  - Reads pool state (`globalState`, tick, liquidity, token metadata)
  - Gets swap quotes via **QuoterV2**
  - Executes swaps via **SwapRouter** (with ERC20 approvals)
- **Trading bot runner** (`src/bot/TradingBot.ts`)
  - Strategy orchestration + balance logging + before/after pool snapshots
  - Supported strategies:
    - `volatility` (alternate directions)
    - `pump_token0` / `pump_token1` (one-way sequences)
    - `single_swap`
    - `continuous` (runs until Ctrl+C)
    - `target_impact` (swap until impact target reached)
- **Pool monitor** (`src/utils/PoolMonitor.ts`)
  - Poll-based monitoring with snapshots + end-of-run stats (min/max, change %, volatility)
- **Example scripts** (`src/examples/`)
  - `monitor-example.ts` (monitor only)
  - `single-trade.ts` (one large swap)
  - `custom-strategy.ts` (multi-phase scenario)
  - `list-pools.ts` (scan factory logs for created pools; optionally enrich with token symbols)
- **Logging**
  - Console + `bot-activity.log` + `bot-error.log`

## How to use

### Prereqs

- Node.js **18+**
- A **dedicated testnet wallet** funded with:
  - **OM** (gas)
  - The **pool tokens** you plan to trade

### Setup

```bash
npm install
cp env.example .env
```

Edit `.env`:
- `PRIVATE_KEY`: **0x-prefixed** private key for a testnet wallet
- `POOL_ADDRESSES`: one or more pool addresses (comma-separated)

### Run

```bash
# build + run compiled JS
npm run build
npm start

# or run TS directly (dev)
npm run dev
```

### Useful commands

```bash
# monitor the first pool in POOL_ADDRESSES
npm run monitor

# execute a single example trade (uses first pool in POOL_ADDRESSES)
npm run single-trade

# run a multi-phase scenario (volatility -> pump -> pump back)
npm run custom-strategy

# scan factory events for pools
npm run list-pools

# scan factory events and also fetch token symbols/decimals
npm run list-pools -- --with-symbols
```

## Configuration (env)

All configuration lives in `src/config.ts` and is loaded via `dotenv`.

- **Required**:
  - `PRIVATE_KEY`
  - `POOL_ADDRESSES` (required for examples; bot will refuse to trade without it)
- **Common knobs**:
  - `SWAP_AMOUNT_OM` (amount per swap, string)
  - `SWAP_INTERVAL_MS` (delay between swaps)
  - `PRICE_IMPACT_TARGET` (used by `target_impact`)
  - `MAX_SLIPPAGE_PERCENT`
  - `LOG_LEVEL` (`error|warn|info|debug`)

See `env.example` for a complete template.

## Notes / safety

- **Testnet only**. Don’t use a mainnet wallet or real funds.
- `.env` is gitignored; don’t commit private keys.
- `list-pools` relies on `eth_getLogs`; if your RPC doesn’t support logs, pass an RPC that does:
  - `npm run list-pools -- --rpc-url https://<evm-rpc> --with-symbols`

## Legacy price-mover scripts (Hardhat)

The prior testing repo is integrated under `tools/testing-lp-vaults/`. These scripts include
batch scenarios and a `price-mover` CLI for QuickSwap and Lotus. They use Hardhat + ethers v5
and are kept isolated to avoid dependency conflicts.

```bash
cd tools/testing-lp-vaults
npm install
export TESTNET_RPC_URL=https://rpc.dukong.mantrachain.io
export PRIVATE_KEY=your_private_key
node scripts/price-mover.js quickswap WETH/USDC small-up
```

Docs:
- `tools/testing-lp-vaults/README.md`
- `tools/testing-lp-vaults/PRICE_MOVER_README.md`

## More docs

- **Quick start**: `QUICKSTART.md`
- **Setup details**: `SETUP.md`
- **Usage guide**: `USAGE.md`
- **Contracts (testnet)**: `CONTRACTS.md`

