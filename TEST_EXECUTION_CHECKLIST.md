# Test Execution Checklist

## ✅ Pre-Test Setup (COMPLETED)

- ✅ Wallet created: `0x84E9b45FCC2e7a8759d097d43BdD1D987ef98A3B`
- ✅ OM tokens received from faucet
- ✅ 1000 of each token minted (WETH, USDC, USDT, WBTC)
- ✅ All scripts and configurations ready

---

## Step 1: Verify Balances

Run this command to verify all tokens are in the wallet:

```bash
npx hardhat run scripts/check-token-balances.js --network testnet
```

**Expected Output:**
```
=== Token Balances ===

Wallet Address: 0x84E9b45FCC2e7a8759d097d43BdD1D987ef98A3B
OM (Gas Token): ~10 OM

WETH: 1000.0 WETH
USDC: 1000.0 USDC
USDT: 1000.0 USDT
WBTC: 1000.0 WBTC

✅ All tokens ready! You can start testing.
```

---

## Step 2: Single Price Movement Tests

Test individual scenarios on each DEX:

### QuickSwap Tests

```bash
# Small upward move (2-5%)
node scripts/price-mover.js quickswap WETH/USDC small-up

# Small downward move
node scripts/price-mover.js quickswap WETH/USDC small-down

# Large upward move (10-20%)
node scripts/price-mover.js quickswap WETH/USDC large-up

# Large downward move
node scripts/price-mover.js quickswap WETH/USDC large-down

# Create volatility
node scripts/price-mover.js quickswap WETH/USDC volatility

# Push out of range (for rebalancing tests)
node scripts/price-mover.js quickswap WETH/USDC out-of-range-up
node scripts/price-mover.js quickswap WETH/USDC out-of-range-down

# Gradual drift
node scripts/price-mover.js quickswap WETH/USDC gradual-up
node scripts/price-mover.js quickswap WETH/USDC gradual-down
```

### Lotus DEX Tests

```bash
# Small upward move (2-5%)
node scripts/price-mover.js lotus WETH/USDC small-up

# Small downward move
node scripts/price-mover.js lotus WETH/USDC small-down

# Large upward move (10-20%)
node scripts/price-mover.js lotus WETH/USDC large-up

# Large downward move
node scripts/price-mover.js lotus WETH/USDC large-down

# Create volatility
node scripts/price-mover.js lotus WETH/USDC volatility

# Push out of range
node scripts/price-mover.js lotus WETH/USDC out-of-range-up
node scripts/price-mover.js lotus WETH/USDC out-of-range-down

# Gradual drift
node scripts/price-mover.js lotus WETH/USDC gradual-up
node scripts/price-mover.js lotus WETH/USDC gradual-down
```

### Both DEXs Simultaneously

```bash
# Test both DEXs with same scenario
node scripts/price-mover.js both WETH/USDC small-up
node scripts/price-mover.js both WETH/USDC volatility
node scripts/price-mover.js both WETH/USDC out-of-range-up
```

---

## Step 3: Multi-Pair Tests

Test different trading pairs:

### WETH/USDT
```bash
node scripts/price-mover.js quickswap WETH/USDT small-up
node scripts/price-mover.js lotus WETH/USDT small-up
```

### WBTC/WETH
```bash
node scripts/price-mover.js quickswap WBTC/WETH small-up
node scripts/price-mover.js lotus WBTC/WETH small-up
```

### USDC/USDT (Stablecoin)
```bash
node scripts/price-mover.js quickswap USDC/USDT small-up
node scripts/price-mover.js lotus USDC/USDT small-up
```

---

## Step 4: Comprehensive Batch Testing

Run all scenarios across all pairs and DEXs:

```bash
node scripts/batch-price-scenarios.js
```

This will automatically run:
- All 9 scenarios (small-up, small-down, large-up, large-down, volatility, out-of-range-up, out-of-range-down, gradual-up, gradual-down)
- On both QuickSwap and Lotus
- For all configured pairs (WETH/USDC, WETH/USDT, WBTC/WETH, USDC/USDT)

**Expected Duration**: 30-60 minutes

---

## Step 5: DApp Frontend Testing

While running price movement scripts, test the dApp interface:

1. **Open DApp**: https://mantra-lst-frontend.vercel.app/vault

2. **Connect Wallet**:
   - Use MetaMask with the test wallet
   - Import using the private key from `.env`
   - Or use the mnemonic: `bacon morning mandate escape heart grow review load retreat episode outer main`

3. **Test Deposit Flow**:
   - Select WETH/USDC vault
   - Deposit some WETH
   - Verify LP tokens received
   - Check position shows correctly

4. **Run Price Movement in Terminal**:
   ```bash
   node scripts/price-mover.js quickswap WETH/USDC small-up
   ```

5. **Monitor in DApp**:
   - Refresh and verify price changed
   - Check position value updated
   - Verify fees accumulating

6. **Test Withdrawal**:
   - Withdraw partial position (50%)
   - Verify tokens returned
   - Check remaining position

7. **Test Rebalancing**:
   ```bash
   node scripts/price-mover.js quickswap WETH/USDC out-of-range-up
   ```
   - Monitor if vault rebalances
   - Check new tick range
   - Verify no loss of funds

8. **Compare QuickSwap vs Lotus**:
   - Deposit in both WETH/USDC vaults
   - Run same scenario on both:
     ```bash
     node scripts/price-mover.js both WETH/USDC volatility
     ```
   - Compare fee earnings
   - Compare gas costs
   - Compare final position values

---

## Step 6: Verification & Logging

For each test, document:

### Transaction Details
- Transaction hash
- Gas used
- Block number
- Timestamp

### Price Changes
- Price before
- Price after
- Actual % change

### Vault Behavior
- Did rebalancing occur? (if expected)
- Fees collected
- Position in/out of range
- Any errors or issues

### Example Log Entry:
```
Test: QuickSwap WETH/USDC small-up
Date: 2026-01-18 14:30:00
Tx Hash: 0x1234...
Gas Used: 123,456
Price Before: 2000 USDC/WETH
Price After: 2060 USDC/WETH
Change: +3%
Status: ✅ Success
Notes: Vault remained in range, no rebalancing needed
```

---

## Step 7: Document Issues

If you encounter any issues, use this template:

```markdown
## Issue Report

**Test**: [e.g., QuickSwap WETH/USDC volatility]
**Date**: [timestamp]
**Severity**: Critical / High / Medium / Low

**Description**:
[What went wrong]

**Steps to Reproduce**:
1. [Step 1]
2. [Step 2]

**Expected Behavior**:
[What should happen]

**Actual Behavior**:
[What actually happened]

**Transaction Hash**:
[If applicable]

**Error Message**:
[Copy error output]

**Screenshots**:
[Attach if relevant]
```

---

## Test Results Summary

After completing all tests, fill out this summary:

### QuickSwap Results

| Pair | Scenario | Status | Notes |
|------|----------|--------|-------|
| WETH/USDC | small-up | ⬜ | |
| WETH/USDC | small-down | ⬜ | |
| WETH/USDC | large-up | ⬜ | |
| WETH/USDC | large-down | ⬜ | |
| WETH/USDC | volatility | ⬜ | |
| WETH/USDC | out-of-range-up | ⬜ | |
| WETH/USDC | out-of-range-down | ⬜ | |
| WETH/USDC | gradual-up | ⬜ | |
| WETH/USDC | gradual-down | ⬜ | |

### Lotus DEX Results

| Pair | Scenario | Status | Notes |
|------|----------|--------|-------|
| WETH/USDC | small-up | ⬜ | |
| WETH/USDC | small-down | ⬜ | |
| WETH/USDC | large-up | ⬜ | |
| WETH/USDC | large-down | ⬜ | |
| WETH/USDC | volatility | ⬜ | |
| WETH/USDC | out-of-range-up | ⬜ | |
| WETH/USDC | out-of-range-down | ⬜ | |
| WETH/USDC | gradual-up | ⬜ | |
| WETH/USDC | gradual-down | ⬜ | |

### DApp Frontend Results

| Test | Status | Notes |
|------|--------|-------|
| Wallet Connection | ⬜ | |
| Deposit (WETH only) | ⬜ | |
| Deposit (USDC only) | ⬜ | |
| Deposit (both tokens) | ⬜ | |
| Withdraw (partial) | ⬜ | |
| Withdraw (full) | ⬜ | |
| Fee collection | ⬜ | |
| Rebalancing (auto) | ⬜ | |
| Rebalancing (manual) | ⬜ | |
| Multi-vault management | ⬜ | |

### Overall Results

- **Total Tests Run**: ___
- **Passed**: ___
- **Failed**: ___
- **Blocked**: ___
- **Total Gas Used**: ___ OM
- **Total Duration**: ___ hours

### Critical Issues Found
1. [List any critical issues]
2.

### Recommendations
1. [List recommendations]
2.

---

## Quick Commands Reference

```bash
# Check balances
npx hardhat run scripts/check-token-balances.js --network testnet

# Single test
node scripts/price-mover.js <dex> <pair> <scenario>

# Batch test
node scripts/batch-price-scenarios.js

# Check OM balance
npx hardhat run scripts/check-balance.js --network testnet
```

**DEX Options**: `quickswap`, `lotus`, `both`

**Pair Options**: `WETH/USDC`, `WETH/USDT`, `WBTC/WETH`, `USDC/USDT`

**Scenarios**: `small-up`, `small-down`, `large-up`, `large-down`, `volatility`, `out-of-range-up`, `out-of-range-down`, `gradual-up`, `gradual-down`

---

## Explorer Links

- **Wallet**: https://explorer.dukong.io/address/0x84E9b45FCC2e7a8759d097d43BdD1D987ef98A3B
- **WETH**: https://explorer.dukong.io/address/0x1398471040295884df72Bf1805e2720D2c5ae4728
- **USDC**: https://explorer.dukong.io/address/0xDcc8a320dc2Ce505bB37DAb4b47ECE8E3ad1864F
- **USDT**: https://explorer.dukong.io/address/0xCDb248d19195e23a4cdffCa8a67dD8c7f97000D9
- **WBTC**: https://explorer.dukong.io/address/0x2A8E20Ba7aB3C3A90527EF0d2d970fd22f7C25AB

---

**Created**: 2026-01-18
**Wallet**: 0x84E9b45FCC2e7a8759d097d43BdD1D987ef98A3B
**Network**: MANTRA Dukong Testnet (Chain ID: 5887)
