const { ethers } = require("hardhat");

/**
 * Resilient Tick Reader
 * 
 * Tries multiple methods to determine the tick range of a vault/strategy.
 * Validates results for plausibility.
 */
class TickReader {
  constructor(signer) {
    this.signer = signer;
    
    this.ABI = [
      "function positionMain() view returns (int24 tickLower, int24 tickUpper, uint128 liquidity)",
      "function range() view returns (int24 lowerTick, int24 upperTick)",
      "function strategy() view returns (address)",
      // Alternates
      "function ticks() view returns (int24 tickLower, int24 tickUpper)",
      "function getPosition() view returns (int24 tickLower, int24 tickUpper)" 
    ];
  }

  /**
   * Try to get the tick range for a vault
   * @param {string} vaultAddress 
   * @param {object} options
   * @returns {Promise<{tickLower: number, tickUpper: number, method: string}|null>}
   */
  async getTickRange(vaultAddress) {
    const vault = new ethers.Contract(vaultAddress, this.ABI, this.signer);
    let strategyAddress = null;
    let strategy = null;

    // 1. Try to get strategy address
    try {
      strategyAddress = await vault.strategy();
      strategy = new ethers.Contract(strategyAddress, this.ABI, this.signer);
    } catch (e) {
      // It's okay if we can't get the strategy, we'll just check the vault
    }

    // Define attempts in priority order
    // Each attempt: { label, contract, method }
    const attempts = [];
    
    if (strategy) {
      attempts.push({ label: "strategy.positionMain", contract: strategy, func: async (c) => c.positionMain() });
      attempts.push({ label: "strategy.range", contract: strategy, func: async (c) => c.range() });
      attempts.push({ label: "strategy.ticks", contract: strategy, func: async (c) => c.ticks() });
      attempts.push({ label: "strategy.getPosition", contract: strategy, func: async (c) => c.getPosition() });
    }
    
    attempts.push({ label: "vault.positionMain", contract: vault, func: async (c) => c.positionMain() });
    attempts.push({ label: "vault.range", contract: vault, func: async (c) => c.range() });
    attempts.push({ label: "vault.ticks", contract: vault, func: async (c) => c.ticks() });
    attempts.push({ label: "vault.getPosition", contract: vault, func: async (c) => c.getPosition() });

    const errors = [];

    for (const attempt of attempts) {
      try {
        const result = await attempt.func(attempt.contract);
        
        // Normalize result
        // Some methods return [lower, upper, liquidity], some [lower, upper]
        // result is an array-like object
        
        let rawLower, rawUpper;
        
        if (result && typeof result.tickLower !== 'undefined') {
          // Named return values if using Typechain/Ethers parsed? 
          // Ethers usually allows access by index or name if ABI specifies it.
          rawLower = result.tickLower;
          rawUpper = result.tickUpper;
        } else if (result && typeof result.lowerTick !== 'undefined') {
          rawLower = result.lowerTick;
          rawUpper = result.upperTick;
        } else if (result.length >= 2) {
          rawLower = result[0];
          rawUpper = result[1];
        } else {
          continue; // Invalid result format
        }
        
        // Convert to numbers
        let lower = Number(rawLower);
        let upper = Number(rawUpper);

        // Handle inverted ranges
        if (lower > upper) {
          const temp = lower;
          lower = upper;
          upper = temp;
        }

        // Validate
        if (this.isValidTick(lower) && this.isValidTick(upper) && lower < upper) {
          return {
            tickLower: lower,
            tickUpper: upper,
            method: attempt.label
          };
        } else {
          errors.push(`${attempt.label} returned invalid ticks: [${lower}, ${upper}]`);
        }
      } catch (e) {
        // Ignore errors and try next
        // errors.push(`${attempt.label} failed: ${e.message}`);
      }
    }

    // console.log("TickReader debug errors:", errors);
    return null;
  }

  isValidTick(tick) {
    if (tick === null || tick === undefined || isNaN(tick)) return false;
    // Uniswap V3 min/max ticks are +/- 887272
    return Math.abs(tick) <= 1000000;
  }
}

module.exports = TickReader;
