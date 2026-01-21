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
 */

const { ethers } = require("hardhat");
const config = require("../testnet-config.json");
const fs = require('fs');
const path = require('path');

// Vault configurations with their pools
// Fee tiers discovered from on-chain pool data
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
    feeTier: 100  // 0.01% - actual fee tier from pool
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
    feeTier: 500  // 0.05% - actual fee tier from pool
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
    feeTier: 500  // 0.05% - actual fee tier from pool
  },
  {
    name: "Lotus USDC-USDT",
    vault: "0xbbbd57224d28ec578dfe4adc4f50a524804251fe",
    dex: "lotus",
    pool: config.pools.lotus.USDC_USDT,
    // Note: Pool has USDT as token0, USDC as token1 on-chain
    token0: config.tokens.USDC,
    token1: config.tokens.USDT,
    token0Symbol: "USDC",
    token1Symbol: "USDT",
    feeTier: 500  // 0.05%
  }
];

// Extended Vault ABI for CLM metrics
const VAULT_ABI = [
  // Basic info
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  
  // Token info
  "function want() view returns (address)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  
  // Balances and positions
  "function balances() view returns (uint256 amount0, uint256 amount1)",
  "function balanceOf(address) view returns (uint256)",
  
  // Price per share / share value
  "function getPricePerFullShare() view returns (uint256)",
  "function pricePerShare() view returns (uint256)",
  "function totalAssets() view returns (uint256)",
  
  // Position info (CLM specific)
  "function positionMain() view returns (int24 tickLower, int24 tickUpper, uint128 liquidity)",
  "function range() view returns (int24 lowerTick, int24 upperTick)",
  "function currentTick() view returns (int24)",
  
  // TVL / value
  "function balance() view returns (uint256)",
  "function tvl() view returns (uint256 tvl0, uint256 tvl1)",
  
  // Strategy
  "function strategy() view returns (address)"
];

// Strategy ABI (for additional CLM data)
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
  "function rebalance() external"
];

const ERC20_ABI = [
  "function approve(address, uint256) returns (bool)",
  "function balanceOf(address) view returns (uint256)",
  "function decimals() view returns (uint8)",
  "function symbol() view returns (string)"
];

const POOL_ABI = [
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16, uint16, uint16, uint8, bool)",
  "function liquidity() view returns (uint128)",
  "function token0() view returns (address)",
  "function token1() view returns (address)",
  "function tickSpacing() view returns (int24)"
];

// QuickSwap (Algebra) router ABI - note: includes 'deployer' field!
const QUICKSWAP_ROUTER_ABI = [
  "function exactInputSingle((address tokenIn, address tokenOut, address deployer, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 limitSqrtPrice)) payable returns (uint256 amountOut)"
];

// QuickSwap pool deployer (same as factory for Algebra)
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
      summary: { total: 0, passed: 0, failed: 0 }
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
    return currentTick >= tickLower && currentTick < tickUpper;
  }

  /**
   * Calculate token composition percentage
   */
  calculateComposition(amount0, amount1, price) {
    // Convert to common value (using token1 as base)
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
   * Get comprehensive vault state including CLM metrics
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
      
      // Pool state
      currentTick: null,
      sqrtPriceX96: null,
      poolLiquidity: null,
      price: null,
      
      // Position info
      tickLower: null,
      tickUpper: null,
      positionLiquidity: null,
      
      // CLM Mechanics
      isInRange: null,
      tokenComposition: null,
      liquidityUtilization: null,
      
      // Share accounting
      pricePerShare: null,
      userShares: null,
      userShareValue: null,
      tvl: null
    };
    
    try {
      // Get total supply
      state.totalSupply = await vault.totalSupply();
      
      // Get vault token balances
      try {
        const [amount0, amount1] = await vault.balances();
        state.amount0 = amount0;
        state.amount1 = amount1;
        state.amount0Formatted = ethers.utils.formatEther(amount0);
        state.amount1Formatted = ethers.utils.formatEther(amount1);
      } catch (e) {
        // Try strategy
        const strategyAddr = await vault.strategy().catch(() => null);
        if (strategyAddr) {
          const strategy = new ethers.Contract(strategyAddr, STRATEGY_ABI, this.signer);
          try {
            const [amount0, amount1] = await strategy.balances();
            state.amount0 = amount0;
            state.amount1 = amount1;
            state.amount0Formatted = ethers.utils.formatEther(amount0);
            state.amount1Formatted = ethers.utils.formatEther(amount1);
          } catch {}
        }
      }
      
      // Get pool state
      try {
        const slot0 = await pool.slot0();
        state.sqrtPriceX96 = slot0.sqrtPriceX96;
        state.currentTick = slot0.tick;
        state.poolLiquidity = await pool.liquidity();
        state.price = this.sqrtPriceX96ToPrice(slot0.sqrtPriceX96);
      } catch (e) {
        console.log(`    Warning: Could not read pool state: ${e.message.slice(0, 50)}`);
      }
      
      // Get position info (tick range)
      try {
        const [tickLower, tickUpper, liquidity] = await vault.positionMain();
        state.tickLower = tickLower;
        state.tickUpper = tickUpper;
        state.positionLiquidity = liquidity;
      } catch {
        // Try range() method
        try {
          const [lowerTick, upperTick] = await vault.range();
          state.tickLower = lowerTick;
          state.tickUpper = upperTick;
        } catch {
          // Try strategy
          const strategyAddr = await vault.strategy().catch(() => null);
          if (strategyAddr) {
            const strategy = new ethers.Contract(strategyAddr, STRATEGY_ABI, this.signer);
            try {
              const [tickLower, tickUpper, liquidity] = await strategy.positionMain();
              state.tickLower = tickLower;
              state.tickUpper = tickUpper;
              state.positionLiquidity = liquidity;
            } catch {}
          }
        }
      }
      
      // Calculate CLM mechanics
      if (state.currentTick !== null && state.tickLower !== null && state.tickUpper !== null) {
        state.isInRange = this.isInRange(state.currentTick, state.tickLower, state.tickUpper);
      }
      
      if (state.amount0 !== null && state.amount1 !== null && state.price !== null) {
        state.tokenComposition = this.calculateComposition(
          ethers.utils.formatEther(state.amount0),
          ethers.utils.formatEther(state.amount1),
          state.price
        );
      }
      
      // Calculate liquidity utilization (simplified: position liquidity vs pool liquidity)
      if (state.positionLiquidity && state.poolLiquidity) {
        const posLiq = Number(state.positionLiquidity.toString());
        const poolLiq = Number(state.poolLiquidity.toString());
        state.liquidityUtilization = poolLiq > 0 ? (posLiq / poolLiq) * 100 : 0;
      }
      
      // Get price per share
      try {
        state.pricePerShare = await vault.getPricePerFullShare();
      } catch {
        try {
          state.pricePerShare = await vault.pricePerShare();
        } catch {
          // Calculate manually: TVL / totalSupply
          if (state.totalSupply && state.amount0 && state.amount1 && state.price) {
            const tvl0 = Number(ethers.utils.formatEther(state.amount0));
            const tvl1 = Number(ethers.utils.formatEther(state.amount1));
            const totalTVL = tvl0 * state.price + tvl1;
            const supply = Number(ethers.utils.formatEther(state.totalSupply));
            state.pricePerShare = ethers.utils.parseEther((totalTVL / supply).toFixed(18));
          }
        }
      }
      
      // Get user shares and value
      try {
        state.userShares = await vault.balanceOf(userAddress);
        if (state.pricePerShare && state.userShares) {
          const shares = Number(ethers.utils.formatEther(state.userShares));
          const ppfs = Number(ethers.utils.formatEther(state.pricePerShare));
          state.userShareValue = shares * ppfs;
        }
      } catch {}
      
      // Calculate TVL
      if (state.amount0 !== null && state.amount1 !== null && state.price !== null) {
        const tvl0 = Number(ethers.utils.formatEther(state.amount0));
        const tvl1 = Number(ethers.utils.formatEther(state.amount1));
        state.tvl = tvl0 * state.price + tvl1;
      }
      
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
    
    // Token Balances
    if (state.amount0Formatted && state.amount1Formatted) {
      lines.push(`    Token Balances:`);
      lines.push(`      ${symbol0}: ${parseFloat(state.amount0Formatted).toFixed(6)}`);
      lines.push(`      ${symbol1}: ${parseFloat(state.amount1Formatted).toFixed(6)}`);
    }
    
    // Token Composition
    if (state.tokenComposition) {
      lines.push(`    Token Composition:`);
      lines.push(`      ${symbol0}: ${state.tokenComposition.token0Pct.toFixed(2)}%`);
      lines.push(`      ${symbol1}: ${state.tokenComposition.token1Pct.toFixed(2)}%`);
    }
    
    // Pool/Position State
    if (state.currentTick !== null) {
      lines.push(`    Pool State:`);
      lines.push(`      Current Tick: ${state.currentTick}`);
      if (state.price) lines.push(`      Price: ${state.price.toFixed(8)}`);
    }
    
    if (state.tickLower !== null && state.tickUpper !== null) {
      lines.push(`    Position Range:`);
      lines.push(`      Lower Tick: ${state.tickLower}`);
      lines.push(`      Upper Tick: ${state.tickUpper}`);
      lines.push(`      In Range: ${state.isInRange ? '✅ YES (earning fees)' : '❌ NO (single-sided, no fees)'}`);
    }
    
    // Liquidity Utilization
    if (state.liquidityUtilization !== null) {
      lines.push(`    Liquidity Utilization: ${state.liquidityUtilization.toFixed(4)}%`);
    }
    
    // Share Accounting
    lines.push(`    Share Accounting:`);
    if (state.totalSupply) {
      lines.push(`      Total Supply: ${parseFloat(ethers.utils.formatEther(state.totalSupply)).toFixed(6)} shares`);
    }
    if (state.pricePerShare) {
      lines.push(`      Price Per Share: ${parseFloat(ethers.utils.formatEther(state.pricePerShare)).toFixed(8)}`);
    }
    if (state.tvl !== null) {
      lines.push(`      Total TVL: ${state.tvl.toFixed(2)} (in ${symbol1} terms)`);
    }
    if (state.userShares) {
      lines.push(`      Your Shares: ${parseFloat(ethers.utils.formatEther(state.userShares)).toFixed(6)}`);
    }
    if (state.userShareValue !== null) {
      lines.push(`      Your Value: ${state.userShareValue.toFixed(6)} (in ${symbol1} terms)`);
    }
    
    return lines.join('\n');
  }

  /**
   * Calculate and format deltas between two states
   */
  formatDeltas(before, after, symbol0, symbol1) {
    const lines = [];
    
    lines.push(`\n    📊 CHANGES:`);
    
    // Tick change
    if (before.currentTick !== null && after.currentTick !== null) {
      const tickDelta = after.currentTick - before.currentTick;
      lines.push(`      Tick: ${before.currentTick} → ${after.currentTick} (${tickDelta >= 0 ? '+' : ''}${tickDelta})`);
    }
    
    // Price change
    if (before.price && after.price) {
      const priceDelta = after.price - before.price;
      const pricePctChange = ((priceDelta / before.price) * 100);
      lines.push(`      Price: ${before.price.toFixed(8)} → ${after.price.toFixed(8)} (${pricePctChange >= 0 ? '+' : ''}${pricePctChange.toFixed(4)}%)`);
    }
    
    // Token composition shift
    if (before.tokenComposition && after.tokenComposition) {
      const token0Shift = after.tokenComposition.token0Pct - before.tokenComposition.token0Pct;
      lines.push(`      ${symbol0} Composition: ${before.tokenComposition.token0Pct.toFixed(2)}% → ${after.tokenComposition.token0Pct.toFixed(2)}% (${token0Shift >= 0 ? '+' : ''}${token0Shift.toFixed(2)}%)`);
    }
    
    // In-range status change
    if (before.isInRange !== null && after.isInRange !== null) {
      if (before.isInRange !== after.isInRange) {
        lines.push(`      Range Status: ${before.isInRange ? 'IN RANGE' : 'OUT OF RANGE'} → ${after.isInRange ? 'IN RANGE' : 'OUT OF RANGE'} ⚠️`);
      } else {
        lines.push(`      Range Status: ${after.isInRange ? 'IN RANGE ✅' : 'OUT OF RANGE ❌'} (unchanged)`);
      }
    }
    
    // Price per share change
    if (before.pricePerShare && after.pricePerShare) {
      const ppfsBefore = Number(ethers.utils.formatEther(before.pricePerShare));
      const ppfsAfter = Number(ethers.utils.formatEther(after.pricePerShare));
      const ppfsDelta = ppfsAfter - ppfsBefore;
      const ppfsPctChange = ((ppfsDelta / ppfsBefore) * 100);
      lines.push(`      Price Per Share: ${ppfsBefore.toFixed(8)} → ${ppfsAfter.toFixed(8)} (${ppfsPctChange >= 0 ? '+' : ''}${ppfsPctChange.toFixed(6)}%)`);
    }
    
    // TVL change
    if (before.tvl !== null && after.tvl !== null) {
      const tvlDelta = after.tvl - before.tvl;
      const tvlPctChange = ((tvlDelta / before.tvl) * 100);
      lines.push(`      TVL: ${before.tvl.toFixed(2)} → ${after.tvl.toFixed(2)} (${tvlPctChange >= 0 ? '+' : ''}${tvlPctChange.toFixed(4)}%)`);
    }
    
    // User value change (shares stay constant)
    if (before.userShareValue !== null && after.userShareValue !== null && before.userShares && after.userShares) {
      const sharesBefore = Number(ethers.utils.formatEther(before.userShares));
      const sharesAfter = Number(ethers.utils.formatEther(after.userShares));
      const valueDelta = after.userShareValue - before.userShareValue;
      const valuePctChange = ((valueDelta / before.userShareValue) * 100);
      lines.push(`      Your Shares: ${sharesBefore.toFixed(6)} → ${sharesAfter.toFixed(6)} (constant)`);
      lines.push(`      Your Value: ${before.userShareValue.toFixed(6)} → ${after.userShareValue.toFixed(6)} (${valuePctChange >= 0 ? '+' : ''}${valuePctChange.toFixed(4)}%)`);
    }
    
    return lines.join('\n');
  }

  async executeSwap(vaultConfig, direction, amount) {
    const tokenIn = direction === "up" ? vaultConfig.token0 : vaultConfig.token1;
    const tokenOut = direction === "up" ? vaultConfig.token1 : vaultConfig.token0;
    const symbolIn = direction === "up" ? vaultConfig.token0Symbol : vaultConfig.token1Symbol;
    const symbolOut = direction === "up" ? vaultConfig.token1Symbol : vaultConfig.token0Symbol;
    
    console.log(`    Swapping ${ethers.utils.formatEther(amount)} ${symbolIn} → ${symbolOut}`);
    
    // Approve token
    const token = new ethers.Contract(tokenIn, ERC20_ABI, this.signer);
    const routerAddress = vaultConfig.dex === "quickswap" 
      ? config.quickswap.router 
      : config.lotus.swapRouter;
    
    const approveTx = await token.approve(routerAddress, amount);
    await approveTx.wait();
    
    const deadline = Math.floor(Date.now() / 1000) + 3600;
    const recipient = await this.signer.getAddress();
    
    if (vaultConfig.dex === "quickswap") {
      // QuickSwap (Algebra) swap - requires deployer field
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
      // Lotus (UniV3) swap
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
    
    // Check if pool exists
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
        
        // Determine swap amount based on scenario and token pair
        let amount;
        if (vaultConfig.token0Symbol === "USDC" || vaultConfig.token0Symbol === "USDT") {
          // Stablecoin pair - use smaller amounts
          if (isOutOfRange) {
            amount = ethers.utils.parseEther("50");  // $50 for out-of-range
          } else if (isLarge) {
            amount = ethers.utils.parseEther("10");   // $10 for large
          } else {
            amount = ethers.utils.parseEther("1");    // $1 for small
          }
        } else {
          // Non-stablecoin - adjust amount
          if (isOutOfRange) {
            amount = ethers.utils.parseEther("0.5");   // 0.5 ETH/BTC for out-of-range
          } else if (isLarge) {
            amount = ethers.utils.parseEther("0.1");   // 0.1 ETH/BTC for large
          } else {
            amount = ethers.utils.parseEther("0.01");  // 0.01 for small
          }
        }
        
        // Get state before swap
        const beforeState = await this.getVaultState(vaultConfig, userAddress);
        
        // Execute swap
        await this.executeSwap(vaultConfig, direction, amount);
        
        // Wait a bit for state to update
        await new Promise(r => setTimeout(r, 3000));
        
        // Get state after swap
        const afterState = await this.getVaultState(vaultConfig, userAddress);
        
        // Display deltas
        console.log(this.formatDeltas(beforeState, afterState, vaultConfig.token0Symbol, vaultConfig.token1Symbol));
        
        // Build result object with all metrics
        const result = {
          scenario,
          success: true,
          timestamp: new Date().toISOString(),
          swap: {
            direction,
            amount: ethers.utils.formatEther(amount),
            tokenIn: direction === "up" ? vaultConfig.token0Symbol : vaultConfig.token1Symbol,
            tokenOut: direction === "up" ? vaultConfig.token1Symbol : vaultConfig.token0Symbol
          },
          before: {
            tick: beforeState.currentTick,
            price: beforeState.price,
            tickLower: beforeState.tickLower,
            tickUpper: beforeState.tickUpper,
            isInRange: beforeState.isInRange,
            tokenComposition: beforeState.tokenComposition,
            liquidityUtilization: beforeState.liquidityUtilization,
            pricePerShare: beforeState.pricePerShare ? ethers.utils.formatEther(beforeState.pricePerShare) : null,
            tvl: beforeState.tvl,
            userShares: beforeState.userShares ? ethers.utils.formatEther(beforeState.userShares) : null,
            userShareValue: beforeState.userShareValue,
            amount0: beforeState.amount0Formatted,
            amount1: beforeState.amount1Formatted
          },
          after: {
            tick: afterState.currentTick,
            price: afterState.price,
            tickLower: afterState.tickLower,
            tickUpper: afterState.tickUpper,
            isInRange: afterState.isInRange,
            tokenComposition: afterState.tokenComposition,
            liquidityUtilization: afterState.liquidityUtilization,
            pricePerShare: afterState.pricePerShare ? ethers.utils.formatEther(afterState.pricePerShare) : null,
            tvl: afterState.tvl,
            userShares: afterState.userShares ? ethers.utils.formatEther(afterState.userShares) : null,
            userShareValue: afterState.userShareValue,
            amount0: afterState.amount0Formatted,
            amount1: afterState.amount1Formatted
          },
          deltas: {
            tick: afterState.currentTick - beforeState.currentTick,
            priceChange: beforeState.price && afterState.price ? ((afterState.price - beforeState.price) / beforeState.price) * 100 : null,
            token0CompositionShift: beforeState.tokenComposition && afterState.tokenComposition ? 
              afterState.tokenComposition.token0Pct - beforeState.tokenComposition.token0Pct : null,
            rangeStatusChanged: beforeState.isInRange !== afterState.isInRange,
            pricePerShareChange: beforeState.pricePerShare && afterState.pricePerShare ?
              ((Number(ethers.utils.formatEther(afterState.pricePerShare)) - Number(ethers.utils.formatEther(beforeState.pricePerShare))) / 
               Number(ethers.utils.formatEther(beforeState.pricePerShare))) * 100 : null,
            tvlChange: beforeState.tvl && afterState.tvl ? 
              ((afterState.tvl - beforeState.tvl) / beforeState.tvl) * 100 : null,
            userValueChange: beforeState.userShareValue && afterState.userShareValue ?
              ((afterState.userShareValue - beforeState.userShareValue) / beforeState.userShareValue) * 100 : null
          }
        };
        
        testResults.push(result);
        this.results.summary.passed++;
        console.log(`\n  ✅ ${scenario} PASSED`);
        
      } catch (error) {
        console.log(`\n  ❌ ${scenario} FAILED: ${error.message}`);
        testResults.push({
          scenario,
          success: false,
          error: error.message
        });
        this.results.summary.failed++;
      }
    }
    
    this.results.tests.push({
      vault: vaultConfig.name,
      address: vaultConfig.vault,
      pool: vaultConfig.pool,
      dex: vaultConfig.dex,
      pair: `${vaultConfig.token0Symbol}/${vaultConfig.token1Symbol}`,
      initialState: {
        totalSupply: initialState.totalSupply ? ethers.utils.formatEther(initialState.totalSupply) : null,
        amount0: initialState.amount0Formatted,
        amount1: initialState.amount1Formatted,
        tick: initialState.currentTick,
        tickLower: initialState.tickLower,
        tickUpper: initialState.tickUpper,
        isInRange: initialState.isInRange,
        tokenComposition: initialState.tokenComposition,
        pricePerShare: initialState.pricePerShare ? ethers.utils.formatEther(initialState.pricePerShare) : null,
        tvl: initialState.tvl
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
║              CLM VAULT COMPREHENSIVE TEST SUITE                           ║
║              MANTRA Dukong Testnet                                        ║
╠═══════════════════════════════════════════════════════════════════════════╣
║  Tracking:                                                                ║
║  • Token composition shifts                                               ║
║  • Active liquidity status (in-range / out-of-range)                      ║
║  • Liquidity utilization                                                  ║
║  • Price per share (PPFS) changes                                         ║
║  • TVL changes (fees ± IL)                                                ║
║  • User share value changes                                               ║
╚═══════════════════════════════════════════════════════════════════════════╝
  `);
  
  console.log(`Wallet: ${address}`);
  console.log(`Network: ${config.network_info.name}`);
  
  // Check token balances first
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
  
  // Test scenarios - comprehensive for working vaults
  const basicScenarios = ["small-up", "small-down"];
  const extendedScenarios = ["small-up", "small-down", "large-up", "large-down"];
  
  // Test each vault
  for (const vaultConfig of VAULT_CONFIGS) {
    // Skip QuickSwap for now (requires different pool deployer investigation)
    if (vaultConfig.dex === "quickswap") {
      console.log(`\n⏭️  Skipping ${vaultConfig.name} - QuickSwap pool interface requires investigation`);
      continue;
    }
    
    // Run extended scenarios for Lotus vaults
    await tester.testVault(vaultConfig, extendedScenarios);
  }
  
  // Summary
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
  
  // Save results
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
