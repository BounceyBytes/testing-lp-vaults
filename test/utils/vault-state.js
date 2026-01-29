const { ethers } = require("hardhat");
const TickReader = require("../../scripts/utils/TickReader");
const { VAULT_MIN_ABI, STRATEGY_MIN_ABI, ERC20_ABI } = require("./abis");
const { readPoolState } = require("./pool-state");
const { withRetry } = require("./retry");

async function getTokenMeta(signer, tokenAddress, fallbackSymbol) {
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
  const [symbol, decimals] = await Promise.all([
    withRetry(() => token.symbol()).catch(() => fallbackSymbol || "TOKEN"),
    withRetry(() => token.decimals()).catch(() => 18)
  ]);
  return { token, symbol, decimals };
}

function isInRange(currentTick, tickLower, tickUpper) {
  if (currentTick === null || currentTick === undefined) return null;
  if (tickLower === null || tickLower === undefined) return null;
  if (tickUpper === null || tickUpper === undefined) return null;
  return currentTick >= tickLower && currentTick < tickUpper;
}

async function getVaultAndStrategy(signer, vaultAddress, expectedStrategy) {
  const vault = new ethers.Contract(vaultAddress, VAULT_MIN_ABI, signer);
  let strategyAddress = null;
  try {
    strategyAddress = await withRetry(() => vault.strategy());
  } catch {
    strategyAddress = expectedStrategy || null;
  }
  const strategy = strategyAddress ? new ethers.Contract(strategyAddress, STRATEGY_MIN_ABI, signer) : null;
  return { vault, strategyAddress, strategy };
}

async function getVaultState(signer, vaultConfig) {
  const provider = signer.provider;
  const user = await withRetry(() => signer.getAddress());

  const { vault, strategyAddress, strategy } = await getVaultAndStrategy(
    signer,
    vaultConfig.vault,
    vaultConfig.expectedStrategy
  );

  // Prefer on-chain strategy token ordering over config, since many reverts are caused
  // by token0/token1 mismatches (vault pulls lpToken0/lpToken1 internally).
  let token0Address = vaultConfig.token0;
  let token1Address = vaultConfig.token1;
  if (strategy) {
    try {
      const [lp0, lp1] = await Promise.all([
        withRetry(() => strategy.lpToken0()).catch(() => null),
        withRetry(() => strategy.lpToken1()).catch(() => null)
      ]);
      if (lp0 && lp1) {
        token0Address = lp0;
        token1Address = lp1;
      }
    } catch {
      // fall back to config
    }
  }

  const tickReader = new TickReader(signer);

  let tickLower = null;
  let tickUpper = null;
  let tickMethod = null;
  const tickRange = await withRetry(() => tickReader.getTickRange(vaultConfig.vault));
  if (tickRange) {
    tickLower = tickRange.tickLower;
    tickUpper = tickRange.tickUpper;
    tickMethod = tickRange.method;
  }

  const pool = await readPoolState(provider, vaultConfig.pool, vaultConfig.dex);

  const token0Meta = await getTokenMeta(signer, token0Address, vaultConfig.token0Symbol);
  const token1Meta = await getTokenMeta(signer, token1Address, vaultConfig.token1Symbol);

  const [bal0, bal1, userShares] = await Promise.all([
    withRetry(() => token0Meta.token.balanceOf(user)),
    withRetry(() => token1Meta.token.balanceOf(user)),
    withRetry(() => vault.balanceOf(user)).catch(() => ethers.BigNumber.from(0))
  ]);

  const paused = await withRetry(() => vault.paused()).catch(() => null);

  return {
    vaultAddress: vaultConfig.vault,
    strategyAddress,
    token0Address,
    token1Address,
    tickLower,
    tickUpper,
    tickMethod,
    pool,
    inRange: pool.ok ? isInRange(pool.tick, tickLower, tickUpper) : null,
    user: {
      address: user,
      shares: userShares,
      token0Balance: bal0,
      token1Balance: bal1,
      token0Decimals: token0Meta.decimals,
      token1Decimals: token1Meta.decimals,
      token0Symbol: token0Meta.symbol,
      token1Symbol: token1Meta.symbol
    },
    paused
  };
}

module.exports = {
  getVaultState,
  getTokenMeta,
  isInRange
};
