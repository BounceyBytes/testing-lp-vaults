# Setup Guide - Mantra Dukong Testnet

This guide will help you set up your wallet and get testnet tokens to run the LP vault tests.

## Wallet Created

A new test wallet has been created for you:

**Address**: `0x84E9b45FCC2e7a8759d097d43BdD1D987ef98A3B`

**Private Key**: `0x38621a64c632cc00c18048b28a3eb8772c505c7bc2c2c4034cd40372804939b0`

**Mnemonic**: `bacon morning mandate escape heart grow review load retreat episode outer main`

**⚠️ Important**: This is a testnet wallet only. Never use this wallet on mainnet!

The wallet information is saved in the `.env` file.

---

## Step 1: Get Testnet OM Tokens (Gas)

You need OM tokens to pay for gas fees on the Mantra Dukong testnet.

### Option A: Use the Faucet Website

1. Visit the faucet: **https://faucet.dukong.mantrachain.io**
2. Enter the wallet address: `0x84E9b45FCC2e7a8759d097d43BdD1D987ef98A3B`
3. Complete the captcha
4. Click "Request Tokens"
5. Wait for confirmation

**Note**: The faucet limits to one request per wallet per 24 hours.

### Option B: Join Discord

If the faucet website doesn't work:
1. Join MANTRA Discord server
2. Find the faucet channel
3. Request testnet tokens with the wallet address

### Verify OM Balance

After receiving tokens from the faucet, verify your balance:

```bash
npx hardhat run scripts/check-balance.js --network testnet
```

You should see something like:
```
=== Wallet Information ===
Address: 0x84E9b45FCC2e7a8759d097d43BdD1D987ef98A3B
Balance: 10.0 OM
```

---

## Step 2: Mint Test Tokens (WETH, USDC, USDT, WBTC)

The 4 token contracts you provided have mint functions. We'll use them to mint test tokens.

### Token Addresses

- **WETH**: `0x1398471040295884df72Bf1805e2720D2c5ae4728`
- **USDC**: `0xDcc8a320dc2Ce505bB37DAb4b47ECE8E3ad1864F`
- **USDT**: `0xCDb248d19195e23a4cdffCa8a67dD8c7f97000D9`
- **WBTC**: `0x2A8E20Ba7aB3C3A90527EF0d2d970fd22f7C25AB`

### Option A: Use Our Minting Script (Recommended)

We've created a script that will mint all 4 tokens for you:

```bash
npx hardhat run scripts/mint-tokens.js --network testnet
```

This will mint:
- 100 WETH
- 100,000 USDC
- 100,000 USDT
- 10 WBTC

### Option B: Use Block Explorer

1. Go to https://explorer.dukong.io
2. For each token address, navigate to the "Write Contract" tab
3. Connect your wallet (MetaMask)
4. Find the `mint` function
5. Enter:
   - `to`: `0x84E9b45FCC2e7a8759d097d43BdD1D987ef98A3B`
   - `amount`: Amount to mint (in wei/base units)
6. Click "Write" and confirm the transaction

#### Amount Calculations (in wei):

- **WETH** (18 decimals): `100000000000000000000` (100 WETH)
- **USDC** (6 decimals): `100000000000` (100,000 USDC)
- **USDT** (6 decimals): `100000000000` (100,000 USDT)
- **WBTC** (8 decimals): `1000000000` (10 WBTC)

### Option C: Manual Contract Interaction

Use the script we've prepared:

```bash
npx hardhat run scripts/mint-specific-token.js --network testnet
```

When prompted, enter:
1. Token symbol (WETH, USDC, USDT, or WBTC)
2. Amount to mint

---

## Step 3: Verify Token Balances

After minting, check your token balances:

```bash
npx hardhat run scripts/check-token-balances.js --network testnet
```

Expected output:
```
=== Token Balances for 0x84E9b45FCC2e7a8759d097d43BdD1D987ef98A3B ===
WETH: 100.0
USDC: 100000.0
USDT: 100000.0
WBTC: 10.0
OM (native): 9.9 (some used for gas)
```

---

## Step 4: Add Network to MetaMask (Optional)

If you want to use MetaMask for manual testing:

1. Open MetaMask
2. Click "Add Network" or "Add Network Manually"
3. Enter the following details:

   - **Network Name**: MANTRA Dukong Testnet
   - **RPC URL**: `https://rpc.dukong.mantrachain.io`
   - **Chain ID**: `5887`
   - **Currency Symbol**: `OM`
   - **Block Explorer**: `https://explorer.dukong.io`

4. Click "Save"
5. Import the wallet using the mnemonic or private key above

---

## Step 5: Run Tests

Once you have OM for gas and minted test tokens, you can run the price movement tests:

### Single Test

```bash
# Move WETH/USDC price up slightly on QuickSwap
node scripts/price-mover.js quickswap WETH/USDC small-up

# Create volatility on Lotus DEX
node scripts/price-mover.js lotus WETH/USDC volatility

# Force rebalancing on both DEXs
node scripts/price-mover.js both WETH/USDC out-of-range-up
```

### Batch Tests

```bash
# Run comprehensive batch tests
node scripts/batch-price-scenarios.js
```

---

## Troubleshooting

### Issue: "Insufficient funds" error

**Solution**: You need more OM for gas. Use the faucet again (wait 24 hours) or request from Discord.

### Issue: "Transaction reverted" when minting

**Possible causes**:
1. The token contract doesn't have a public `mint` function
2. The `mint` function requires special permissions
3. You need to call a different function (like `faucet` or `requestTokens`)

**Solution**: Check the token contract on the block explorer to see available functions.

### Issue: "Nonce too high" or "Nonce too low"

**Solution**: Reset your account in MetaMask or wait a few minutes and try again.

### Issue: RPC connection errors

**Solution**: Try these alternative RPCs:
- `https://rpc.dukong.mantrachain.io`
- `https://rpc.dukong.mantrachain.io:443`

Update the `TESTNET_RPC_URL` in your `.env` file.

---

## Quick Reference

### Network Info
- **Chain ID**: 5887
- **RPC**: https://rpc.dukong.mantrachain.io
- **Explorer**: https://explorer.dukong.io
- **Faucet**: https://faucet.dukong.mantrachain.io
- **Currency**: OM

### Wallet Info
- **Address**: 0x84E9b45FCC2e7a8759d097d43BdD1D987ef98A3B
- **Private Key**: In `.env` file

### Token Addresses
- **WETH**: 0x1398471040295884df72Bf1805e2720D2c5ae4728
- **USDC**: 0xDcc8a320dc2Ce505bB37DAb4b47ECE8E3ad1864F
- **USDT**: 0xCDb248d19195e23a4cdffCa8a67dD8c7f97000D9
- **WBTC**: 0x2A8E20Ba7aB3C3A90527EF0d2d970fd22f7C25AB

### Useful Commands

```bash
# Check OM balance
npx hardhat run scripts/check-balance.js --network testnet

# Mint all tokens at once
npx hardhat run scripts/mint-tokens.js --network testnet

# Check token balances
npx hardhat run scripts/check-token-balances.js --network testnet

# Run a price movement test
node scripts/price-mover.js quickswap WETH/USDC small-up

# Run comprehensive tests
node scripts/batch-price-scenarios.js
```

---

## Next Steps

After completing this setup:

1. ✅ Get OM from faucet
2. ✅ Mint test tokens (WETH, USDC, USDT, WBTC)
3. ✅ Verify balances
4. ✅ Run price movement tests
5. ✅ Test the dApp at https://mantra-lst-frontend.vercel.app/vault
6. ✅ Follow the comprehensive test plan in `LP_VAULT_TEST_PLAN.md`

---

**Created**: 2026-01-18
**Network**: MANTRA Dukong Testnet
**Purpose**: LP Vault Testing
