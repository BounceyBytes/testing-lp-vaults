# LP Vault Testing Suite

Comprehensive testing infrastructure for LP (Concentrated Liquidity Market) vaults on QuickSwap and Lotus DEX.

## 🎯 Overview

This repository contains everything you need to thoroughly test your LP vault contracts on the Dukong testnet before deploying to mainnet.

**Network**: Dukong Testnet
**DApp**: https://mantra-lst-frontend.vercel.app/vault
**Explorer**: https://explorer.dukong.io

## 📋 What's Included

### 1. Test Plan (`LP_VAULT_TEST_PLAN.md`)
Comprehensive 400+ point test plan covering:
- Pre-deployment checks
- Core functionality (deposits, withdrawals, fees)
- Rebalancing mechanisms
- Security testing
- Cross-DEX comparison
- Gas optimization
- Edge cases and stress testing

### 2. Price Movement Scripts
Automated scripts to manipulate prices on QuickSwap and Lotus DEX for testing:

**`scripts/price-mover.js`** - Single scenario execution
- Small moves (2-5%)
- Large moves (10-20%)
- Out-of-range moves (20%+) for rebalancing tests
- Volatility simulation
- Gradual drift

**`scripts/batch-price-scenarios.js`** - Batch testing
- Runs multiple scenarios across all pairs
- Tests both DEXs simultaneously
- Provides summary reports

### 3. DApp Testing Guide (`DAPP_TESTING_GUIDE.md`)
Step-by-step frontend testing workflows:
- Wallet connection and UI testing
- Deposit/withdrawal flows
- Fee collection verification
- Rebalancing testing
- Multi-vault management
- Cross-DEX comparison
- Edge cases and error handling

### 4. Configuration Files
- `testnet-config.json` - DEX addresses and token configurations
- `hardhat.config.js` - Hardhat setup for testnet
- `package.json` - Dependencies and scripts
- `.env.example` - Environment variable template

### 5. TypeScript Quickswap Bot (`quickswap-bot/`)
A TypeScript trading + monitoring bot for targeted price impact testing on QuickSwap/Algebra, including a target-impact strategy and pool monitoring utilities.

## 🚀 Quick Start (Price Mover)

### 1. Install Dependencies

```bash
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your testnet RPC URL and private key
```

### 3. Run Price Movement Tests

```bash
# Single scenario
node scripts/price-mover.js quickswap WETH/USDC small-up

# Batch scenarios
node scripts/batch-price-scenarios.js
```

### 4. Test the DApp

1. Open https://mantra-lst-frontend.vercel.app/vault
2. Connect your wallet (Dukong Testnet)
3. Follow the workflows in `DAPP_TESTING_GUIDE.md`
4. Use price mover scripts to create different market conditions

---

## 🧪 CLM Vault Comprehensive Testing

### Quick Command

```bash
npm run test-vaults
```

This runs the comprehensive CLM vault test suite against all deployed vaults, executing price movement scenarios and tracking detailed metrics.

### What It Tests

The test suite executes swap scenarios on each vault and tracks how the vault responds:

| Scenario | Description | Swap Size |
|----------|-------------|-----------|
| `small-up` | Small price increase | 0.01 ETH / 1 USDC |
| `small-down` | Small price decrease | 0.01 ETH / 1 USDC |
| `large-up` | Large price increase | 0.1 ETH / 10 USDC |
| `large-down` | Large price decrease | 0.1 ETH / 10 USDC |

### Vaults Under Test

| Vault | Address | DEX | Pair |
|-------|---------|-----|------|
| Lotus WETH-USDT | `0x1e27612d5240d25b70608cdabe1446e67ae7c48f` | Lotus | WETH/USDT |
| Lotus WBTC-USDC | `0xacd6e64e56f66e4f010709d54686792ea96b7230` | Lotus | WBTC/USDC |
| Lotus USDC-USDT | `0xbbbd57224d28ec578dfe4adc4f50a524804251fe` | Lotus | USDC/USDT |
| QuickSwap USDC-USDT | `0xd1ea7f32f9530eac27b314454db4964dbc08cdca` | QuickSwap | USDC/USDT (⚠️ skipped) |

### Metrics Tracked

The test suite captures comprehensive CLM vault metrics before and after each swap:

#### 1. DEX-Level Price & Ticks (Ground Truth)

| Metric | Description |
|--------|-------------|
| `dexLevel.tick` | Current pool tick |
| `dexLevel.price` | Current price derived from sqrtPriceX96 |
| `position.tickLower` | Position's lower tick boundary |
| `position.tickUpper` | Position's upper tick boundary |
| `position.tickSpan` | Range width (upperTick - lowerTick) |

#### 2. Range Status (In-Range / Out-of-Range)

| Metric | Description |
|--------|-------------|
| `rangeStatus.isInRange` | Whether current tick is within position |
| `rangeStatus.singleSidedExposure` | `"token0_only"`, `"token1_only"`, or `"both"` |
| `rangeStatus.distanceToLowerTick` | Ticks from lower boundary |
| `rangeStatus.distanceToUpperTick` | Ticks from upper boundary |
| `rangeStatus.percentInRange` | Position within range (0-100%) |

#### 3. Token Composition

| Metric | Description |
|--------|-------------|
| `tokenComposition.token0Pct` | % of vault value in token0 |
| `tokenComposition.token1Pct` | % of vault value in token1 |
| `amount0` / `amount1` | Raw token balances in vault |

#### 4. Fee Accrual & Compounding

| Metric | Description |
|--------|-------------|
| `fees.feeGrowthActive` | `true` if in-range (earning fees), `false` if out |
| `fees.unclaimedFees0` / `fees.unclaimedFees1` | Pending unclaimed fees |
| `fees.totalUnclaimedValueInToken1` | Total unclaimed fees in token1 terms |

#### 5. Share Accounting

| Metric | Description |
|--------|-------------|
| `shareAccounting.pricePerShare` | PPFS (Price Per Full Share) |
| `shareAccounting.tvl` | Total Value Locked in token1 terms |
| `shareAccounting.userShares` | Your share balance (should stay constant) |
| `shareAccounting.userShareValue` | Your share value (changes with price/fees) |

#### 6. Deltas (Changes After Swap)

| Metric | Description |
|--------|-------------|
| `deltas.tickChange` | Tick movement |
| `deltas.priceChangePercent` | Price % change |
| `deltas.token0CompositionShift` | Composition shift in token0 % |
| `deltas.pricePerShareChangePercent` | PPFS % change |
| `deltas.tvlChangePercent` | TVL % change |
| `deltas.userValueChangePercent` | User value % change |

#### 7. Diagnostics (Bug Detection)

| Flag | Detects |
|------|---------|
| `diagnostics.inRangeButNoFeeGrowth` | Fees not accruing while in-range → **bug** |
| `diagnostics.positionWentOutOfRange` | Price crossed boundary → **warning** |
| `diagnostics.rangeStatusChanged` | Position crossed in/out of range |

### Sample Output

```
════════════════════════════════════════════════════════════════════════════════
📊 Testing: Lotus WETH-USDT
   Vault: 0x1e27612d5240d25b70608cdabe1446e67ae7c48f
   Pool: 0x16614FCF1b082e021349F7Dc5aFE22d96641e71C
════════════════════════════════════════════════════════════════════════════════

  📈 INITIAL STATE:
    ══════════════════════════════════════════════════════════
    📍 DEX-LEVEL PRICE & TICKS (Ground Truth)
    ══════════════════════════════════════════════════════════
      Current Tick: 83140
      Current Price: 4079.08562656 USDT/WETH
      Position Lower Tick: -1963632
      Position Upper Tick: 1349380
      Tick Span: 3313012 ticks
    ──────────────────────────────────────────────────────────
    📊 RANGE STATUS
      Status: ✅ IN RANGE (earning fees)
      Exposure: Both tokens (WETH + USDT)
      Distance to Lower: 2046772 ticks
      Distance to Upper: 1266240 ticks
      Position in Range: 61.78%
    ──────────────────────────────────────────────────────────
    💰 TOKEN BALANCES & COMPOSITION
      WETH: 10.484451
      USDT: 42235.473401
      Composition: 50.31% WETH / 49.69% USDT
    ──────────────────────────────────────────────────────────
    💸 FEE ACCRUAL
      Fee Growth: ✅ ACTIVE (in range)
      Unclaimed WETH: 0.00000000
      Unclaimed USDT: 0.00000000
    ──────────────────────────────────────────────────────────
    📈 SHARE ACCOUNTING
      Total Supply: 171820.738200 shares
      Price Per Share (PPFS): 0.49471587
      Total TVL: 85002.45 USDT
      Your Shares: 404.036278
      Your Value: 199.883158 USDT

  🧪 Scenario: large-up
    Swapping 0.1 WETH → USDT
    ✅ Swap successful!

    📊 CHANGES AFTER SWAP:
      Tick: 83140 → 83136 (-4)
      Price: 4079.08 → 4077.66 (-0.0318%)
      WETH Composition: 50.31% → 50.41% (+0.09%)
      PPFS: 0.49471 → 0.49463 (-0.016%)
      Your Value: 199.88 → 199.85 USDT (-0.016%)

  ✅ large-up PASSED
```

### Test Results

Results are saved to `test-results/clm-vault-test-<timestamp>.json` with full metric data for each scenario.

### Known Limitations

| Limitation | Description |
|------------|-------------|
| **QuickSwap Skipped** | The Algebra router requires a `deployer` parameter that differs from standard UniV3. QuickSwap vault tests are currently skipped pending interface investigation. |
| **Unclaimed Fees Always 0** | The vaults may auto-compound fees, or the fee tracking contract methods differ. Fees show as 0 in the current implementation. |
| **Extremely Wide Tick Ranges** | Current testnet vaults have ranges of ±7M ticks (essentially infinite). This means out-of-range scenarios cannot be tested without massive price swings. |
| **No Harvest Testing** | The test doesn't call `harvest()` to trigger fee compounding. PPFS changes from fees would only be visible after harvest. |
| **Rebalancer Not Active** | The `moveTicks()` rebalancing function requires an authorized rebalancer bot which may not be running on testnet. |

### Tick Math Reference

In Algebra V4 / Uniswap V3 pools:

```
price = 1.0001^tick
```

| Tick | Price | Change |
|------|-------|--------|
| 0 | 1.0000 | 0% |
| 100 | 1.0100 | +1% |
| 1,000 | 1.1052 | +10.5% |
| 10,000 | 2.7181 | +172% |
| 887,272 | 3.4×10³⁸ | MAX_TICK |

**1 tick = 0.01% price change (1 basis point)**

## 🚀 Quick Start (TypeScript Bot)

```bash
cd quickswap-bot
npm install
cp env.example .env
# Edit .env with PRIVATE_KEY + POOL_ADDRESSES
npm run build
npm start
```

See `quickswap-bot/README.md` for strategies and examples.

## 📦 Testnet Addresses

### DEX Contracts

**QuickSwap (Algebra v4 fork)**
- Factory: `0x10253594A832f967994b44f33411940533302ACb`
- **PoolDeployer**: `0xd7cB0E0692f2D55A17bA81c1fE5501D66774fC4A` ⚠️ *Required for swap `deployer` param*
- PositionManager: `0x69D57B9D705eaD73a5d2f2476C30c55bD755cc2F`
- Router: `0x3012E9049d05B4B5369D690114D5A5861EbB85cb`
- QuoterV2: `0xa77aD9f635a3FB3bCCC5E6d1A87cB269746Aba17`
- Quoter: `0x03f8B4b140249Dc7B2503C928E7258CCe1d91F1A`

**Lotus DEX (Uniswap v3 fork)**
- Factory: `0x17E1ebf15BE528b179d34148fB9aB2466555F605`
- PoolDeployer: `0x41B1E93A249d9635b12344E7976Ff8E4dD2CC9c1`
- SwapRouter: `0xae52Aa627D6eFAce03Fecd41a79DEEcbc168cb0c`
- NonfungiblePositionManager: `0x84fb9302f2232050bB30D0C15Cef44823153De6f`

### Token Contracts

| Token | Address | Explorer |
|-------|---------|----------|
| WBTC | `0x2A8E20Ba7aB3C3A90527EF0d2d970fd22f7C25AB` | [View](https://explorer.dukong.io/address/0x2A8E20Ba7aB3C3A90527EF0d2d970fd22f7C25AB) |
| WETH | `0x1398471040295884df72Bf1805e2720D2c5ae4728` | [View](https://explorer.dukong.io/address/0x1398471040295884df72Bf1805e2720D2c5ae4728) |
| USDC | `0xDcc8a320dc2Ce505bB37DAb4b47ECE8E3ad1864F` | [View](https://explorer.dukong.io/address/0xDcc8a320dc2Ce505bB37DAb4b47ECE8E3ad1864F) |
| USDT | `0xCDb248d19195e23a4cdffCa8a67dD8c7f97000D9` | [View](https://explorer.dukong.io/address/0xCDb248d19195e23a4cdffCa8a67dD8c7f97000D9) |

## 🔧 Available Scenarios

### Price Movement Scenarios

```bash
# Small moves (2-5%)
node scripts/price-mover.js <dex> <pair> small-up
node scripts/price-mover.js <dex> <pair> small-down

# Large moves (10-20%)
node scripts/price-mover.js <dex> <pair> large-up
node scripts/price-mover.js <dex> <pair> large-down

# Out-of-range (force rebalancing)
node scripts/price-mover.js <dex> <pair> out-of-range-up
node scripts/price-mover.js <dex> <pair> out-of-range-down

# Volatility simulation
node scripts/price-mover.js <dex> <pair> volatility

# Gradual drift
node scripts/price-mover.js <dex> <pair> gradual-up
node scripts/price-mover.js <dex> <pair> gradual-down
```

**DEX Options**: `quickswap`, `lotus`, `both`
**Pair Options**: `WETH/USDC`, `WETH/USDT`, `WBTC/WETH`, `MATIC/USDC`, `USDC/USDT`, `DAI/USDC`

## 📚 Documentation

| Document | Purpose |
|----------|---------|
| `LP_VAULT_TEST_PLAN.md` | Comprehensive test plan with 400+ test cases |
| `PRICE_MOVER_README.md` | Detailed guide for price movement scripts |
| `DAPP_TESTING_GUIDE.md` | Step-by-step dApp testing workflows |
| `README.md` | This file - quick reference |
| `quickswap-bot/README.md` | TypeScript bot usage and strategies |

## 🧪 Testing Workflow

### Recommended 6-Week Testing Schedule

**Week 1: Deployment & Core Functionality**
- Deploy contracts to testnet
- Test basic deposits/withdrawals
- Verify fee collection

**Week 2: Rebalancing & DEX Integration**
- Test automatic rebalancing
- Test manual rebalancing
- Verify QuickSwap integration
- Verify Lotus DEX integration

**Week 3: Security & Economic Testing**
- Security audit (reentrancy, access control, etc.)
- Economic testing (fee structure, multi-user scenarios)
- Attack vector testing

**Week 4: UX, Stress Testing & Documentation**
- DApp frontend testing
- Stress testing (concurrent users, large positions)
- Gas optimization verification
- Document findings

**Week 5: Bug Fixes & Re-testing**
- Fix all critical/high issues
- Re-test affected areas
- Verify fixes on testnet

**Week 6: Final Review & Mainnet Prep**
- External audit (recommended)
- Final security review
- Deployment script preparation
- Monitoring infrastructure setup

## 🎯 Major Testing Milestones

- [ ] All contracts deployed on testnet
- [ ] Basic deposit/withdrawal working
- [ ] Fee collection verified
- [ ] Rebalancing tested (both DEXs)
- [ ] Security testing complete
- [ ] DApp frontend tested comprehensively
- [ ] Cross-DEX comparison complete
- [ ] Stress testing passed
- [ ] All critical bugs fixed
- [ ] External audit completed
- [ ] Pre-mainnet checklist completed

## 🔍 Example Test Session

```bash
# Terminal 1: Start with basic price movements
node scripts/price-mover.js quickswap WETH/USDC small-up

# Browser: Open dApp and test deposit
# https://mantra-lst-frontend.vercel.app/vault

# Terminal 1: Generate fees
node scripts/price-mover.js quickswap WETH/USDC small-down
node scripts/price-mover.js quickswap WETH/USDC small-up

# Browser: Verify fees collected in dApp

# Terminal 1: Test rebalancing
node scripts/price-mover.js quickswap WETH/USDC out-of-range-up

# Browser: Verify vault rebalanced correctly

# Terminal 1: Test withdrawal after price movement
node scripts/price-mover.js quickswap WETH/USDC small-down

# Browser: Test withdrawal and verify amounts
```

## 🐛 Bug Reporting

Found an issue? Document it using this template:

```markdown
**Severity**: Critical / High / Medium / Low
**Component**: Frontend / Smart Contract / Integration
**Vault**: QuickSwap WETH/USDC (or specify)
**Description**: [Clear description]
**Steps to Reproduce**: [Numbered steps]
**Expected**: [What should happen]
**Actual**: [What happened]
**Transaction Hash**: [If applicable]
**Screenshots**: [Attach]
```

## 🎓 Prerequisites

Before testing, ensure you have:

- [ ] MetaMask (or compatible wallet) configured for Dukong Testnet
- [ ] Testnet tokens (WETH, USDC, USDT, WBTC)
- [ ] Node.js v16+ installed
- [ ] Basic understanding of LP/CLM mechanics
- [ ] Access to block explorer (explorer.dukong.io)

## 📊 Success Criteria

Testing is complete when:

- ✅ All 400+ test cases passed
- ✅ All critical/high severity bugs fixed
- ✅ Gas costs are acceptable
- ✅ Security audit passed
- ✅ DApp frontend works smoothly
- ✅ Cross-DEX comparison shows expected results
- ✅ Stress testing shows no issues
- ✅ Documentation is complete
- ✅ Team sign-off obtained

## 🔐 Security Notes

- **NEVER** commit private keys to git
- Use `.env` for sensitive data
- Test with testnet tokens only
- Verify all transactions on block explorer
- Keep detailed logs of all tests
- Use multiple test accounts
- Test with realistic amounts

## 🤝 Contributing

This is a testing repository. All tests should be:
- Documented with results
- Repeatable
- Verified on-chain
- Logged with transaction hashes

## 📞 Support

For issues or questions:
1. Check existing documentation
2. Review transaction on explorer
3. Check browser console for errors
4. Document the issue with full details

---

## 📐 Recommended CLM Vault Configurations

Based on analysis of the LP_Vaults codebase, here are recommended configurations for different pair types:

### 1. mantraUSD/USDC (New Stable + Major Stable)

```json
{
  "pair": "mantraUSD/USDC",
  "riskProfile": "medium",
  "strategyConfig": {
    "positionWidth": 50,
    "maxTickDeviation": 40,
    "maxHarvestTickDeviation": 20,
    "twapInterval": 600,
    "feeTier": 100
  },
  "rebalancer": {
    "checkInterval": "24h",
    "triggerThreshold": "0.5%"
  },
  "harvester": {
    "minInterval": "6h",
    "checkInterval": "12h"
  }
}
```

### 2. USDC/USDT (Major Stable + Major Stable)

```json
{
  "pair": "USDC/USDT",
  "riskProfile": "low",
  "strategyConfig": {
    "positionWidth": 10,
    "maxTickDeviation": 15,
    "maxHarvestTickDeviation": 10,
    "twapInterval": 600,
    "feeTier": 100
  },
  "rebalancer": {
    "checkInterval": "168h",
    "triggerThreshold": "0.05%"
  },
  "harvester": {
    "minInterval": "24h",
    "checkInterval": "48h"
  }
}
```

### 3. mantraUSD/MANTRA (New Stable + Volatile Token)

```json
{
  "pair": "mantraUSD/MANTRA",
  "riskProfile": "high",
  "strategyConfig": {
    "positionWidth": 300,
    "maxTickDeviation": 200,
    "maxHarvestTickDeviation": 100,
    "twapInterval": 1800,
    "feeTier": 3000
  },
  "rebalancer": {
    "checkInterval": "1h",
    "triggerThreshold": "5%",
    "critical": true
  },
  "harvester": {
    "minInterval": "2h",
    "checkInterval": "4h"
  },
  "warnings": [
    "High IL risk - rebalancer MUST be running",
    "Consider lower TVL cap until battle-tested"
  ]
}
```

### Configuration Summary

| Parameter | mantraUSD/USDC | USDC/USDT | mantraUSD/MANTRA |
|-----------|----------------|-----------|------------------|
| `positionWidth` | 50 | 10 | 300 |
| `maxTickDeviation` | 40 | 15 | 200 |
| `twapInterval` | 600s | 600s | 1800s |
| `feeTier` | 0.01% | 0.01% | 0.3% |
| **Rebalance Check** | 24h | Weekly | **1h** |

---

## 🏗️ CLM Vault Architecture Notes

The deployed CLM vaults use a **dual-position system**:

1. **positionMain** - 50/50 balanced position centered on current tick
2. **positionAlt** - Single-sided position for excess tokens

### Key Features

| Feature | Status | Notes |
|---------|--------|-------|
| Fee Collection | ✅ Implemented | Via `_claimEarnings()` |
| Auto-Compounding | ✅ Implemented | Fees re-added as liquidity after harvest |
| Rebalancing | ⚠️ Manual | Requires authorized rebalancer to call `moveTicks()` |
| Multi-Band | ❌ Not Supported | Only 2 positions (main + alt) |

### Important Functions

| Function | Who Can Call | Purpose |
|----------|--------------|---------|
| `harvest()` | Anyone (gets call fee) | Collect fees, charge protocol fees, recompound |
| `moveTicks()` | Authorized rebalancers only | Recenter position around current tick |
| `deposit()` | Anyone | Add liquidity to vault |
| `withdraw()` | Share holders | Remove liquidity proportionally |

---

**Network**: Dukong Testnet
**Last Updated**: 2026-01-22
**Version**: 2.0
**Status**: Ready for Testing

## Quick Links

- 🌐 [DApp](https://mantra-lst-frontend.vercel.app/vault)
- 🔍 [Explorer](https://explorer.dukong.io)
- 📖 [Test Plan](./LP_VAULT_TEST_PLAN.md)
- 🎮 [Price Mover Guide](./PRICE_MOVER_README.md)
- 🖥️ [DApp Testing Guide](./DAPP_TESTING_GUIDE.md)
- 🤖 [Quickswap Bot](./quickswap-bot/README.md)
- 🧪 [CLM Vault Source](https://github.com/protofire/LP_Vaults)
