const { ethers } = require("hardhat");
const { withRetry } = require("./retry");

const UNIV3_POOL_ABI = [
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function liquidity() view returns (uint128)"
];

const ALGEBRA_POOL_ABI_SAFE = [
  "function safelyGetStateOfAMM() view returns (uint160 sqrtPrice, int24 tick, uint16 lastFee, uint8 pluginConfig, uint128 activeLiquidity, int24 nextTick, int24 previousTick)",
  "function liquidity() view returns (uint128)"
];

const ALGEBRA_POOL_ABI_7 = [
  "function globalState() view returns (uint160 price, int24 tick, uint16 fee, uint16 timepointIndex, uint8 communityFeeToken0, uint8 communityFeeToken1, bool unlocked)",
  "function liquidity() view returns (uint128)"
];

async function readPoolState(provider, poolAddress, dexHint) {
  const code = await withRetry(() => provider.getCode(poolAddress));
  if (!code || code === "0x") return { ok: false, warning: `no contract code at ${poolAddress}` };

  const univ3Iface = new ethers.utils.Interface(UNIV3_POOL_ABI);
  const algebraSafeIface = new ethers.utils.Interface(ALGEBRA_POOL_ABI_SAFE);
  const algebra7Iface = new ethers.utils.Interface(ALGEBRA_POOL_ABI_7);

  const tryUniV3 = async () => {
    const raw = await withRetry(() => provider.call({ to: poolAddress, data: univ3Iface.encodeFunctionData("slot0", []) }));
    const decoded = univ3Iface.decodeFunctionResult("slot0", raw);
    const liqRaw = await withRetry(() => provider.call({ to: poolAddress, data: univ3Iface.encodeFunctionData("liquidity", []) }));
    const liqDecoded = univ3Iface.decodeFunctionResult("liquidity", liqRaw);
    return { ok: true, kind: "univ3", sqrtPriceX96: decoded.sqrtPriceX96 ?? decoded[0], tick: decoded.tick ?? decoded[1], liquidity: liqDecoded[0] };
  };

  const tryAlgebra = async () => {
    try {
      const raw = await withRetry(() => provider.call({ to: poolAddress, data: algebraSafeIface.encodeFunctionData("safelyGetStateOfAMM", []) }));
      const decoded = algebraSafeIface.decodeFunctionResult("safelyGetStateOfAMM", raw);
      const liqRaw = await withRetry(() => provider.call({ to: poolAddress, data: algebraSafeIface.encodeFunctionData("liquidity", []) }));
      const liqDecoded = algebraSafeIface.decodeFunctionResult("liquidity", liqRaw);
      return { ok: true, kind: "algebra", sqrtPriceX96: decoded.sqrtPrice ?? decoded[0], tick: decoded.tick ?? decoded[1], liquidity: liqDecoded[0] };
    } catch (e) {
      const raw = await withRetry(() => provider.call({ to: poolAddress, data: algebra7Iface.encodeFunctionData("globalState", []) }));
      const decoded = algebra7Iface.decodeFunctionResult("globalState", raw);
      const liqRaw = await withRetry(() => provider.call({ to: poolAddress, data: algebra7Iface.encodeFunctionData("liquidity", []) }));
      const liqDecoded = algebra7Iface.decodeFunctionResult("liquidity", liqRaw);
      return { ok: true, kind: "algebra", sqrtPriceX96: decoded.price ?? decoded[0], tick: decoded.tick ?? decoded[1], liquidity: liqDecoded[0] };
    }
  };

  // Prefer the likely ABI first to reduce noise.
  if (dexHint === "quickswap") {
    try {
      return await tryAlgebra();
    } catch {
      return await tryUniV3();
    }
  }

  try {
    return await tryUniV3();
  } catch {
    return await tryAlgebra();
  }
}

module.exports = {
  readPoolState
};
