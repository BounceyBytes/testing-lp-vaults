/**
 * LP Vault Status Checker
 * 
 * Queries the state of LP vault contracts to understand:
 * - What pool each vault is connected to
 * - Current positions and liquidity
 * - Token pair information
 */

const { ethers } = require("hardhat");
const config = require("../testnet-config.json");

// Common CLM Vault ABI (Beefy-style concentrated liquidity vault)
const VAULT_ABI = [
  // Basic info
  "function name() external view returns (string)",
  "function symbol() external view returns (string)",
  "function decimals() external view returns (uint8)",
  "function totalSupply() external view returns (uint256)",
  
  // Vault state
  "function want() external view returns (address)",
  "function pool() external view returns (address)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  
  // Position info
  "function balances() external view returns (uint256 amount0, uint256 amount1)",
  "function price() external view returns (uint256)",
  "function range() external view returns (int24 lowerTick, int24 upperTick)",
  "function positionMain() external view returns (int24 tickLower, int24 tickUpper, uint128 liquidity)",
  
  // User functions
  "function balanceOf(address account) external view returns (uint256)",
  "function totalAssets() external view returns (uint256)",
  
  // Strategy info (may vary)
  "function strategy() external view returns (address)",
  "function owner() external view returns (address)",
  "function paused() external view returns (bool)"
];

const STRATEGY_ABI = [
  "function pool() view returns (address)",
  "function lpToken0() view returns (address)",
  "function lpToken1() view returns (address)",
  "function range() view returns (int24, int24)",
  "function tick() view returns (int24)"
];

const ERC20_ABI = [
  "function symbol() external view returns (string)",
  "function name() external view returns (string)",
  "function decimals() external view returns (uint8)"
];

const POOL_ABI = [
  "function slot0() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function liquidity() external view returns (uint128)",
  "function fee() external view returns (uint24)"
];

// Vault addresses from config
const VAULTS = [
  { name: "Lotus USDC-mUSD", address: config.vaults.vault_usdc_musd, expectedStrategy: config.strategies?.strategy_usdc_musd },
  { name: "Lotus USDT-USDC", address: config.vaults.vault_usdt_usdc, expectedStrategy: config.strategies?.strategy_usdt_usdc },
  { name: "Lotus wOM-mUSD", address: config.vaults.vault_wom_musd, expectedStrategy: config.strategies?.strategy_wom_musd },
  { name: "QuickSwap USDT-mUSD", address: config.vaults.vault_usdt_musd, expectedStrategy: config.strategies?.strategy_usdt_musd },
  { name: "QuickSwap wOM-USDC", address: config.vaults.vault_wom_usdc, expectedStrategy: config.strategies?.strategy_wom_usdc }
].filter(v => v.address && v.address !== "0x0000000000000000000000000000000000000000");

async function getTokenInfo(provider, tokenAddress) {
  try {
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, provider);
    const [symbol, name, decimals] = await Promise.all([
      token.symbol().catch(() => "???"),
      token.name().catch(() => "Unknown"),
      token.decimals().catch(() => 18)
    ]);
    return { symbol, name, decimals, address: tokenAddress };
  } catch (e) {
    return { symbol: "???", name: "Unknown", decimals: 18, address: tokenAddress };
  }
}

async function getPoolInfo(provider, poolAddress) {
  try {
    const pool = new ethers.Contract(poolAddress, POOL_ABI, provider);
    const [slot0, token0, token1, liquidity] = await Promise.all([
      pool.slot0().catch(() => null),
      pool.token0().catch(() => null),
      pool.token1().catch(() => null),
      pool.liquidity().catch(() => "0")
    ]);
    
    // Try to get fee (may not exist on all pools)
    let fee;
    try {
      fee = await pool.fee();
    } catch {
      fee = null;
    }
    
    return {
      sqrtPriceX96: slot0?.sqrtPriceX96?.toString() || "0",
      tick: slot0?.tick || 0,
      token0,
      token1,
      liquidity: liquidity.toString(),
      fee: fee ? fee.toString() : "N/A"
    };
  } catch (e) {
    return null;
  }
}

async function checkVault(provider, signer, vault) {
  console.log(`\n${'━'.repeat(80)}`);
  console.log(`📊 ${vault.name}: ${vault.address}`);
  console.log(`${'━'.repeat(80)}`);
  
  const vaultContract = new ethers.Contract(vault.address, VAULT_ABI, provider);
  
  // Try to get basic info
  const info = {};
  
  // Basic token info
  try {
    info.name = await vaultContract.name();
    console.log(`  Name: ${info.name}`);
  } catch { console.log(`  Name: (not available)`); }
  
  try {
    info.symbol = await vaultContract.symbol();
    console.log(`  Symbol: ${info.symbol}`);
  } catch { console.log(`  Symbol: (not available)`); }
  
  try {
    info.totalSupply = await vaultContract.totalSupply();
    console.log(`  Total Supply: ${ethers.utils.formatEther(info.totalSupply)}`);
  } catch { console.log(`  Total Supply: (not available)`); }
  
  // Token addresses
  let token0Address, token1Address;
  try {
    token0Address = await vaultContract.token0();
    info.token0 = await getTokenInfo(provider, token0Address);
    console.log(`  Token0: ${info.token0.symbol} (${token0Address})`);
  } catch { console.log(`  Token0: (not available)`); }
  
  try {
    token1Address = await vaultContract.token1();
    info.token1 = await getTokenInfo(provider, token1Address);
    console.log(`  Token1: ${info.token1.symbol} (${token1Address})`);
  } catch { console.log(`  Token1: (not available)`); }
  
  // Pool info
  try {
    const poolAddress = await vaultContract.pool();
    console.log(`  Pool: ${poolAddress}`);
    
    const poolInfo = await getPoolInfo(provider, poolAddress);
    if (poolInfo) {
      console.log(`    - Current Tick: ${poolInfo.tick}`);
      console.log(`    - Pool Liquidity: ${poolInfo.liquidity}`);
      console.log(`    - Fee: ${poolInfo.fee}`);
    }
  } catch { console.log(`  Pool: (not available)`); }
  
  // Position info
  try {
    const [amount0, amount1] = await vaultContract.balances();
    console.log(`  Vault Balances:`);
    console.log(`    - Token0: ${ethers.utils.formatUnits(amount0, info.token0?.decimals || 18)}`);
    console.log(`    - Token1: ${ethers.utils.formatUnits(amount1, info.token1?.decimals || 18)}`);
  } catch { console.log(`  Vault Balances: (not available)`); }
  
  // Position range
  try {
    const [tickLower, tickUpper, liquidity] = await vaultContract.positionMain();
    console.log(`  Position Main:`);
    console.log(`    - Tick Lower: ${tickLower}`);
    console.log(`    - Tick Upper: ${tickUpper}`);
    console.log(`    - Liquidity: ${liquidity.toString()}`);
  } catch {
    // Try alternative method
    try {
      const [lowerTick, upperTick] = await vaultContract.range();
      console.log(`  Position Range:`);
      console.log(`    - Tick Lower: ${lowerTick}`);
      console.log(`    - Tick Upper: ${upperTick}`);
    } catch {
      console.log(`  Position: (not available)`);
    }
  }
  
  // Strategy/Owner
  try {
    const strategy = await vaultContract.strategy();
    console.log(`  Strategy: ${strategy}`);
    if (vault.expectedStrategy && vault.expectedStrategy.toLowerCase() !== strategy.toLowerCase()) {
      console.log(`  ⚠️ Strategy mismatch: expected=${vault.expectedStrategy}`);
    }

    // Enrich with strategy wiring (vaults on this testnet often expose more info via the strategy than the vault itself)
    try {
      const strategyContract = new ethers.Contract(strategy, STRATEGY_ABI, provider);
      const [poolAddr, lp0, lp1] = await Promise.all([
        strategyContract.pool().catch(() => null),
        strategyContract.lpToken0().catch(() => null),
        strategyContract.lpToken1().catch(() => null)
      ]);
      if (poolAddr) console.log(`  Strategy.pool(): ${poolAddr}`);
      if (lp0) {
        const t0 = await getTokenInfo(provider, lp0);
        console.log(`  Strategy.lpToken0(): ${t0.symbol} (${lp0})`);
      }
      if (lp1) {
        const t1 = await getTokenInfo(provider, lp1);
        console.log(`  Strategy.lpToken1(): ${t1.symbol} (${lp1})`);
      }
    } catch {}
  } catch {}
  
  try {
    const owner = await vaultContract.owner();
    console.log(`  Owner: ${owner}`);
  } catch {}
  
  // Paused status
  try {
    const paused = await vaultContract.paused();
    console.log(`  Paused: ${paused ? '⚠️ YES' : '✅ NO'}`);
  } catch {}
  
  // Check user balance
  const userAddress = await signer.getAddress();
  try {
    const userBalance = await vaultContract.balanceOf(userAddress);
    console.log(`\n  Your Balance: ${ethers.utils.formatEther(userBalance)} shares`);
  } catch {}
  
  return info;
}

async function main() {
  const [signer] = await ethers.getSigners();
  const userAddress = await signer.getAddress();
  
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║                    LP VAULT STATUS CHECKER                                ║
║                    MANTRA Dukong Testnet                                  ║
╚═══════════════════════════════════════════════════════════════════════════╝
  `);
  
  console.log(`Wallet: ${userAddress}`);
  console.log(`Network: ${config.network_info.name}`);
  console.log(`Checking ${VAULTS.length} vault contracts...`);
  
  const results = [];
  
  for (const vault of VAULTS) {
    try {
      const info = await checkVault(signer.provider, signer, vault);
      results.push({ vault, info, success: true });
    } catch (error) {
      console.log(`\n❌ Error checking ${vault.name}: ${error.message}`);
      results.push({ vault, error: error.message, success: false });
    }
  }
  
  // Summary
  console.log(`\n${'━'.repeat(80)}`);
  console.log(`\n📋 SUMMARY`);
  console.log(`${'━'.repeat(80)}`);
  
  const successful = results.filter(r => r.success).length;
  console.log(`Vaults checked: ${VAULTS.length}`);
  console.log(`Successful: ${successful}`);
  console.log(`Failed: ${VAULTS.length - successful}`);
  
  console.log(`\n${'━'.repeat(80)}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("Error:", error);
    process.exit(1);
  });

