# LP Vault Testing Suite & Quickswap Bot Instructions

## Project Context & Architecture
This workspace consists of two distinct components for testing Liquidity Provider (LP) vaults on the Mantra Dukong Testnet:
1.  **Root Project (Legacy/Orchestration):** Hardhat-based project using **JavaScript** and **Ethers v5**. Handles vault testing, price manipulation scripts, and global interactions.
2.  **Quickswap Bot (`quickswap-bot/`):** A specialized trading/monitoring tool using **TypeScript** and **Ethers v6**. Interacts directly with Quickswap/Algebra pools.

**Critical Rule:** Always check which directory you are working in.
- Files in `root` and `scripts/` use **Ethers v5** syntax.
- Files in `quickswap-bot/` use **Ethers v6** syntax.

## Development Workflows

### 1. Root Project (Vault Testing)
- **Framework:** Hardhat + Ethers v5
- **Network:** Mantra Dukong Testnet (Chain ID 5887)
- **Configuration:** `hardhat.config.js`, `.env` (requires `TESTNET_RPC_URL`, `PRIVATE_KEY`)
- **Key Commands:**
    - Verify Vaults: `npx hardhat run scripts/test-vaults.js --network testnet`
    - Move Price (Single): `node scripts/price-mover.js <protocol> <pair> <scenario>`
    - Batch Scenarios: `node scripts/batch-price-scenarios.js`
    - Check Balances: `npm run check-balance`

### 2. Quickswap Bot (Price Manipulation & Monitoring)
- **Framework:** Node.js + TypeScript + Ethers v6
- **Configuration:** `quickswap-bot/.env` (requires `POOL_ADDRESSES`, `PRIVATE_KEY`)
- **Structure:**
    - `src/bot/`: Trading logic and strategies.
    - `src/contracts/`: Low-level contract interaction (Algebra/V3).
    - `src/examples/`: Runnable scripts for specific tasks.
- **Key Commands:**
    - Run Bot (Default Strategy): `cd quickswap-bot && npm run dev`
    - Monitor Prices: `npm run monitor`
    - Execute Trade: `npm run single-trade`
    - Interactive Strategy: `npm run custom-strategy`

## Code Style & Conventions

### Root Scripts (`scripts/`)
- **Language:** JavaScript (CommonJS)
- **Logging:** Use simple `console.log`. For test results, write JSON to `test-results/` folder.
- **Async Pattern:** Standard `async/await` with `main().catch(error => ...)` boilerplate.

### Quickswap Bot (`quickswap-bot/src/`)
- **Language:** TypeScript
- **Logging:** Use `src/logger.ts` (Winston wrapper) for structured logs.
- **Typing:** Strict typing for contract interactions. Use specific types from `src/types` (if available) or Ethers v6 types.

## Important Context Files
Read these before modifying specific components:
- `LP_VAULT_TEST_PLAN.md`: The master plan for what needs to be tested.
- `DAPP_TESTING_GUIDE.md`: Manual testing steps that scripts often automate.
- `quickswap-bot/CONTRACTS.md` (if exists): Details on Algebra/Quickswap interfaces.

## Testing & Validation
- **Validation:** When creating new price manipulation scripts, verify the `scripts/utils/swap-helper.js` uses the correct router addresses for the specific testnet.
- **Safety:** Never commit private keys. Both projects rely on separate `.env` files. Ensure `.env` is in `.gitignore`.
