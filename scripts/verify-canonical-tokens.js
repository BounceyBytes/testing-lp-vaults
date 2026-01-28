/**
 * Verify canonical testnet tokens against on-chain pool token0/token1.
 *
 * Read-only: prints discovered token addresses + metadata and highlights mismatches.
 */
const { ethers } = require("hardhat");
const config = require("../testnet-config.json");

const ERC20_ABI = [
  "function symbol() view returns (string)",
  "function name() view returns (string)",
  "function decimals() view returns (uint8)"
];

const POOL_ABI_UNIV3 = [
  "function token0() view returns (address)",
  "function token1() view returns (address)"
];

const POOL_ABI_ALGEBRA = [
  "function token0() view returns (address)",
  "function token1() view returns (address)"
];

function normalize(addr) {
  return (addr || "").toLowerCase();
}

function reverseTokenIndex(configTokens) {
  const idx = {};
  for (const [sym, addr] of Object.entries(configTokens || {})) {
    if (!addr || addr === "0x0000000000000000000000000000000000000000") continue;
    idx[normalize(addr)] = sym;
  }
  return idx;
}

async function getTokenMeta(provider, addr) {
  const token = new ethers.Contract(addr, ERC20_ABI, provider);
  const [symbol, name, decimals] = await Promise.all([
    token.symbol().catch(() => "???"),
    token.name().catch(() => "Unknown"),
    token.decimals().catch(() => 18)
  ]);
  return { address: addr, symbol, name, decimals };
}

function looksLikeWrappedOM(meta) {
  const s = (meta.symbol || "").trim().toLowerCase();
  const n = (meta.name || "").toLowerCase();
  return s === "wom" || s === "wmantra" || n.includes("wrapped om") || n.includes("wrapped mantra");
}

async function inspectPool(provider, dex, name, address) {
  const abi = dex === "quickswap" ? POOL_ABI_ALGEBRA : POOL_ABI_UNIV3;
  const pool = new ethers.Contract(address, abi, provider);
  const [token0, token1] = await Promise.all([pool.token0(), pool.token1()]);
  return { dex, name, address, token0, token1 };
}

async function main() {
  const [signer] = await ethers.getSigners();
  const provider = signer.provider;
  const reverse = reverseTokenIndex(config.tokens);

  console.log("=== Canonical Token Verification (Pools) ===\n");

  const pools = [];
  for (const [k, addr] of Object.entries(config.pools?.lotus || {})) {
    if (k === "_note") continue;
    pools.push({ dex: "lotus", name: `lotus.${k}`, address: addr });
  }
  for (const [k, addr] of Object.entries(config.pools?.quickswap || {})) {
    if (k === "_note") continue;
    pools.push({ dex: "quickswap", name: `quickswap.${k}`, address: addr });
  }

  const womCandidates = new Map();

  for (const p of pools) {
    console.log(`Pool: ${p.name} (${p.dex})`);
    console.log(`  Address: ${p.address}`);
    try {
      const info = await inspectPool(provider, p.dex, p.name, p.address);
      const [m0, m1] = await Promise.all([getTokenMeta(provider, info.token0), getTokenMeta(provider, info.token1)]);

      const sym0 = reverse[normalize(info.token0)] || m0.symbol;
      const sym1 = reverse[normalize(info.token1)] || m1.symbol;

      console.log(`  token0: ${sym0} ${info.token0} (symbol=${m0.symbol}, decimals=${m0.decimals})`);
      console.log(`  token1: ${sym1} ${info.token1} (symbol=${m1.symbol}, decimals=${m1.decimals})`);

      if (looksLikeWrappedOM(m0)) womCandidates.set(normalize(m0.address), m0);
      if (looksLikeWrappedOM(m1)) womCandidates.set(normalize(m1.address), m1);
    } catch (e) {
      console.log(`  ❌ failed to read token0/token1: ${e.message.slice(0, 160)}`);
    }
    console.log("");
  }

  console.log("=== Canonical Token Config ===");
  for (const sym of ["USDC", "USDT", "mUSD", "wOM"]) {
    console.log(`  ${sym}: ${config.tokens?.[sym] || "(missing)"}`);
  }

  if (womCandidates.size) {
    console.log("\n=== Detected Wrapped OM Candidates ===");
    for (const m of womCandidates.values()) {
      console.log(`  ${m.symbol} (${m.name}) @ ${m.address} decimals=${m.decimals}`);
    }
  } else {
    console.log("\nNo Wrapped OM candidates detected from pool token metadata.");
  }
}

main()
  .then(() => process.exit(0))
  .catch((e) => {
    console.error(e);
    process.exit(1);
  });


