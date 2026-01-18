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

## 🚀 Quick Start

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

## 📦 Testnet Addresses

### DEX Contracts

**QuickSwap (Algebra v4 fork)**
- Factory: `0x10253594A832f967994b44f33411940533302ACb`
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

**Network**: Dukong Testnet
**Last Updated**: 2026-01-18
**Version**: 1.0
**Status**: Ready for Testing

## Quick Links

- 🌐 [DApp](https://mantra-lst-frontend.vercel.app/vault)
- 🔍 [Explorer](https://explorer.dukong.io)
- 📖 [Test Plan](./LP_VAULT_TEST_PLAN.md)
- 🎮 [Price Mover Guide](./PRICE_MOVER_README.md)
- 🖥️ [DApp Testing Guide](./DAPP_TESTING_GUIDE.md)
