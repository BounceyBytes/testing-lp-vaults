const { config } = require("./config");

function isSet(addr) {
  return addr && addr !== "0x0000000000000000000000000000000000000000";
}

function getClmVaultConfigs() {
  const out = [];

  // Keep this config-driven, but explicit enough to include pools/tokens/feeTier.
  const candidates = [
    {
      name: "Lotus USDC-mUSD",
      dex: "lotus",
      vault: config.vaults.vault_usdc_musd,
      expectedStrategy: config.strategies?.strategy_usdc_musd,
      pool: config.pools.lotus.USDC_mUSD,
      token0: config.tokens.USDC,
      token1: config.tokens.mUSD,
      token0Symbol: "USDC",
      token1Symbol: "mUSD",
      feeTier: 500
    },
    {
      name: "Lotus USDT-USDC",
      dex: "lotus",
      vault: config.vaults.vault_usdt_usdc,
      expectedStrategy: config.strategies?.strategy_usdt_usdc,
      pool: config.pools.lotus.USDT_USDC,
      token0: config.tokens.USDT,
      token1: config.tokens.USDC,
      token0Symbol: "USDT",
      token1Symbol: "USDC",
      feeTier: 500
    },
    {
      name: "Lotus wOM-mUSD",
      dex: "lotus",
      vault: config.vaults.vault_wom_musd,
      expectedStrategy: config.strategies?.strategy_wom_musd,
      pool: config.pools.lotus.wOM_mUSD,
      token0: config.tokens.wOM,
      token1: config.tokens.mUSD,
      token0Symbol: "wOM",
      token1Symbol: "mUSD",
      feeTier: 3000
    },
    {
      name: "QuickSwap USDT-mUSD",
      dex: "quickswap",
      vault: config.vaults.vault_usdt_musd,
      expectedStrategy: config.strategies?.strategy_usdt_musd,
      pool: config.pools.quickswap.USDT_mUSD,
      token0: config.tokens.USDT,
      token1: config.tokens.mUSD,
      token0Symbol: "USDT",
      token1Symbol: "mUSD",
      feeTier: 500
    },
    {
      name: "QuickSwap wOM-USDC",
      dex: "quickswap",
      vault: config.vaults.vault_wom_usdc,
      expectedStrategy: config.strategies?.strategy_wom_usdc,
      pool: config.pools.quickswap.wOM_USDC,
      token0: config.tokens.wOM,
      token1: config.tokens.USDC,
      token0Symbol: "wOM",
      token1Symbol: "USDC",
      feeTier: 500
    }
  ];

  for (const c of candidates) {
    if (isSet(c.vault) && isSet(c.pool) && isSet(c.token0) && isSet(c.token1)) out.push(c);
  }

  return out;
}

module.exports = {
  getClmVaultConfigs
};
