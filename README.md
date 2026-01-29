# LP Vault Testing Suite & Quickswap Bot

This repository houses the comprehensive testing infrastructure for Liquidity Provider (LP) vaults on the **Mantra Dukong Testnet**. It validates vault behavior under various market conditions, specifically focusing on integration with **QuickSwap** and **Lotus DEX**.

## 🎯 Purpose and Scope

The primary goals of this suite are:
1.  **Vault Logic Validation**: Ensure deposits, withdrawals, and fee harvesting work correctly.
2.  **Rebalancing Tests**: Verify that vaults correctly rebalance liquidity when prices move out of range.
3.  **Market Simulation**: Manipulate testnet pool prices to simulate volatility, drift, and shocks.
4.  **Frontend Integration**: Provide tools to support manual testing of the DApp UI.

## 🏗 Architecture

The repository is divided into two distinct components:

| Component | Directory | Technology | Purpose |
|-----------|-----------|------------|---------|
| **Root Project** | `./` | **Hardhat + Ethers v5** | Main test orchestration, vault interaction scripts, and legacy price movers. |
| **Quickswap Bot** | `./quickswap-bot` | **Node + TS + Ethers v6** | Specialized bot for precision price impact and pool monitoring on Algebra/QuickSwap V3. |

> **⚠️ Important**: The root project uses **Ethers v5**, while the `quickswap-bot` uses **Ethers v6**. Be mindful of syntax differences when switching contexts.

---

## 🛠 Prerequisites

- Node.js (v18+ recommended)
- Access to Mantra Dukong Testnet RPC
- Private Key with testnet OM/USDC/ETH

## 🚀 Setup

1.  **Install Root Dependencies:**
    ```bash
    npm install
    ```
2.  **Install Bot Dependencies:**
    ```bash
    cd quickswap-bot
    npm install
    cd ..
    ```
3.  **Environment Configuration:**
    - Copy `.env.example` to `.env` in the **root** directory.
    - Copy `quickswap-bot/env.example` to `quickswap-bot/.env` in the **quickswap-bot** directory.
    - Fill in `PRIVATE_KEY` and specific `RPC_URL`s.

---

## 🧪 Component 1: Root Project (Vault Testing)

This component focuses on verifying the smart contracts and running scenario simulations.

### Key Commands

| Command | Description |
|---------|-------------|
| `npm run check-balance` | Check wallet balances for OM, wOM, USDC, etc. |
| `npm run test-vaults` | Verify vault status, total supply, and assets. |
| `npm run full-test` | Run the full standard Hardhat test suite (Mocha/Chai). |
| `node scripts/price-mover.js` | Move prices using the legacy JS script (simple swaps). |
| `node scripts/batch-price-scenarios.js` | Run a batch of price scenarios across multiple pairs. |

### Running Tests
To run the primary validation suite:
```bash
npx hardhat test
```

To run a specific test file (e.g., vault operations):
```bash
npx hardhat test test/vault-operations.test.js --network testnet
```

---

## 🤖 Component 2: Quickswap Bot (Price & Monitoring)

Located in `quickswap-bot/`, this is a more advanced tool for interacting with QuickSwap (Algebra) pools. It is strictly typed and robust.

### Key Commands (from `quickswap-bot/` dir)

| Command | Description |
|---------|-------------|
| `npm run check-price` | Monitor current pool prices and tick data. |
| `npm run swap:target` | Execute a swap to hit a specific target price impact. |
| `npm run monitor` | distinct monitoring script for continuous observation. |

REFER to [quickswap-bot/README.md](./quickswap-bot/README.md) for detailed bot usage.

---

## 📚 Documentation Reference

- **[LP_VAULT_TEST_PLAN.md](./LP_VAULT_TEST_PLAN.md)**: The master test plan containing 400+ points of validation.
- **[DAPP_TESTING_GUIDE.md](./DAPP_TESTING_GUIDE.md)**: Manual testing steps for the frontend DApp.
- **[quickswap-bot/USAGE.md](./quickswap-bot/USAGE.md)**: Detailed commands for the V6 bot.

## 🔗 Network Info

- **Network**: Mantra Dukong Testnet
- **Chain ID**: 5887
- **Explorer**: [https://explorer.dukong.io](https://explorer.dukong.io)
