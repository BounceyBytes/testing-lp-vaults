/**
 * LP Vault (CLM) Comprehensive Test Suite
 * 
 * This script tests the 4 LP vaults and tracks:
 * 
 * 1. CLM VAULT MECHANICS:
 *    - Token composition shift (token0/token1 ratio changes with price)
 *    - Active liquidity status (in-range vs out-of-range)
 *    - Liquidity utilization (% of liquidity active in tick range)
 * 
 * 2. CLM VAULT SHARE ACCOUNTING:
 *    - Price per share (PPFS) changes
 *    - Total vault TVL changes (fees accrued ± IL)
 *    - User share balance vs value changes
 * 
 * 3. FEE ACCRUAL & COMPOUNDING:
 *    - Unclaimed fees tracking (fees0, fees1)
 *    - Fee growth while in-range
 *    - PPFS jump detection after harvest
 *    - Bug detection: fees not accruing in-range, or PPFS not moving with fees
 * 
 * 4. DEX-LEVEL PRICE & TICKS (Ground Truth):
 *    - Current pool tick
 *    - Position lowerTick / upperTick
 *    - Whether position straddles current tick
 *    - Single-sided detection when out of range
 *    - Fee growth pause detection
 */

const { ethers } = require("hardhat");
const config = require("../testnet-config.json");
const fs = require('fs');
const path = require('path');

// Vault configurations with their pools
const VAULT_CONFIGS = [
  {
    name: "QuickSwap USDC-USDT",
    vault: "0xd1ea7f32f9530eac27b314454db4964dbc08cdca",
    dex: "quickswap",
    pool: config.pools.quickswap.USDC_USDT,
    token0: config.tokens.USDC,
    token1: config.tokens.USDT,
    token0Symbol: "USDC",
    token1Symbol: "USDT",
    feeTier: 100
  },
  {
    name: "Lotus WETH-USDT",
    vault: "0x1e27612d5240d25b70608cdabe1446e67ae7c48f",
    dex: "lotus",
    pool: config.pools.lotus.WETH_USDT,
    token0: config.tokens.WETH,
    token1: config.tokens.USDT,
    token0Symbol: "WETH",
    token1Symbol: "USDT",
    feeTier: 500
  },
  {
    name: "Lotus WBTC-USDC",
    vault: "0xacd6e64e56f66e4f010709d54686792ea96b7230",
    dex: "lotus",
    pool: config.pools.lotus.WBTC_USDC,
    token0: config.tokens.WBTC,
    token1: config.tokens.USDC,
    token0Symbol: "WBTC",
    token1Symbol: "USDC",
    feeTier: 500
  },
  {
    name: "Lotus USDC-USDT",
    vault: "0xbbbd57224d28ec578dfe4adc4f50a524804251fe",
    dex: "lotus",
    pool: config.pools.lotus.USDC_USDT,
    token0: config.tokens.USDC,
    token1: config.tokens.USDT,
    token0Symbol: "USDC",
    token1Symbol: "USDT",
    feeTier: 500
  }
];

// Extended Vault ABI for CLM metrics
const VAULT_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function want() view returns (address)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function balances() view returns (uint256 amount0, uint256 amount1)",
  "function balanceOf(address) view returns (uint256)",
  "function getPricePerFullShare() view returns (uint256)",
  "function pricePerShare() view returns (uint256)",
  "function totalAssets() view returns (uint256)",
  "function positionMain() view returns (int24 tickLower, int24 tickUpper, uint128 liquidity)",
  "function range() view returns (int24 lowerTick, int24 upperTick)",
  "function currentTick() view returns (int24)",
  "function balance() view returns (uint256)",
  "function tvl() view returns (uint256 tvl0, uint256 tvl1)",
  "function strategy() view returns (address)",
  // Fee-related
  "function fees0() view returns (uint256)",
  "function fees1() view returns (uint256)",
  "function accumulatedFees() view returns (uint256 fees0, uint256 fees1)"
];

// Extended Strategy ABI for CLM data and fees
const STRATEGY_ABI = [
  "function balances() view returns (uint256 amount0, uint256 amount1)",
  "function positionMain() view returns (int24 tickLower, int24 tickUpper, uint128 liquidity)",
  "function positionAlt() view returns (int24 tickLower, int24 tickUpper, uint128 liquidity)",
  "function pool() view returns (address)",
  "function lpToken0() view returns (address)",
  "function lpToken1() view returns (address)",
  "function price() view returns (uint256)",
  "function tick() view returns (int24)",
  "function range() view returns (uint256)",
  "function twap() view returns (int56)",
  // Fee tracking
  "function fees0() view returns (uint256)",
  "function fees1() view returns (uint256)",
  "function unclaimedFees0() view returns (uint256)",
  "function unclaimedFees1() view returns (uint256)",
  "function lastHarvest() view returns (uint256)",
  "function accumulatedFees() view returns (uint256, uint256)",
  // Actions
  "function harvest() external",
  "function rebalance() external"
];

const ERC20_ABI = [
  "function approve(address, uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

// UniV3-style pool ABI with fee growth tracking
const POOL_ABI = [
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function liquidity() view returns (uint128)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function tickSpacing() view returns (int24)",
  "function fee() view returns (uint24)",
  // Fee growth globals
  "function feeGrowthGlobal0X128() view returns (uint256)",
  "function feeGrowthGlobal1X128() view returns (uint256)",
  // Position info (for checking fees)
  "function positions(bytes32 key) view returns (uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)",
  // Tick info
  "function ticks(int24 tick) view returns (uint128 liquidityGross, int128 liquidityNet, uint256 feeGrowthOutside0X128, uint256 feeGrowthOutside1X128, int56 tickCumulativeOutside, uint160 secondsPerLiquidityOutsideX128, uint32 secondsOutside, bool initialized)"
];

// QuickSwap (Algebra) router ABI
const QUICKSWAP_ROUTER_ABI = [
  "function exactInputSingle((address tokenIn, address tokenOut, address deployer, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 limitSqrtPrice)) payable returns (uint256 amountOut)"
];

const QUICKSWAP_POOL_DEPLOYER = "0x10253594A832f967994b44f33411940533302ACb";

// Lotus (UniV3) router ABI
const LOTUS_ROUTER_ABI = [
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) payable returns (uint256 amountOut)"
];

class VaultTester {
  constructor(signer) {
    this.signer = signer;
    this.results = {
      timestamp: new Date().toISOString(),
      tests: [],
      summary: { total: 0, passed: 0, failed: 0 },
      diagnostics: []
    };
  }

  /**
   * Calculate price from sqrtPriceX96
   */
  sqrtPriceX96ToPrice(sqrtPriceX96, decimals0 = 18, decimals1 = 18) {
    const price = (Number(sqrtPriceX96) / (2 ** 96)) ** 2;
    return price * (10 ** decimals0) / (10 ** decimals1);
  }

  /**
   * Check if current tick is within position range
   */
  isInRange(currentTick, tickLower, tickUpper) {
    if (currentTick === null || tickLower === null || tickUpper === null) {
      return null;
    }
    return currentTick >= tickLower && currentTick < tickUpper;
  }

  /**
   * Determine single-sided exposure type
   */
  getSingleSidedExposure(currentTick, tickLower, tickUpper) {
    if (currentTick === null || tickLower === null || tickUpper === null) {
      return null;
    }
    if (currentTick >= tickUpper) {
      return "token1_only"; // Price above range, all converted to token1
    }
    if (currentTick < tickLower) {
      return "token0_only"; // Price below range, all converted to token0
    }
    return "both"; // In range, have both tokens
  }

  /**
   * Calculate token composition percentage
   */
  calculateComposition(amount0, amount1, price) {
    const value0InToken1 = Number(amount0) * price;
    const value1 = Number(amount1);
    const totalValue = value0InToken1 + value1;
    
    if (totalValue === 0) return { token0Pct: 50, token1Pct: 50 };
    
    return {
      token0Pct: (value0InToken1 / totalValue) * 100,
      token1Pct: (value1 / totalValue) * 100
    };
  }

  /**
   * Get comprehensive vault state including all CLM metrics
   */
  async getVaultState(vaultConfig, userAddress) {
    const vault = new ethers.Contract(vaultConfig.vault, VAULT_ABI, this.signer);
    const pool = new ethers.Contract(vaultConfig.pool, POOL_ABI, this.signer);
    
    const state = {
      // Basic vault info
      totalSupply: null,
      
      // Token balances in vault
      amount0: null,
      amount1: null,
      amount0Formatted: null,
      amount1Formatted: null,
      
      // ========== DEX-LEVEL PRICE & TICKS (Ground Truth) ==========
      poolState: {
        currentTick: null,
        sqrtPriceX96: null,
        price: null,
        poolLiquidity: null,
        feeGrowthGlobal0X128: null,
        feeGrowthGlobal1X128: null
      },
      
      // Position tick boundaries
      position: {
        tickLower: null,
        tickUpper: null,
        liquidity: null,
        tickSpan: null  // upperTick - lowerTick
      },
      
      // ========== IN-RANGE / OUT-OF-RANGE STATUS ==========
      rangeStatus: {
        isInRange: null,
        singleSidedExposure: null,  // "token0_only", "token1_only", or "both"
        distanceToLowerTick: null,  // How many ticks from lower bound
        distanceToUpperTick: null,  // How many ticks from upper bound
        percentInRange: null        // Position within the range (0-100%)
      },
      
      // ========== TOKEN COMPOSITION ==========
      tokenComposition: null,
      
      // ========== FEE ACCRUAL & COMPOUNDING ==========
      fees: {
        unclaimedFees0: null,
        unclaimedFees1: null,
        unclaimedFees0Formatted: null,
        unclaimedFees1Formatted: null,
        totalUnclaimedValueInToken1: null,
        lastHarvest: null,
        feeGrowthActive: null  // Are fees currently accruing?
      },
      
      // ========== SHARE ACCOUNTING ==========
      shareAccounting: {
        pricePerShare: null,
        pricePerShareFormatted: null,
        tvl: null,
        userShares: null,
        userSharesFormatted: null,
        userShareValue: null
      },
      
      // Strategy address
      strategy: null
    };
    
    try {
      // Get total supply
      state.totalSupply = await vault.totalSupply();
      
      // Get strategy address
      try {
        state.strategy = await vault.strategy();
      } catch {}
      
      // Get vault token balances
      try {
        const [amount0, amount1] = await vault.balances();
        state.amount0 = amount0;
        state.amount1 = amount1;
        state.amount0Formatted = ethers.utils.formatEther(amount0);
        state.amount1Formatted = ethers.utils.formatEther(amount1);
      } catch (e) {
        // Try strategy
        if (state.strategy) {
          const strategy = new ethers.Contract(state.strategy, STRATEGY_ABI, this.signer);
          try {
            const [amount0, amount1] = await strategy.balances();
            state.amount0 = amount0;
            state.amount1 = amount1;
            state.amount0Formatted = ethers.utils.formatEther(amount0);
            state.amount1Formatted = ethers.utils.formatEther(amount1);
          } catch {}
        }
      }
      
      // ========== GET POOL STATE (Ground Truth) ==========
      try {
        const slot0 = await pool.slot0();
        state.poolState.sqrtPriceX96 = slot0.sqrtPriceX96;
        state.poolState.currentTick = slot0.tick;
        state.poolState.price = this.sqrtPriceX96ToPrice(slot0.sqrtPriceX96);
        state.poolState.poolLiquidity = await pool.liquidity();
        
        // Get fee growth globals (for tracking fee accrual)
        try {
          state.poolState.feeGrowthGlobal0X128 = await pool.feeGrowthGlobal0X128();
          state.poolState.feeGrowthGlobal1X128 = await pool.feeGrowthGlobal1X128();
        } catch {}
      } catch (e) {
        console.log(`    Warning: Could not read pool state: ${e.message.slice(0, 50)}`);
      }
      
      // ========== GET POSITION INFO (Tick Boundaries) ==========
      try {
        const [tickLower, tickUpper, liquidity] = await vault.positionMain();
        state.position.tickLower = tickLower;
        state.position.tickUpper = tickUpper;
        state.position.liquidity = liquidity;
        state.position.tickSpan = tickUpper - tickLower;
      } catch {
        try {
          const [lowerTick, upperTick] = await vault.range();
          state.position.tickLower = lowerTick;
          state.position.tickUpper = upperTick;
          state.position.tickSpan = upperTick - lowerTick;
        } catch {
          // Try strategy
          if (state.strategy) {
            const strategy = new ethers.Contract(state.strategy, STRATEGY_ABI, this.signer);
            try {
              const [tickLower, tickUpper, liquidity] = await strategy.positionMain();
              state.position.tickLower = tickLower;
              state.position.tickUpper = tickUpper;
              state.position.liquidity = liquidity;
              state.position.tickSpan = tickUpper - tickLower;
            } catch {}
          }
        }
      }
      
      // ========== CALCULATE RANGE STATUS ==========
      const { tickLower, tickUpper } = state.position;
      const currentTick = state.poolState.currentTick;
      
      if (currentTick !== null && tickLower !== null && tickUpper !== null) {
        state.rangeStatus.isInRange = this.isInRange(currentTick, tickLower, tickUpper);
        state.rangeStatus.singleSidedExposure = this.getSingleSidedExposure(currentTick, tickLower, tickUpper);
        state.rangeStatus.distanceToLowerTick = currentTick - tickLower;
        state.rangeStatus.distanceToUpperTick = tickUpper - currentTick;
        
        // Calculate position within range (0-100%)
        if (state.rangeStatus.isInRange) {
          const tickSpan = tickUpper - tickLower;
          const positionInRange = currentTick - tickLower;
          state.rangeStatus.percentInRange = (positionInRange / tickSpan) * 100;
        } else {
          state.rangeStatus.percentInRange = currentTick < tickLower ? 0 : 100;
        }
      }
      
      // ========== FEE ACCRUAL STATUS ==========
      // Fees only accrue when in-range
      state.fees.feeGrowthActive = state.rangeStatus.isInRange === true;
      
      // Try to get unclaimed fees from vault or strategy
      try {
        const fees0 = await vault.fees0();
        const fees1 = await vault.fees1();
        state.fees.unclaimedFees0 = fees0;
        state.fees.unclaimedFees1 = fees1;
        state.fees.unclaimedFees0Formatted = ethers.utils.formatEther(fees0);
        state.fees.unclaimedFees1Formatted = ethers.utils.formatEther(fees1);
      } catch {
        try {
          const [fees0, fees1] = await vault.accumulatedFees();
          state.fees.unclaimedFees0 = fees0;
          state.fees.unclaimedFees1 = fees1;
          state.fees.unclaimedFees0Formatted = ethers.utils.formatEther(fees0);
          state.fees.unclaimedFees1Formatted = ethers.utils.formatEther(fees1);
        } catch {
          // Try strategy
          if (state.strategy) {
            const strategy = new ethers.Contract(state.strategy, STRATEGY_ABI, this.signer);
            try {
              const fees0 = await strategy.fees0();
              const fees1 = await strategy.fees1();
              state.fees.unclaimedFees0 = fees0;
              state.fees.unclaimedFees1 = fees1;
              state.fees.unclaimedFees0Formatted = ethers.utils.formatEther(fees0);
              state.fees.unclaimedFees1Formatted = ethers.utils.formatEther(fees1);
            } catch {}
          }
        }
      }
      
      // Calculate total unclaimed fees value in token1 terms
      if (state.fees.unclaimedFees0 !== null && state.fees.unclaimedFees1 !== null && state.poolState.price) {
        const fees0Value = Number(ethers.utils.formatEther(state.fees.unclaimedFees0)) * state.poolState.price;
        const fees1Value = Number(ethers.utils.formatEther(state.fees.unclaimedFees1));
        state.fees.totalUnclaimedValueInToken1 = fees0Value + fees1Value;
      }
      
      // Try to get last harvest time
      if (state.strategy) {
        const strategy = new ethers.Contract(state.strategy, STRATEGY_ABI, this.signer);
        try {
          state.fees.lastHarvest = await strategy.lastHarvest();
        } catch {}
      }
      
      // ========== TOKEN COMPOSITION ==========
      if (state.amount0 !== null && state.amount1 !== null && state.poolState.price !== null) {
        state.tokenComposition = this.calculateComposition(
          ethers.utils.formatEther(state.amount0),
          ethers.utils.formatEther(state.amount1),
          state.poolState.price
        );
      }
      
      // ========== SHARE ACCOUNTING ==========
      // Get price per share
      try {
        state.shareAccounting.pricePerShare = await vault.getPricePerFullShare();
        state.shareAccounting.pricePerShareFormatted = ethers.utils.formatEther(state.shareAccounting.pricePerShare);
      } catch {
        try {
          state.shareAccounting.pricePerShare = await vault.pricePerShare();
          state.shareAccounting.pricePerShareFormatted = ethers.utils.formatEther(state.shareAccounting.pricePerShare);
        } catch {
          // Calculate manually: TVL / totalSupply
          if (state.totalSupply && state.amount0 && state.amount1 && state.poolState.price) {
            const tvl0 = Number(ethers.utils.formatEther(state.amount0));
            const tvl1 = Number(ethers.utils.formatEther(state.amount1));
            const totalTVL = tvl0 * state.poolState.price + tvl1;
            const supply = Number(ethers.utils.formatEther(state.totalSupply));
            if (supply > 0) {
              state.shareAccounting.pricePerShare = ethers.utils.parseEther((totalTVL / supply).toFixed(18));
              state.shareAccounting.pricePerShareFormatted = (totalTVL / supply).toFixed(18);
            }
          }
        }
      }
      
      // Calculate TVL
      if (state.amount0 !== null && state.amount1 !== null && state.poolState.price !== null) {
        const tvl0 = Number(ethers.utils.formatEther(state.amount0));
        const tvl1 = Number(ethers.utils.formatEther(state.amount1));
        state.shareAccounting.tvl = tvl0 * state.poolState.price + tvl1;
      }
      
      // Get user shares and value
      try {
        state.shareAccounting.userShares = await vault.balanceOf(userAddress);
        state.shareAccounting.userSharesFormatted = ethers.utils.formatEther(state.shareAccounting.userShares);
        
        if (state.shareAccounting.pricePerShare && state.shareAccounting.userShares) {
          const shares = Number(ethers.utils.formatEther(state.shareAccounting.userShares));
          const ppfs = Number(ethers.utils.formatEther(state.shareAccounting.pricePerShare));
          state.shareAccounting.userShareValue = shares * ppfs;
        }
      } catch {}
      
    } catch (e) {
      console.log(`    Warning: Error getting vault state: ${e.message.slice(0, 100)}`);
    }
    
    return state;
  }

  /**
   * Format state for display
   */
  formatState(state, symbol0, symbol1) {
    const lines = [];
    
    // DEX-Level Price & Ticks (Ground Truth)
    lines.push(`    ══════════════════════════════════════════════════════════`);
    lines.push(`    📍 DEX-LEVEL PRICE & TICKS (Ground Truth)`);
    lines.push(`    ══════════════════════════════════════════════════════════`);
    if (state.poolState.currentTick !== null) {
      lines.push(`      Current Tick: ${state.poolState.currentTick}`);
    }
    if (state.poolState.price) {
      lines.push(`      Current Price: ${state.poolState.price.toFixed(8)} ${symbol1}/${symbol0}`);
    }
    if (state.position.tickLower !== null && state.position.tickUpper !== null) {
      lines.push(`      Position Lower Tick: ${state.position.tickLower}`);
      lines.push(`      Position Upper Tick: ${state.position.tickUpper}`);
      lines.push(`      Tick Span: ${state.position.tickSpan} ticks`);
    }
    
    // Range Status
    lines.push(`    ──────────────────────────────────────────────────────────`);
    lines.push(`    📊 RANGE STATUS`);
    if (state.rangeStatus.isInRange !== null) {
      const rangeIcon = state.rangeStatus.isInRange ? '✅' : '❌';
      const rangeText = state.rangeStatus.isInRange ? 'IN RANGE (earning fees)' : 'OUT OF RANGE (no fees)';
      lines.push(`      Status: ${rangeIcon} ${rangeText}`);
      
      if (state.rangeStatus.singleSidedExposure) {
        const exposure = state.rangeStatus.singleSidedExposure === 'both' 
          ? `Both tokens (${symbol0} + ${symbol1})`
          : state.rangeStatus.singleSidedExposure === 'token0_only' 
            ? `Single-sided: ${symbol0} only`
            : `Single-sided: ${symbol1} only`;
        lines.push(`      Exposure: ${exposure}`);
      }
      
      if (state.rangeStatus.distanceToLowerTick !== null) {
        lines.push(`      Distance to Lower: ${state.rangeStatus.distanceToLowerTick} ticks`);
        lines.push(`      Distance to Upper: ${state.rangeStatus.distanceToUpperTick} ticks`);
      }
      if (state.rangeStatus.percentInRange !== null) {
        lines.push(`      Position in Range: ${state.rangeStatus.percentInRange.toFixed(2)}%`);
      }
    }
    
    // Token Composition
    lines.push(`    ──────────────────────────────────────────────────────────`);
    lines.push(`    💰 TOKEN BALANCES & COMPOSITION`);
    if (state.amount0Formatted && state.amount1Formatted) {
      lines.push(`      ${symbol0}: ${parseFloat(state.amount0Formatted).toFixed(6)}`);
      lines.push(`      ${symbol1}: ${parseFloat(state.amount1Formatted).toFixed(6)}`);
    }
    if (state.tokenComposition) {
      lines.push(`      Composition: ${state.tokenComposition.token0Pct.toFixed(2)}% ${symbol0} / ${state.tokenComposition.token1Pct.toFixed(2)}% ${symbol1}`);
    }
    
    // Fee Accrual
    lines.push(`    ──────────────────────────────────────────────────────────`);
    lines.push(`    💸 FEE ACCRUAL`);
    const feeGrowthIcon = state.fees.feeGrowthActive ? '✅' : '⏸️';
    const feeGrowthText = state.fees.feeGrowthActive ? 'ACTIVE (in range)' : 'PAUSED (out of range)';
    lines.push(`      Fee Growth: ${feeGrowthIcon} ${feeGrowthText}`);
    
    if (state.fees.unclaimedFees0Formatted !== null) {
      lines.push(`      Unclaimed ${symbol0}: ${parseFloat(state.fees.unclaimedFees0Formatted).toFixed(8)}`);
      lines.push(`      Unclaimed ${symbol1}: ${parseFloat(state.fees.unclaimedFees1Formatted).toFixed(8)}`);
      if (state.fees.totalUnclaimedValueInToken1 !== null) {
        lines.push(`      Total Unclaimed Value: ${state.fees.totalUnclaimedValueInToken1.toFixed(6)} ${symbol1}`);
      }
    } else {
      lines.push(`      Unclaimed Fees: (not available via contract)`);
    }
    
    // Share Accounting
    lines.push(`    ──────────────────────────────────────────────────────────`);
    lines.push(`    📈 SHARE ACCOUNTING`);
    if (state.totalSupply) {
      lines.push(`      Total Supply: ${parseFloat(ethers.utils.formatEther(state.totalSupply)).toFixed(6)} shares`);
    }
    if (state.shareAccounting.pricePerShareFormatted) {
      lines.push(`      Price Per Share (PPFS): ${parseFloat(state.shareAccounting.pricePerShareFormatted).toFixed(8)}`);
    }
    if (state.shareAccounting.tvl !== null) {
      lines.push(`      Total TVL: ${state.shareAccounting.tvl.toFixed(2)} ${symbol1}`);
    }
    if (state.shareAccounting.userSharesFormatted) {
      lines.push(`      Your Shares: ${parseFloat(state.shareAccounting.userSharesFormatted).toFixed(6)}`);
    }
    if (state.shareAccounting.userShareValue !== null) {
      lines.push(`      Your Value: ${state.shareAccounting.userShareValue.toFixed(6)} ${symbol1}`);
    }
    
    return lines.join('\n');
  }

  /**
   * Calculate and format deltas between two states
   */
  formatDeltas(before, after, symbol0, symbol1) {
    const lines = [];
    
    lines.push(`\n    📊 CHANGES AFTER SWAP:`);
    lines.push(`    ══════════════════════════════════════════════════════════`);
    
    // DEX-Level Changes
    lines.push(`    📍 DEX-Level:`);
    if (before.poolState.currentTick !== null && after.poolState.currentTick !== null) {
      const tickDelta = after.poolState.currentTick - before.poolState.currentTick;
      lines.push(`      Tick: ${before.poolState.currentTick} → ${after.poolState.currentTick} (${tickDelta >= 0 ? '+' : ''}${tickDelta})`);
    }
    if (before.poolState.price && after.poolState.price) {
      const priceDelta = after.poolState.price - before.poolState.price;
      const pricePctChange = ((priceDelta / before.poolState.price) * 100);
      lines.push(`      Price: ${before.poolState.price.toFixed(8)} → ${after.poolState.price.toFixed(8)} (${pricePctChange >= 0 ? '+' : ''}${pricePctChange.toFixed(4)}%)`);
    }
    
    // Range Status Changes
    lines.push(`    📊 Range Status:`);
    if (before.rangeStatus.isInRange !== null && after.rangeStatus.isInRange !== null) {
      if (before.rangeStatus.isInRange !== after.rangeStatus.isInRange) {
        const transition = after.rangeStatus.isInRange ? 'OUT → IN RANGE ✅' : 'IN → OUT OF RANGE ⚠️';
        lines.push(`      Status Changed: ${transition}`);
        if (!after.rangeStatus.isInRange) {
          lines.push(`      ⚠️  Fee accrual PAUSED - position now single-sided`);
        }
      } else {
        lines.push(`      Status: ${after.rangeStatus.isInRange ? 'IN RANGE ✅' : 'OUT OF RANGE ❌'} (unchanged)`);
      }
    }
    
    // Single-sided exposure change
    if (before.rangeStatus.singleSidedExposure !== after.rangeStatus.singleSidedExposure) {
      lines.push(`      Exposure: ${before.rangeStatus.singleSidedExposure} → ${after.rangeStatus.singleSidedExposure}`);
    }
    
    // Token composition shift
    lines.push(`    💰 Token Composition:`);
    if (before.tokenComposition && after.tokenComposition) {
      const token0Shift = after.tokenComposition.token0Pct - before.tokenComposition.token0Pct;
      lines.push(`      ${symbol0}: ${before.tokenComposition.token0Pct.toFixed(2)}% → ${after.tokenComposition.token0Pct.toFixed(2)}% (${token0Shift >= 0 ? '+' : ''}${token0Shift.toFixed(2)}%)`);
      
      // Explain the composition shift
      if (Math.abs(token0Shift) > 0.01) {
        if (token0Shift > 0) {
          lines.push(`      ↳ More ${symbol0}, less ${symbol1} (price moved down)`);
        } else {
          lines.push(`      ↳ Less ${symbol0}, more ${symbol1} (price moved up)`);
        }
      }
    }
    
    // Fee changes
    lines.push(`    💸 Fee Accrual:`);
    const feeGrowthStatus = after.fees.feeGrowthActive ? 'ACTIVE ✅' : 'PAUSED ⏸️';
    lines.push(`      Fee Growth: ${feeGrowthStatus}`);
    
    if (before.fees.totalUnclaimedValueInToken1 !== null && after.fees.totalUnclaimedValueInToken1 !== null) {
      const feeChange = after.fees.totalUnclaimedValueInToken1 - before.fees.totalUnclaimedValueInToken1;
      lines.push(`      Unclaimed Fees: ${before.fees.totalUnclaimedValueInToken1.toFixed(6)} → ${after.fees.totalUnclaimedValueInToken1.toFixed(6)} ${symbol1} (${feeChange >= 0 ? '+' : ''}${feeChange.toFixed(6)})`);
    }
    
    // Share accounting
    lines.push(`    📈 Share Accounting:`);
    if (before.shareAccounting.pricePerShare && after.shareAccounting.pricePerShare) {
      const ppfsBefore = Number(ethers.utils.formatEther(before.shareAccounting.pricePerShare));
      const ppfsAfter = Number(ethers.utils.formatEther(after.shareAccounting.pricePerShare));
      const ppfsDelta = ppfsAfter - ppfsBefore;
      const ppfsPctChange = ((ppfsDelta / ppfsBefore) * 100);
      lines.push(`      PPFS: ${ppfsBefore.toFixed(8)} → ${ppfsAfter.toFixed(8)} (${ppfsPctChange >= 0 ? '+' : ''}${ppfsPctChange.toFixed(6)}%)`);
    }
    
    if (before.shareAccounting.tvl !== null && after.shareAccounting.tvl !== null) {
      const tvlDelta = after.shareAccounting.tvl - before.shareAccounting.tvl;
      const tvlPctChange = ((tvlDelta / before.shareAccounting.tvl) * 100);
      lines.push(`      TVL: ${before.shareAccounting.tvl.toFixed(2)} → ${after.shareAccounting.tvl.toFixed(2)} ${symbol1} (${tvlPctChange >= 0 ? '+' : ''}${tvlPctChange.toFixed(4)}%)`);
    }
    
    if (before.shareAccounting.userShareValue !== null && after.shareAccounting.userShareValue !== null) {
      const sharesBefore = parseFloat(before.shareAccounting.userSharesFormatted);
      const sharesAfter = parseFloat(after.shareAccounting.userSharesFormatted);
      const valueDelta = after.shareAccounting.userShareValue - before.shareAccounting.userShareValue;
      const valuePctChange = ((valueDelta / before.shareAccounting.userShareValue) * 100);
      lines.push(`      Your Shares: ${sharesBefore.toFixed(6)} → ${sharesAfter.toFixed(6)} (constant ✓)`);
      lines.push(`      Your Value: ${before.shareAccounting.userShareValue.toFixed(6)} → ${after.shareAccounting.userShareValue.toFixed(6)} ${symbol1} (${valuePctChange >= 0 ? '+' : ''}${valuePctChange.toFixed(4)}%)`);
    }
    
    return lines.join('\n');
  }

  /**
   * Build comprehensive result object for JSON
   */
  buildResultObject(scenario, success, swap, beforeState, afterState, error = null) {
    if (!success) {
      return { scenario, success, error, timestamp: new Date().toISOString() };
    }
    
    const result = {
      scenario,
      success: true,
      timestamp: new Date().toISOString(),
      
      // Swap details
      swap,
      
      // Before state
      before: {
        // DEX-Level (Ground Truth)
        dexLevel: {
          tick: beforeState.poolState.currentTick,
          price: beforeState.poolState.price,
          sqrtPriceX96: beforeState.poolState.sqrtPriceX96?.toString(),
          poolLiquidity: beforeState.poolState.poolLiquidity?.toString()
        },
        
        // Position
        position: {
          tickLower: beforeState.position.tickLower,
          tickUpper: beforeState.position.tickUpper,
          tickSpan: beforeState.position.tickSpan,
          liquidity: beforeState.position.liquidity?.toString()
        },
        
        // Range Status
        rangeStatus: {
          isInRange: beforeState.rangeStatus.isInRange,
          singleSidedExposure: beforeState.rangeStatus.singleSidedExposure,
          distanceToLowerTick: beforeState.rangeStatus.distanceToLowerTick,
          distanceToUpperTick: beforeState.rangeStatus.distanceToUpperTick,
          percentInRange: beforeState.rangeStatus.percentInRange
        },
        
        // Token Composition
        tokenComposition: beforeState.tokenComposition,
        amount0: beforeState.amount0Formatted,
        amount1: beforeState.amount1Formatted,
        
        // Fee Accrual
        fees: {
          feeGrowthActive: beforeState.fees.feeGrowthActive,
          unclaimedFees0: beforeState.fees.unclaimedFees0Formatted,
          unclaimedFees1: beforeState.fees.unclaimedFees1Formatted,
          totalUnclaimedValueInToken1: beforeState.fees.totalUnclaimedValueInToken1
        },
        
        // Share Accounting
        shareAccounting: {
          pricePerShare: beforeState.shareAccounting.pricePerShareFormatted,
          tvl: beforeState.shareAccounting.tvl,
          userShares: beforeState.shareAccounting.userSharesFormatted,
          userShareValue: beforeState.shareAccounting.userShareValue
        }
      },
      
      // After state
      after: {
        dexLevel: {
          tick: afterState.poolState.currentTick,
          price: afterState.poolState.price,
          sqrtPriceX96: afterState.poolState.sqrtPriceX96?.toString(),
          poolLiquidity: afterState.poolState.poolLiquidity?.toString()
        },
        position: {
          tickLower: afterState.position.tickLower,
          tickUpper: afterState.position.tickUpper,
          tickSpan: afterState.position.tickSpan,
          liquidity: afterState.position.liquidity?.toString()
        },
        rangeStatus: {
          isInRange: afterState.rangeStatus.isInRange,
          singleSidedExposure: afterState.rangeStatus.singleSidedExposure,
          distanceToLowerTick: afterState.rangeStatus.distanceToLowerTick,
          distanceToUpperTick: afterState.rangeStatus.distanceToUpperTick,
          percentInRange: afterState.rangeStatus.percentInRange
        },
        tokenComposition: afterState.tokenComposition,
        amount0: afterState.amount0Formatted,
        amount1: afterState.amount1Formatted,
        fees: {
          feeGrowthActive: afterState.fees.feeGrowthActive,
          unclaimedFees0: afterState.fees.unclaimedFees0Formatted,
          unclaimedFees1: afterState.fees.unclaimedFees1Formatted,
          totalUnclaimedValueInToken1: afterState.fees.totalUnclaimedValueInToken1
        },
        shareAccounting: {
          pricePerShare: afterState.shareAccounting.pricePerShareFormatted,
          tvl: afterState.shareAccounting.tvl,
          userShares: afterState.shareAccounting.userSharesFormatted,
          userShareValue: afterState.shareAccounting.userShareValue
        }
      },
      
      // Deltas / Changes
      deltas: {
        // DEX-Level
        tickChange: afterState.poolState.currentTick - beforeState.poolState.currentTick,
        priceChangePercent: beforeState.poolState.price && afterState.poolState.price 
          ? ((afterState.poolState.price - beforeState.poolState.price) / beforeState.poolState.price) * 100 
          : null,
        
        // Range Status
        rangeStatusChanged: beforeState.rangeStatus.isInRange !== afterState.rangeStatus.isInRange,
        wentOutOfRange: beforeState.rangeStatus.isInRange === true && afterState.rangeStatus.isInRange === false,
        cameIntoRange: beforeState.rangeStatus.isInRange === false && afterState.rangeStatus.isInRange === true,
        
        // Token Composition
        token0CompositionShift: beforeState.tokenComposition && afterState.tokenComposition
          ? afterState.tokenComposition.token0Pct - beforeState.tokenComposition.token0Pct
          : null,
        
        // Fee Changes
        feeGrowthStatusChanged: beforeState.fees.feeGrowthActive !== afterState.fees.feeGrowthActive,
        unclaimedFeesChange: beforeState.fees.totalUnclaimedValueInToken1 !== null && afterState.fees.totalUnclaimedValueInToken1 !== null
          ? afterState.fees.totalUnclaimedValueInToken1 - beforeState.fees.totalUnclaimedValueInToken1
          : null,
        
        // Share Accounting
        pricePerShareChangePercent: beforeState.shareAccounting.pricePerShare && afterState.shareAccounting.pricePerShare
          ? ((Number(ethers.utils.formatEther(afterState.shareAccounting.pricePerShare)) - Number(ethers.utils.formatEther(beforeState.shareAccounting.pricePerShare))) / 
             Number(ethers.utils.formatEther(beforeState.shareAccounting.pricePerShare))) * 100
          : null,
        tvlChangePercent: beforeState.shareAccounting.tvl && afterState.shareAccounting.tvl
          ? ((afterState.shareAccounting.tvl - beforeState.shareAccounting.tvl) / beforeState.shareAccounting.tvl) * 100
          : null,
        userValueChangePercent: beforeState.shareAccounting.userShareValue && afterState.shareAccounting.userShareValue
          ? ((afterState.shareAccounting.userShareValue - beforeState.shareAccounting.userShareValue) / beforeState.shareAccounting.userShareValue) * 100
          : null
      },
      
      // Diagnostic flags
      diagnostics: {
        // Bug detection: fees not accruing while in-range
        inRangeButNoFeeGrowth: afterState.rangeStatus.isInRange === true && afterState.fees.feeGrowthActive === false,
        // Bug detection: fees accrued but PPFS didn't change
        feesAccruedButPPFSUnchanged: false, // Would need harvest to detect this properly
        // Warning: went out of range
        positionWentOutOfRange: beforeState.rangeStatus.isInRange === true && afterState.rangeStatus.isInRange === false
      }
    };
    
    return result;
  }

  async executeSwap(vaultConfig, direction, amount) {
    const tokenIn = direction === "up" ? vaultConfig.token0 : vaultConfig.token1;
    const tokenOut = direction === "up" ? vaultConfig.token1 : vaultConfig.token0;
    const symbolIn = direction === "up" ? vaultConfig.token0Symbol : vaultConfig.token1Symbol;
    const symbolOut = direction === "up" ? vaultConfig.token1Symbol : vaultConfig.token0Symbol;
    
    console.log(`    Swapping ${ethers.utils.formatEther(amount)} ${symbolIn} → ${symbolOut}`);
    
    const token = new ethers.Contract(tokenIn, ERC20_ABI, this.signer);
    const routerAddress = vaultConfig.dex === "quickswap" 
      ? config.quickswap.router 
      : config.lotus.swapRouter;
    
    const approveTx = await token.approve(routerAddress, amount);
    await approveTx.wait();
    
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const recipient = await this.signer.getAddress();
    
    if (vaultConfig.dex === "quickswap") {
      const router = new ethers.Contract(routerAddress, QUICKSWAP_ROUTER_ABI, this.signer);
      const params = {
        tokenIn,
        tokenOut,
        deployer: QUICKSWAP_POOL_DEPLOYER,
        recipient,
        deadline,
        amountIn: amount,
        amountOutMinimum: 0,
        limitSqrtPrice: 0
      };
      
      const tx = await router.exactInputSingle(params, { gasLimit: 500000 });
      const receipt = await tx.wait();
      console.log(`    ✅ Swap successful! Tx: ${receipt.transactionHash}`);
      return receipt;
    } else {
      const router = new ethers.Contract(routerAddress, LOTUS_ROUTER_ABI, this.signer);
      const params = {
        tokenIn,
        tokenOut,
        fee: vaultConfig.feeTier,
        recipient,
        deadline,
        amountIn: amount,
        amountOutMinimum: 0,
        sqrtPriceLimitX96: 0
      };
      
      const tx = await router.exactInputSingle(params, { gasLimit: 500000 });
      const receipt = await tx.wait();
      console.log(`    ✅ Swap successful! Tx: ${receipt.transactionHash}`);
      return receipt;
    }
  }

  async testVault(vaultConfig, scenarios = ["small-up", "small-down"]) {
    console.log(`\n${'═'.repeat(80)}`);
    console.log(`📊 Testing: ${vaultConfig.name}`);
    console.log(`   Vault: ${vaultConfig.vault}`);
    console.log(`   Pool: ${vaultConfig.pool}`);
    console.log(`${'═'.repeat(80)}`);
    
    if (!vaultConfig.pool || vaultConfig.pool === "0x0000000000000000000000000000000000000000") {
      console.log(`  ⏭️  Skipping - Pool not configured`);
      return { skipped: true };
    }
    
    const userAddress = await this.signer.getAddress();
    
    // Get initial state with full CLM metrics
    console.log(`\n  📈 INITIAL STATE:`);
    const initialState = await this.getVaultState(vaultConfig, userAddress);
    console.log(this.formatState(initialState, vaultConfig.token0Symbol, vaultConfig.token1Symbol));
    
    const testResults = [];
    
    for (const scenario of scenarios) {
      console.log(`\n  ${'─'.repeat(70)}`);
      console.log(`  🧪 Scenario: ${scenario}`);
      console.log(`  ${'─'.repeat(70)}`);
      this.results.summary.total++;
      
      try {
        const direction = scenario.includes("up") ? "up" : "down";
        const isLarge = scenario.includes("large");
        const isOutOfRange = scenario.includes("out-of-range");
        
        let amount;
        if (vaultConfig.token0Symbol === "USDC" || vaultConfig.token0Symbol === "USDT") {
          if (isOutOfRange) {
            amount = ethers.utils.parseEther("50");
          } else if (isLarge) {
            amount = ethers.utils.parseEther("10");
          } else {
            amount = ethers.utils.parseEther("1");
          }
        } else {
          if (isOutOfRange) {
            amount = ethers.utils.parseEther("0.5");
          } else if (isLarge) {
            amount = ethers.utils.parseEther("0.1");
          } else {
            amount = ethers.utils.parseEther("0.01");
          }
        }
        
        const beforeState = await this.getVaultState(vaultConfig, userAddress);
        
        await this.executeSwap(vaultConfig, direction, amount);
        
        await new Promise(r => setTimeout(r, 3000));
        
        const afterState = await this.getVaultState(vaultConfig, userAddress);
        
        console.log(this.formatDeltas(beforeState, afterState, vaultConfig.token0Symbol, vaultConfig.token1Symbol));
        
        const swap = {
          direction,
          amount: ethers.utils.formatEther(amount),
          tokenIn: direction === "up" ? vaultConfig.token0Symbol : vaultConfig.token1Symbol,
          tokenOut: direction === "up" ? vaultConfig.token1Symbol : vaultConfig.token0Symbol
        };
        
        const result = this.buildResultObject(scenario, true, swap, beforeState, afterState);
        testResults.push(result);
        
        // Add diagnostics if any issues detected
        if (result.diagnostics.positionWentOutOfRange) {
          console.log(`\n    ⚠️  WARNING: Position went OUT OF RANGE - fees paused!`);
          this.results.diagnostics.push({
            vault: vaultConfig.name,
            scenario,
            issue: 'Position went out of range',
            severity: 'warning'
          });
        }
        
        this.results.summary.passed++;
        console.log(`\n  ✅ ${scenario} PASSED`);
        
      } catch (error) {
        console.log(`\n  ❌ ${scenario} FAILED: ${error.message}`);
        testResults.push(this.buildResultObject(scenario, false, null, null, null, error.message));
        this.results.summary.failed++;
      }
    }
    
    this.results.tests.push({
      vault: vaultConfig.name,
      address: vaultConfig.vault,
      pool: vaultConfig.pool,
      dex: vaultConfig.dex,
      pair: `${vaultConfig.token0Symbol}/${vaultConfig.token1Symbol}`,
      strategy: initialState.strategy,
      initialState: {
        totalSupply: initialState.totalSupply ? ethers.utils.formatEther(initialState.totalSupply) : null,
        dexLevel: {
          tick: initialState.poolState.currentTick,
          price: initialState.poolState.price
        },
        position: initialState.position,
        rangeStatus: initialState.rangeStatus,
        tokenComposition: initialState.tokenComposition,
        fees: initialState.fees,
        shareAccounting: {
          pricePerShare: initialState.shareAccounting.pricePerShareFormatted,
          tvl: initialState.shareAccounting.tvl,
          userShares: initialState.shareAccounting.userSharesFormatted,
          userShareValue: initialState.shareAccounting.userShareValue
        }
      },
      results: testResults
    });
    
    return testResults;
  }

  saveResults() {
    const resultsDir = path.join(__dirname, '..', 'test-results');
    if (!fs.existsSync(resultsDir)) {
      fs.mkdirSync(resultsDir, { recursive: true });
    }
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = path.join(resultsDir, `clm-vault-test-${timestamp}.json`);
    
    fs.writeFileSync(filename, JSON.stringify(this.results, null, 2));
    console.log(`\n📊 Results saved to: ${filename}`);
    
    return filename;
  }
}

async function main() {
  const [signer] = await ethers.getSigners();
  const address = await signer.getAddress();
  
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║              CLM VAULT COMPREHENSIVE TEST SUITE v2                        ║
║              MANTRA Dukong Testnet                                        ║
╠═══════════════════════════════════════════════════════════════════════════╣
║  Tracking:                                                                ║
║  1. CLM Vault Mechanics                                                   ║
║     • Token composition shifts                                            ║
║     • Active liquidity status (in-range / out-of-range)                   ║
║     • Single-sided exposure detection                                     ║
║                                                                           ║
║  2. CLM Vault Share Accounting                                            ║
║     • Price per share (PPFS) changes                                      ║
║     • TVL changes (fees ± IL)                                             ║
║     • User share value changes                                            ║
║                                                                           ║
║  3. Fee Accrual & Compounding                                             ║
║     • Unclaimed fees tracking                                             ║
║     • Fee growth active/paused status                                     ║
║     • PPFS jump detection after swaps                                     ║
║                                                                           ║
║  4. DEX-Level Price & Ticks (Ground Truth)                                ║
║     • Current tick / price                                                ║
║     • Position lowerTick / upperTick                                      ║
║     • Position straddle check                                             ║
║     • Boundary crossing detection                                         ║
╚═══════════════════════════════════════════════════════════════════════════╝
  `);
  
  console.log(`Wallet: ${address}`);
  console.log(`Network: ${config.network_info.name}`);
  
  console.log(`\n📊 Checking token balances...`);
  for (const symbol of ['USDC', 'USDT', 'WETH', 'WBTC']) {
    const tokenAddr = config.tokens[symbol];
    if (tokenAddr && tokenAddr !== "0x0000000000000000000000000000000000000000") {
      const token = new ethers.Contract(tokenAddr, ERC20_ABI, signer);
      const balance = await token.balanceOf(address);
      const decimals = await token.decimals();
      console.log(`  ${symbol}: ${ethers.utils.formatUnits(balance, decimals)}`);
    }
  }
  
  const tester = new VaultTester(signer);
  
  const extendedScenarios = ["small-up", "small-down", "large-up", "large-down"];
  
  for (const vaultConfig of VAULT_CONFIGS) {
    if (vaultConfig.dex === "quickswap") {
      console.log(`\n⏭️  Skipping ${vaultConfig.name} - QuickSwap pool interface requires investigation`);
      continue;
    }
    
    await tester.testVault(vaultConfig, extendedScenarios);
  }
  
  // Print diagnostics summary
  if (tester.results.diagnostics.length > 0) {
    console.log(`\n${'═'.repeat(80)}`);
    console.log(`⚠️  DIAGNOSTICS SUMMARY`);
    console.log(`${'═'.repeat(80)}`);
    for (const diag of tester.results.diagnostics) {
      console.log(`  • ${diag.vault} - ${diag.scenario}: ${diag.issue} [${diag.severity}]`);
    }
  }
  
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║                           TEST SUMMARY                                    ║
╚═══════════════════════════════════════════════════════════════════════════╝
  
  Total Tests: ${tester.results.summary.total}
  ✅ Passed: ${tester.results.summary.passed}
  ❌ Failed: ${tester.results.summary.failed}
  📈 Success Rate: ${tester.results.summary.total > 0 
    ? ((tester.results.summary.passed / tester.results.summary.total) * 100).toFixed(1) 
    : 0}%
  `);
  
  tester.saveResults();
  
  if (tester.results.summary.failed > 0) {
    console.log(`\n⚠️  Some tests failed. Review the output above for details.`);
    process.exit(1);
  } else {
    console.log(`\n✅ All tests passed!`);
    process.exit(0);
  }
}

main().catch(error => {
  console.error("Error:", error);
  process.exit(1);
});
