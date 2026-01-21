# Price Mover Scripts - LP Vault Testing

## Overview

These scripts help you move prices on QuickSwap and Lotus DEX pools to comprehensively test LP vault rebalancing, position management, and edge case handling.

## Setup

### 1. Update Token Addresses

First, update `testnet-config.json` with your testnet token addresses:

```json
{
  "tokens": {
    "WETH": "0xYourWETHAddress",
    "USDC": "0xYourUSDCAddress",
    "USDT": "0xYourUSDTAddress",
    "WBTC": "0xYourWBTCAddress",
    "MATIC": "0xYourMATICAddress",
    "DAI": "0xYourDAIAddress"
  }
}
```

### 2. Ensure You Have Testnet Tokens

Make sure your test account has sufficient balances of the tokens you want to swap:
- WETH
- USDC
- USDT
- WBTC
- MATIC (if on Polygon)
- DAI

### 3. Install Dependencies

```bash
npm install --save-dev hardhat @nomiclabs/hardhat-ethers ethers
```

## Usage

### Single Scenario Execution

Run a single price movement scenario:

```bash
node scripts/price-mover.js <dex> <pair> <scenario>
```

**Parameters:**
- `dex`: `quickswap` | `lotus` | `both`
- `pair`: `WETH/USDC` | `WETH/USDT` | `WBTC/WETH` | `MATIC/USDC` | `USDC/USDT` | `DAI/USDC`
- `scenario`: See scenarios below

**Examples:**

```bash
# Small upward price move on QuickSwap WETH/USDC
node scripts/price-mover.js quickswap WETH/USDC small-up

# Large downward move on Lotus WETH/USDC
node scripts/price-mover.js lotus WETH/USDC large-down

# Create volatility on both DEXs for WBTC/WETH
node scripts/price-mover.js both WBTC/WETH volatility

# Push price out of range for rebalancing test
node scripts/price-mover.js quickswap WETH/USDC out-of-range-up
```

### Batch Scenario Execution

Run multiple pre-configured scenarios across pairs and DEXs:

```bash
node scripts/batch-price-scenarios.js
```

This will execute comprehensive testing scenarios including:
1. Initial small moves
2. Rebalance testing (out-of-range scenarios)
3. Volatility testing
4. Gradual drift testing
5. Stablecoin pair testing

## Available Scenarios

### Small Moves (2-5%)
- `small-up`: Small upward price move
- `small-down`: Small downward price move

**Use Case:** Testing normal market conditions, fee accumulation

### Large Moves (10-20%)
- `large-up`: Large upward price move
- `large-down`: Large downward price move

**Use Case:** Testing significant price changes, partial rebalancing

### Out-of-Range Moves (20%+)
- `out-of-range-up`: Push price far above current range
- `out-of-range-down`: Push price far below current range

**Use Case:** Force vault rebalancing, test position management

### Volatility
- `volatility`: Multiple swaps in alternating directions

**Use Case:** Simulate volatile markets, test rapid rebalancing

### Gradual Drift
- `gradual-up`: Slow upward price drift over multiple swaps
- `gradual-down`: Slow downward price drift over multiple swaps

**Use Case:** Test passive rebalancing triggers, long-term position management

## Testing Workflows

### Workflow 1: Basic Functionality Test

```bash
# 1. Small move to generate fees
node scripts/price-mover.js quickswap WETH/USDC small-up

# 2. Check vault collected fees

# 3. Small move back
node scripts/price-mover.js quickswap WETH/USDC small-down

# 4. Verify vault behavior
```

### Workflow 2: Rebalancing Test

```bash
# 1. Check current vault position range

# 2. Push price out of range
node scripts/price-mover.js quickswap WETH/USDC out-of-range-up

# 3. Trigger vault rebalance (if not automatic)

# 4. Verify new position range

# 5. Push price back
node scripts/price-mover.js quickswap WETH/USDC out-of-range-down

# 6. Verify rebalancing again
```

### Workflow 3: Volatility Test

```bash
# 1. Record starting vault metrics (TVL, position, etc.)

# 2. Create volatile conditions
node scripts/price-mover.js quickswap WETH/USDC volatility

# 3. Monitor vault rebalancing frequency

# 4. Check fee accumulation

# 5. Verify no funds lost during volatility
```

### Workflow 4: Cross-DEX Comparison

```bash
# 1. Same scenario on both DEXs
node scripts/price-mover.js quickswap WETH/USDC out-of-range-up
node scripts/price-mover.js lotus WETH/USDC out-of-range-up

# 2. Compare vault behavior:
#    - Rebalancing triggers
#    - Gas costs
#    - Fee collection
#    - Final positions
```

### Workflow 5: Comprehensive Batch Test

```bash
# Run all pre-configured scenarios
node scripts/batch-price-scenarios.js

# This will:
# - Test all major pairs
# - Test both DEXs
# - Execute all scenario types
# - Provide summary report
```

## Advanced Usage

### Custom Scenario Creation

You can modify `price-mover.js` to create custom scenarios:

```javascript
const mover = new PriceMover(signer);

// Create custom volatile pattern
await mover.movePriceUp("quickswap", token0, token1, 3000, 5);
await mover.movePriceDown("quickswap", token0, token1, 3000, 8);
await mover.movePriceUp("quickswap", token0, token1, 3000, 3);
```

### Monitoring During Tests

While running price scenarios, monitor:

1. **Vault State**
   - Current tick range
   - Liquidity amount
   - Token balances

2. **Pool State**
   - Current price (sqrtPriceX96)
   - Current tick
   - Available liquidity

3. **Transactions**
   - Gas costs
   - Slippage
   - Reverts/failures

### Adding New Pairs

To test additional pairs:

1. Add token addresses to `testnet-config.json`
2. Add pair configuration to `pairs` array
3. Run scenarios for the new pair

## Testing Checklist

Use these scripts to verify:

- [ ] **Deposit Testing**: Small price moves before/after deposits
- [ ] **Withdrawal Testing**: Price movements don't block withdrawals
- [ ] **Fee Collection**: Swaps generate fees that vault collects
- [ ] **Rebalancing**: Out-of-range moves trigger proper rebalancing
- [ ] **Multiple Rebalances**: Gradual drift causes multiple rebalances
- [ ] **Volatility Handling**: Rapid price changes handled correctly
- [ ] **Cross-DEX Consistency**: Both DEXs behave similarly
- [ ] **Stablecoin Pairs**: Small moves work on stable pairs
- [ ] **Volatile Pairs**: Large moves work on volatile pairs (WBTC/WETH)
- [ ] **Gas Efficiency**: Rebalancing during volatility isn't excessive

## Troubleshooting

### "Insufficient Balance" Error
- Ensure your test account has enough tokens
- Use a testnet faucet to get more tokens
- Check token approvals

### "Pool Does Not Exist" Error
- Verify pool exists on the DEX for that pair
- Check fee tier is correct (500, 3000, 10000)
- May need to create pool first

### "Execution Reverted" Error
- Check slippage settings
- Ensure deadline hasn't passed
- Verify pool has liquidity
- Check token approvals

### "Tokens Not Configured" Error
- Update `testnet-config.json` with correct addresses
- Ensure token addresses are valid
- Check you're on the correct network

## Integration with Test Plan

These scripts support the following sections of `LP_VAULT_TEST_PLAN.md`:

- **Section 3.1**: Deposit Testing (use small moves before deposits)
- **Section 3.2**: Withdrawal Testing (use various price scenarios)
- **Section 3.3**: Fee Collection (swaps generate fees)
- **Section 4.1**: Automatic Rebalancing (out-of-range scenarios)
- **Section 4.2**: Manual Rebalancing (gradual drift)
- **Section 5**: QuickSwap Integration Testing
- **Section 6**: Lotus DEX Integration Testing
- **Section 8.3**: Market Scenarios (volatility, trending markets)
- **Section 13**: Cross-DEX Testing

## Example Test Session

```bash
# Day 1: Basic Testing
node scripts/price-mover.js quickswap WETH/USDC small-up
node scripts/price-mover.js quickswap WETH/USDC small-down
node scripts/price-mover.js lotus WETH/USDC small-up
node scripts/price-mover.js lotus WETH/USDC small-down

# Day 2: Rebalancing Tests
node scripts/price-mover.js quickswap WETH/USDC out-of-range-up
node scripts/price-mover.js quickswap WETH/USDC out-of-range-down
node scripts/price-mover.js lotus WETH/USDC out-of-range-up
node scripts/price-mover.js lotus WETH/USDC out-of-range-down

# Day 3: Volatility & Edge Cases
node scripts/price-mover.js both WETH/USDC volatility
node scripts/price-mover.js both WBTC/WETH volatility

# Day 4: All Pairs
node scripts/batch-price-scenarios.js
```

## Notes

- Always test on testnet first
- Keep transaction logs for debugging
- Monitor gas costs during scenarios
- Document any unexpected behavior
- Use block explorers to verify all transactions
- Test with realistic amounts (not dust or max values)

## Contract Addresses Reference

**QuickSwap Testnet (Algebra Protocol):**
- Factory: `0x10253594A832f967994b44f33411940533302ACb`
- **PoolDeployer**: `0xd7cB0E0692f2D55A17bA81c1fE5501D66774fC4A` ⚠️ **IMPORTANT for swaps!**
- PositionManager: `0x69D57B9D705eaD73a5d2f2476C30c55bD755cc2F`
- Router: `0x3012E9049d05B4B5369D690114D5A5861EbB85cb`
- QuoterV2: `0xa77aD9f635a3FB3bCCC5E6d1A87cB269746Aba17`
- Quoter: `0x03f8B4b140249Dc7B2503C928E7258CCe1d91F1A`

> **Note**: QuickSwap uses Algebra Protocol. The SwapRouter's `exactInputSingle` function requires a `deployer` parameter which must be set to the **AlgebraPoolDeployer** address (NOT the factory address). Using the wrong address will cause swaps to fail with callback validation errors.

**Lotus Testnet:**
- Factory: `0x17E1ebf15BE528b179d34148fB9aB2466555F605`
- PoolDeployer: `0x41B1E93A249d9635b12344E7976Ff8E4dD2CC9c1`
- SwapRouter: `0xae52Aa627D6eFAce03Fecd41a79DEEcbc168cb0c`
- NonfungiblePositionManager: `0x84fb9302f2232050bB30D0C15Cef44823153De6f`
