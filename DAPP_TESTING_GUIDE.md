# DApp Testing Guide - LP Vault Frontend

## Overview

This guide covers comprehensive testing of the LP Vault dApp frontend in combination with the price movement scripts.

**DApp URL**: https://mantra-lst-frontend.vercel.app/vault

**Network**: Dukong Testnet

**Explorer**: https://explorer.dukong.io

## Testnet Token Addresses

| Token | Address | Explorer |
|-------|---------|----------|
| WBTC | `0x2A8E20Ba7aB3C3A90527EF0d2d970fd22f7C25AB` | [View](https://explorer.dukong.io/address/0x2A8E20Ba7aB3C3A90527EF0d2d970fd22f7C25AB) |
| WETH | `0x1398471040295884df72Bf1805e2720D2c5ae4728` | [View](https://explorer.dukong.io/address/0x1398471040295884df72Bf1805e2720D2c5ae4728) |
| USDC | `0xDcc8a320dc2Ce505bB37DAb4b47ECE8E3ad1864F` | [View](https://explorer.dukong.io/address/0xDcc8a320dc2Ce505bB37DAb4b47ECE8E3ad1864F?tab=read_write_contract) |
| USDT | `0xCDb248d19195e23a4cdffCa8a67dD8c7f97000D9` | [View](https://explorer.dukong.io/address/0xCDb248d19195e23a4cdffCa8a67dD8c7f97000D9?tab=read_write_contract) |

---

## Pre-Testing Setup

### 1. Wallet Configuration

1. **Add Dukong Testnet to MetaMask**
   - Network Name: `Dukong Testnet`
   - RPC URL: (obtain from team)
   - Chain ID: (obtain from team)
   - Currency Symbol: (obtain from team)
   - Block Explorer: `https://explorer.dukong.io`

2. **Import Test Tokens**
   - Add WBTC, WETH, USDC, USDT to MetaMask using addresses above
   - Verify token balances display correctly

3. **Get Testnet Tokens**
   - Obtain testnet tokens from faucet or team
   - Verify you have sufficient balances:
     - WETH: ~10+
     - USDC: ~10,000+
     - USDT: ~10,000+
     - WBTC: ~1+

### 2. Browser Setup

- **Recommended**: Chrome/Brave with MetaMask
- Clear cache and cookies before testing
- Disable ad blockers that might interfere
- Open browser console for debugging (F12)

---

## DApp Frontend Testing Workflows

### Workflow 1: Initial Connection & UI Testing

**Objective**: Verify basic dApp functionality and UI/UX

#### Steps:

1. **Connect Wallet**
   - [ ] Navigate to https://mantra-lst-frontend.vercel.app/vault
   - [ ] Click "Connect Wallet" button
   - [ ] Approve MetaMask connection
   - [ ] Verify wallet address displays correctly
   - [ ] Verify network is Dukong Testnet

2. **UI Inspection**
   - [ ] Vault list displays properly
   - [ ] Token pairs show correct symbols (WETH/USDC, etc.)
   - [ ] TVL (Total Value Locked) displays
   - [ ] APY/APR displays (if available)
   - [ ] All buttons are clickable and not disabled
   - [ ] Responsive design works on different screen sizes

3. **Vault Selection**
   - [ ] Click on each vault
   - [ ] Verify vault details page loads
   - [ ] Check that vault information displays:
     - Current price
     - Price range
     - Position liquidity
     - User's position (if any)

4. **Error Handling**
   - [ ] Disconnect wallet - verify UI updates
   - [ ] Switch to wrong network - verify error message
   - [ ] Refresh page - verify state persists

---

### Workflow 2: Deposit Testing

**Objective**: Test deposit functionality with various scenarios

#### Pre-requisites:
- Wallet connected
- Sufficient token balances
- Tokens approved for spending (if required)

#### Test Cases:

**2.1: Single Asset Deposit (WETH only)**

- [ ] Select WETH/USDC vault
- [ ] Click "Deposit" button
- [ ] Enter WETH amount (e.g., 1 WETH)
- [ ] Leave USDC amount as 0 or empty
- [ ] Review deposit preview:
  - Estimated LP tokens to receive
  - Swap details (WETH → USDC for balancing)
  - Fees breakdown
- [ ] Click "Approve WETH" (if needed)
- [ ] Wait for approval transaction
- [ ] Click "Deposit"
- [ ] Review transaction in MetaMask
- [ ] Confirm transaction
- [ ] Wait for confirmation
- [ ] Verify success message
- [ ] Verify balance updates:
  - WETH balance decreased
  - Vault LP tokens received
  - Position displays in "My Positions"

**2.2: Single Asset Deposit (USDC only)**

- [ ] Repeat above steps but deposit USDC only
- [ ] Verify swap from USDC → WETH occurs
- [ ] Verify proper LP token minting

**2.3: Dual Asset Deposit (Both Tokens)**

- [ ] Enter both WETH and USDC amounts
- [ ] Try optimal ratio (as suggested by UI)
- [ ] Try non-optimal ratio (e.g., 1 WETH, 500 USDC)
- [ ] Verify UI shows rebalancing details
- [ ] Complete deposit
- [ ] Verify both token balances decreased appropriately

**2.4: Minimum Deposit**

- [ ] Attempt very small deposit (e.g., 0.001 WETH)
- [ ] Verify minimum deposit validation
- [ ] If allowed, verify dust amounts handled correctly

**2.5: Maximum Deposit**

- [ ] Attempt to deposit max balance
- [ ] Click "Max" button (if available)
- [ ] Verify it leaves some tokens for gas
- [ ] Complete large deposit
- [ ] Verify transaction succeeds

**2.6: Edge Cases**

- [ ] Enter 0 amount - verify error message
- [ ] Enter more than balance - verify error message
- [ ] Cancel transaction in MetaMask - verify UI handles gracefully
- [ ] Transaction fails - verify error handling

---

### Workflow 3: Price Movement + Deposit Testing

**Objective**: Test deposits during various price conditions

#### 3.1: Deposit After Small Price Move

```bash
# Terminal 1: Move price up slightly
node scripts/price-mover.js quickswap WETH/USDC small-up
```

- [ ] Wait for price move transaction to confirm
- [ ] Refresh dApp (or wait for price update)
- [ ] Verify new price displays in vault
- [ ] Attempt deposit
- [ ] Verify deposit works correctly after price change
- [ ] Check LP token amount matches expected

#### 3.2: Deposit After Large Price Move

```bash
# Terminal 1: Move price significantly
node scripts/price-mover.js quickswap WETH/USDC large-up
```

- [ ] Verify price change reflected in UI
- [ ] Attempt deposit
- [ ] Verify slippage warnings (if price moved too much)
- [ ] Complete deposit
- [ ] Verify position is in correct price range

#### 3.3: Deposit After Out-of-Range Move

```bash
# Terminal 1: Push price out of range
node scripts/price-mover.js quickswap WETH/USDC out-of-range-up
```

- [ ] Check if vault shows "Out of Range" status
- [ ] Attempt deposit
- [ ] Verify vault rebalances (automatically or manually triggered)
- [ ] Verify new deposit goes into new range
- [ ] Check that old positions are handled correctly

---

### Workflow 4: Withdrawal Testing

**Objective**: Test withdrawal functionality comprehensively

#### 4.1: Partial Withdrawal

- [ ] Navigate to "My Positions"
- [ ] Select a vault with existing position
- [ ] Click "Withdraw"
- [ ] Enter 50% of position (or use slider)
- [ ] Review withdrawal preview:
  - WETH amount to receive
  - USDC amount to receive
  - Fees (if any)
  - LP tokens to burn
- [ ] Click "Withdraw"
- [ ] Confirm transaction
- [ ] Verify:
  - Tokens received in wallet
  - LP token balance decreased
  - Position size decreased by 50%

#### 4.2: Full Withdrawal

- [ ] Withdraw 100% of position
- [ ] Click "Max" button (if available)
- [ ] Complete withdrawal
- [ ] Verify:
  - All LP tokens burned
  - Position removed from "My Positions"
  - All underlying tokens returned

#### 4.3: Withdrawal After Price Movement

```bash
# Terminal: Create volatility
node scripts/price-mover.js quickswap WETH/USDC volatility
```

- [ ] During/after volatility, attempt withdrawal
- [ ] Verify withdrawal preview shows updated token amounts
- [ ] Complete withdrawal
- [ ] Check if impermanent loss is displayed
- [ ] Verify correct token amounts received

#### 4.4: Withdrawal When Out of Range

```bash
# Terminal: Push out of range
node scripts/price-mover.js quickswap WETH/USDC out-of-range-down
```

- [ ] Verify position shows as "Out of Range"
- [ ] Attempt withdrawal
- [ ] Verify withdrawal still works
- [ ] Check token ratio returned (should be skewed)
- [ ] Verify all value returned (no loss)

---

### Workflow 5: Fee Collection Testing

**Objective**: Verify trading fees are collected and displayed

#### Steps:

1. **Generate Trading Fees**

```bash
# Terminal: Multiple small swaps to generate fees
node scripts/price-mover.js quickswap WETH/USDC small-up
node scripts/price-mover.js quickswap WETH/USDC small-down
node scripts/price-mover.js quickswap WETH/USDC small-up
node scripts/price-mover.js quickswap WETH/USDC small-down
```

2. **Check Fee Display**
   - [ ] Refresh dApp
   - [ ] Navigate to vault position
   - [ ] Verify "Unclaimed Fees" or "Earned Fees" displays
   - [ ] Amount should be > 0 after swaps

3. **Claim Fees (if separate action)**
   - [ ] Click "Claim Fees" button (if exists)
   - [ ] Review fee amounts
   - [ ] Confirm transaction
   - [ ] Verify fees added to wallet or re-invested

4. **Auto-Compounding (if applicable)**
   - [ ] Wait for auto-compound trigger
   - [ ] Verify fees auto-compounded into position
   - [ ] Check position size increased

---

### Workflow 6: Rebalancing Testing

**Objective**: Test vault rebalancing mechanisms

#### 6.1: Automatic Rebalancing

```bash
# Terminal: Push price to trigger rebalance
node scripts/price-mover.js quickswap WETH/USDC out-of-range-up
```

- [ ] Monitor vault in dApp
- [ ] Wait for automatic rebalance (if implemented)
- [ ] Verify rebalance transaction occurs
- [ ] Check new price range displayed
- [ ] Verify position is now "In Range"
- [ ] Verify no funds lost during rebalance

#### 6.2: Manual Rebalancing

- [ ] Push price out of range (as above)
- [ ] Check if "Rebalance" button appears
- [ ] Click "Rebalance" button
- [ ] Review rebalance preview:
  - New tick range
  - Gas cost estimate
  - Impact on position
- [ ] Confirm rebalance
- [ ] Verify successful rebalancing

#### 6.3: Multiple Rebalances

```bash
# Terminal: Create gradual drift requiring multiple rebalances
node scripts/price-mover.js quickswap WETH/USDC gradual-up
```

- [ ] Monitor for multiple rebalance events
- [ ] Verify each rebalance is efficient
- [ ] Check cumulative gas costs
- [ ] Verify position maintained throughout

---

### Workflow 7: Multi-Vault Testing

**Objective**: Test multiple vaults simultaneously

#### Steps:

1. **Deposit in Multiple Vaults**
   - [ ] Deposit in WETH/USDC vault (QuickSwap)
   - [ ] Deposit in WETH/USDC vault (Lotus)
   - [ ] Deposit in WETH/USDT vault
   - [ ] Verify all positions display correctly

2. **Move Prices Independently**

```bash
# Different scenarios on different DEXs
node scripts/price-mover.js quickswap WETH/USDC volatility
node scripts/price-mover.js lotus WETH/USDC gradual-up
```

3. **Monitor All Positions**
   - [ ] Verify each vault reacts independently
   - [ ] Check performance metrics per vault
   - [ ] Compare fee collection across vaults

4. **Batch Operations (if supported)**
   - [ ] Try selecting multiple positions
   - [ ] Withdraw from multiple vaults at once
   - [ ] Claim fees from multiple vaults at once

---

### Workflow 8: Cross-DEX Comparison

**Objective**: Compare behavior between QuickSwap and Lotus vaults

#### Setup:

- Deposit same amount in both WETH/USDC vaults:
  - QuickSwap WETH/USDC
  - Lotus WETH/USDC

#### Tests:

1. **Same Price Movement on Both**

```bash
node scripts/price-mover.js both WETH/USDC small-up
```

- [ ] Compare fee collection (which earned more?)
- [ ] Compare rebalancing frequency
- [ ] Compare gas costs
- [ ] Compare final position values

2. **Volatility Comparison**

```bash
node scripts/price-mover.js both WETH/USDC volatility
```

- [ ] Monitor both vaults during volatility
- [ ] Compare which handles volatility better
- [ ] Compare impermanent loss
- [ ] Compare total returns

3. **UI Comparison**
   - [ ] Check if UI clearly differentiates DEXs
   - [ ] Verify correct DEX logo/name displays
   - [ ] Check that you can't confuse positions

---

### Workflow 9: Edge Cases & Error Handling

**Objective**: Test unusual scenarios and error conditions

#### 9.1: Network Issues

- [ ] Disconnect internet during deposit - verify error
- [ ] Reconnect - verify recovery
- [ ] Switch networks mid-transaction - verify handling

#### 9.2: Transaction Failures

- [ ] Set gas too low - verify failure handling
- [ ] Cancel transaction - verify UI updates
- [ ] Transaction reverts - verify error message

#### 9.3: Stale Data

- [ ] Leave dApp open for extended period
- [ ] Try to transact with stale data
- [ ] Verify price/state refreshes

#### 9.4: Simultaneous Actions

- [ ] Open dApp in two browser tabs
- [ ] Deposit in tab 1
- [ ] Try to deposit in tab 2 (with stale balance)
- [ ] Verify tab 2 detects state change

#### 9.5: Extreme Values

- [ ] Try depositing 0.000000001 tokens
- [ ] Try depositing max uint256 (should fail)
- [ ] Try negative values (should be prevented)

---

### Workflow 10: Performance Testing

**Objective**: Test dApp performance under various conditions

#### 10.1: Load Testing

- [ ] Open dApp with 10+ positions
- [ ] Verify loading time acceptable
- [ ] Check memory usage
- [ ] Verify no lag in UI

#### 10.2: Refresh Testing

- [ ] Hard refresh (Ctrl+F5) - verify state loads
- [ ] Navigate away and back - verify persistence
- [ ] Close and reopen browser - verify reconnection

#### 10.3: Price Update Frequency

- [ ] Monitor how often prices update
- [ ] Verify updates happen without full refresh
- [ ] Check WebSocket connection (if used)

---

## Combined Testing Scenarios

### Scenario 1: Complete User Journey

1. **New User**
   - [ ] Connect wallet for first time
   - [ ] Browse available vaults
   - [ ] Read vault information
   - [ ] Choose vault

2. **First Deposit**
   - [ ] Deposit WETH into WETH/USDC vault
   - [ ] Monitor position

3. **Price Changes**
   ```bash
   node scripts/price-mover.js quickswap WETH/USDC small-up
   ```
   - [ ] Watch position value increase/decrease
   - [ ] See fees accumulate

4. **Collect Earnings**
   - [ ] Claim fees (if applicable)
   - [ ] Verify earnings

5. **Withdrawal**
   - [ ] Withdraw partial position
   - [ ] Later withdraw rest
   - [ ] Verify final amounts

### Scenario 2: Volatile Market Conditions

```bash
# Terminal: Create volatility
node scripts/batch-price-scenarios.js
```

While running batch scenarios:
- [ ] Monitor all vault positions in real-time
- [ ] Check rebalancing frequency
- [ ] Verify fee accumulation during volatility
- [ ] Check for any UI freezes or issues
- [ ] Verify all transactions succeed
- [ ] Compare final returns across vaults

### Scenario 3: Stress Testing

1. **Rapid Transactions**
   - [ ] Deposit → Withdraw → Deposit rapidly
   - [ ] Verify no issues with rapid state changes

2. **Large Position Management**
   - [ ] Deposit maximum allowed amount
   - [ ] Move price out of range
   - [ ] Trigger rebalance
   - [ ] Withdraw large position
   - [ ] Verify all operations handle large amounts

---

## Monitoring & Validation

### Real-time Checks

During all testing, continuously verify:

- [ ] **Console Errors**: No JavaScript errors
- [ ] **Network Requests**: All API calls succeed
- [ ] **Transaction Status**: All tx confirmed on-chain
- [ ] **Balance Updates**: Wallet balances update correctly
- [ ] **Price Accuracy**: Prices match DEX/oracle
- [ ] **Gas Estimates**: Reasonable gas estimates

### Post-Test Validation

After each test:

1. **Blockchain Verification**
   - Verify all transactions on explorer.dukong.io
   - Check contract interactions
   - Verify event emissions

2. **Balance Reconciliation**
   - Sum all deposits
   - Sum all withdrawals
   - Verify net balance + fees = expected

3. **Data Consistency**
   - Vault TVL = sum of all positions
   - User position = recorded deposits - withdrawals
   - Fee amounts match swap volumes

---

## Bug Reporting Template

When you find issues, report them with:

```markdown
## Bug Report

**Severity**: Critical / High / Medium / Low

**Component**: Frontend / Smart Contract / Integration

**Description**:
[Clear description of the issue]

**Steps to Reproduce**:
1.
2.
3.

**Expected Behavior**:
[What should happen]

**Actual Behavior**:
[What actually happened]

**Environment**:
- Browser:
- Wallet:
- Network: Dukong Testnet
- Vault:
- Transaction Hash:

**Screenshots**:
[Attach screenshots]

**Console Logs**:
[Paste relevant console output]

**Blockchain Evidence**:
[Link to explorer]
```

---

## Testing Checklist Summary

### Pre-Testing
- [ ] Wallet configured for Dukong Testnet
- [ ] All tokens imported and visible
- [ ] Sufficient testnet token balances
- [ ] Price mover scripts ready

### Core Functionality
- [ ] Wallet connection works
- [ ] Vault list displays correctly
- [ ] Deposit (single asset) works
- [ ] Deposit (dual asset) works
- [ ] Withdrawal (partial) works
- [ ] Withdrawal (full) works
- [ ] Fee collection works

### Advanced Features
- [ ] Rebalancing (automatic) works
- [ ] Rebalancing (manual) works
- [ ] Multi-vault management works
- [ ] Cross-DEX comparison validated

### Edge Cases
- [ ] Network errors handled
- [ ] Transaction failures handled
- [ ] Extreme values handled
- [ ] Stale data refreshed

### Performance
- [ ] Load time acceptable
- [ ] No memory leaks
- [ ] Real-time updates work
- [ ] Handles concurrent users

### Integration
- [ ] Works with price mover scripts
- [ ] Handles volatility scenarios
- [ ] Survives batch testing
- [ ] All blockchain interactions confirmed

---

## Quick Reference Commands

```bash
# Single price movements
node scripts/price-mover.js quickswap WETH/USDC small-up
node scripts/price-mover.js lotus WETH/USDC small-down

# Rebalancing triggers
node scripts/price-mover.js quickswap WETH/USDC out-of-range-up
node scripts/price-mover.js lotus WETH/USDC out-of-range-down

# Volatility testing
node scripts/price-mover.js both WETH/USDC volatility

# Comprehensive batch testing
node scripts/batch-price-scenarios.js
```

---

## Notes

- Always test on testnet first
- Document all transaction hashes
- Keep screenshots of issues
- Compare gas costs across operations
- Monitor block explorer during tests
- Use multiple test accounts for multi-user scenarios
- Test during different network conditions (congested/normal)

---

**Last Updated**: 2026-01-18
**Version**: 1.0
**Testnet**: Dukong
**DApp URL**: https://mantra-lst-frontend.vercel.app/vault
