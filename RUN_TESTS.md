# How to Run the Full Test Suite

This guide explains how to run the comprehensive LP Vault testing on Mantra Dukong testnet.

## Prerequisites

✅ All completed:
- Wallet funded with OM tokens (for gas)
- 1000 of each test token minted (WETH, USDC, USDT, WBTC)
- Dependencies installed (`npm install`)
- `.env` file configured

---

## Quick Commands

### Check Balances

```bash
# Check OM balance
npm run check-balance

# Check all token balances
npm run check-tokens
```

### Run Tests

```bash
# Quick test (6 essential tests, ~5-10 minutes)
npm run quick-test

# Full test suite (all scenarios, ~30-60 minutes)
npm run full-test

# Single test
npm run price-move -- quickswap WETH/USDC small-up

# Batch scenarios
npm run batch-test
```

---

## Test Options

### 1. Quick Test (Recommended First)

Runs 6 essential tests to validate setup:

```bash
npm run quick-test
```

**Tests Included:**
- QuickSwap WETH/USDC small-up
- QuickSwap WETH/USDC small-down
- Lotus WETH/USDC small-up
- Lotus WETH/USDC small-down
- QuickSwap WETH/USDC out-of-range-up (rebalancing)
- Lotus WETH/USDC out-of-range-up (rebalancing)

**Duration:** ~5-10 minutes

**Use when:**
- First time testing
- After making changes
- Quick validation before full suite

---

### 2. Full Test Suite (Comprehensive)

Runs all scenarios across both DEXs:

```bash
npm run full-test
```

**Tests Included:**
- Both DEXs (QuickSwap & Lotus)
- Multiple pairs (WETH/USDC, WETH/USDT, WBTC/WETH, USDC/USDT)
- All 9 scenarios per pair:
  - small-up / small-down
  - large-up / large-down
  - volatility
  - out-of-range-up / out-of-range-down
  - gradual-up / gradual-down
- Simultaneous DEX testing

**Total Tests:** 60+

**Duration:** ~30-60 minutes

**Use when:**
- Pre-production validation
- Comprehensive testing required
- Final sign-off before mainnet

---

### 3. Single Test (Manual)

Run a specific scenario:

```bash
npm run price-move -- <dex> <pair> <scenario>
```

**Examples:**

```bash
# Small upward move on QuickSwap
npm run price-move -- quickswap WETH/USDC small-up

# Large downward move on Lotus
npm run price-move -- lotus WETH/USDC large-down

# Volatility on both DEXs
npm run price-move -- both WETH/USDC volatility

# Force rebalancing
npm run price-move -- quickswap WETH/USDC out-of-range-up
```

**Available Options:**

**DEXs:** `quickswap`, `lotus`, `both`

**Pairs:** `WETH/USDC`, `WETH/USDT`, `WBTC/WETH`, `USDC/USDT`

**Scenarios:**
- `small-up` - Small upward price move (2-5%)
- `small-down` - Small downward price move (2-5%)
- `large-up` - Large upward price move (10-20%)
- `large-down` - Large downward price move (10-20%)
- `volatility` - Rapid alternating swaps
- `out-of-range-up` - Push price out of range upward
- `out-of-range-down` - Push price out of range downward
- `gradual-up` - Gradual upward drift
- `gradual-down` - Gradual downward drift

---

## Test Results

### Where Results Are Saved

All test results are saved in the `test-results/` directory:

```
test-results/
├── test-results-2026-01-18T14-30-00.json
├── test-report-2026-01-18T14-30-00.md
├── quick-test-results-2026-01-18T14-15-00.json
└── ...
```

### Result Files

**JSON Files** (`test-results-*.json`):
- Complete test data
- Machine-readable format
- For automated analysis

**Markdown Reports** (`test-report-*.md`):
- Human-readable summary
- Test results tables
- Failed test details
- Success rates

### Reading Results

**In Terminal:**

Test results are displayed in real-time during execution:
- ✅ Green checkmarks for passed tests
- ❌ Red X's for failed tests
- Duration for each test
- Final summary at the end

**In Files:**

Open the markdown report for a comprehensive overview:

```bash
cat test-results/test-report-2026-01-18T14-30-00.md
```

---

## Recommended Testing Workflow

### First Time Testing

1. **Verify Setup**
   ```bash
   npm run check-tokens
   ```
   Ensure all balances are sufficient.

2. **Run Quick Test**
   ```bash
   npm run quick-test
   ```
   Validates basic functionality (~10 min).

3. **Review Results**
   Check if all quick tests passed.

4. **If Quick Tests Pass → Run Full Suite**
   ```bash
   npm run full-test
   ```
   Comprehensive testing (~45 min).

5. **Review Final Report**
   ```bash
   ls -lt test-results/
   # Open the latest test-report-*.md file
   ```

### During Development

When testing specific changes:

```bash
# Test specific scenario
npm run price-move -- quickswap WETH/USDC small-up

# Test rebalancing
npm run price-move -- quickswap WETH/USDC out-of-range-up

# Quick validation
npm run quick-test
```

### Before Mainnet Deployment

1. **Full Test Suite**
   ```bash
   npm run full-test
   ```

2. **Verify 100% Pass Rate**
   Check the summary shows all tests passed.

3. **Review Each Failed Test**
   If any failed, investigate and fix before proceeding.

4. **Test DApp Frontend**
   Follow `DAPP_TESTING_GUIDE.md` while running tests.

5. **Document Results**
   Save test reports for audit trail.

---

## Parallel Testing with DApp

Run tests while monitoring the dApp:

### Terminal 1: Run Price Tests
```bash
npm run full-test
```

### Browser: Monitor DApp
1. Open: https://mantra-lst-frontend.vercel.app/vault
2. Connect wallet
3. Deposit in WETH/USDC vault
4. Watch as tests move prices
5. Verify:
   - Price updates in real-time
   - Fees accumulate
   - Rebalancing occurs when needed
   - Position value changes correctly

---

## Troubleshooting

### "Insufficient funds" Error

**Problem:** Not enough OM for gas.

**Solution:**
```bash
# Check OM balance
npm run check-balance

# If low, get more from faucet
# https://faucet.dukong.mantrachain.io
```

### "Insufficient token balance" Error

**Problem:** Not enough test tokens.

**Solution:**
```bash
# Check token balances
npm run check-tokens

# Mint more if needed
npm run mint-tokens
```

### RPC Connection Errors

**Problem:** Cannot connect to testnet RPC.

**Solutions:**
1. Check `.env` has correct `TESTNET_RPC_URL`
2. Verify internet connection
3. Try alternative RPC endpoints
4. Check if testnet is operational

### Transaction Revert Errors

**Problem:** Transactions failing on-chain.

**Possible Causes:**
1. Pool doesn't exist for the pair
2. Insufficient liquidity in pool
3. Slippage too high
4. Contract issues

**Solution:**
- Check pair exists on DEX
- Verify pool has liquidity
- Review transaction on explorer: https://explorer.dukong.io

### Tests Hanging

**Problem:** Test gets stuck.

**Solution:**
- Press `Ctrl+C` to cancel
- Results saved automatically on interrupt
- Review partial results in `test-results/`

---

## Advanced Usage

### Custom Test Configuration

Edit `scripts/run-full-test-suite.js` to customize:

```javascript
const TEST_CONFIG = {
  dexes: ['quickswap', 'lotus'],
  pairs: ['WETH/USDC', 'WETH/USDT'], // Add/remove pairs
  scenarios: ['small-up', 'large-up'] // Add/remove scenarios
};
```

### Running Specific Test Subsets

Create a custom test script:

```bash
# Test only QuickSwap
node -e "require('./scripts/run-full-test-suite.js')" quickswap

# Test only volatility scenarios
# ... (customize as needed)
```

### Continuous Testing

Run tests repeatedly:

```bash
# Run quick test every hour
while true; do npm run quick-test; sleep 3600; done

# Run full test daily
while true; do npm run full-test; sleep 86400; done
```

---

## Gas Usage Tracking

Monitor gas consumption:

```bash
# Before tests
npm run check-balance
# Note OM balance

# Run tests
npm run full-test

# After tests
npm run check-balance
# Calculate gas used = before - after
```

**Expected Gas Usage:**
- Quick Test: ~0.1-0.5 OM
- Full Test Suite: ~2-5 OM
- Single Test: ~0.01-0.05 OM

---

## CI/CD Integration

To integrate with CI/CD pipelines:

```yaml
# Example GitHub Actions
- name: Run LP Vault Tests
  run: |
    npm install
    npm run check-tokens
    npm run full-test
  env:
    TESTNET_RPC_URL: ${{ secrets.TESTNET_RPC_URL }}
    PRIVATE_KEY: ${{ secrets.PRIVATE_KEY }}
```

---

## Success Criteria

### Quick Test Success
- ✅ All 6 tests pass
- ✅ No transaction reverts
- ✅ Prices move as expected
- ✅ No error messages

### Full Test Success
- ✅ 100% pass rate (60+ tests)
- ✅ No critical errors
- ✅ All pairs tested successfully
- ✅ Both DEXs working correctly
- ✅ Rebalancing tests pass
- ✅ Gas usage reasonable

---

## Next Steps After Testing

1. ✅ Review test reports
2. ✅ Document any issues found
3. ✅ Fix critical/high priority bugs
4. ✅ Re-run tests to verify fixes
5. ✅ Test DApp frontend (see `DAPP_TESTING_GUIDE.md`)
6. ✅ Complete security audit
7. ✅ Get team sign-off
8. ✅ Prepare for mainnet deployment

---

## Quick Reference

| Command | Purpose | Duration |
|---------|---------|----------|
| `npm run check-tokens` | Verify balances | < 1 min |
| `npm run quick-test` | Essential tests | 5-10 min |
| `npm run full-test` | Comprehensive tests | 30-60 min |
| `npm run price-move -- <dex> <pair> <scenario>` | Single test | 1-2 min |

---

## Support

If you encounter issues:

1. **Check logs** in terminal output
2. **Review test results** in `test-results/`
3. **Verify transactions** on https://explorer.dukong.io
4. **Check documentation**:
   - `TEST_EXECUTION_CHECKLIST.md`
   - `LP_VAULT_TEST_PLAN.md`
   - `DAPP_TESTING_GUIDE.md`

---

**Ready to test?**

```bash
npm run quick-test
```

Good luck! 🚀
