/**
 * Shared Swap Helper Utility
 * 
 * Provides reliable swap execution for QuickSwap (Algebra) and Lotus (UniV3) DEXs
 * with proper slippage protection and detailed error diagnostics.
 * 
 * For QuickSwap: Uses DirectPoolSwapper contract to bypass the testnet router's 
 * broken pool address computation (mismatched POOL_INIT_CODE_HASH).
 */

const { ethers } = require("hardhat");
const config = require("../../testnet-config.json");

// ERC20 ABI for token approvals and balance checks
const ERC20_ABI = [
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) external view returns (uint256)",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)"
];

// DirectPoolSwapper ABI (our custom contract)
const DIRECT_POOL_SWAPPER_ABI = [
  "function swap(address pool, bool zeroToOne, int256 amountIn, uint160 limitSqrtPrice) external returns (int256 amount0, int256 amount1)",
  "function algebraSwapCallback(int256 amount0Delta, int256 amount1Delta, bytes calldata data) external"
];

// Lotus (UniV3-style) router ABI
const LOTUS_ROUTER_ABI = [
  "function exactInputSingle((address tokenIn, address tokenOut, uint24 fee, address recipient, uint256 deadline, uint256 amountIn, uint256 amountOutMinimum, uint160 sqrtPriceLimitX96)) external payable returns (uint256 amountOut)"
];

// Pool ABI for checking state
const POOL_ABI = [
  "function token0() external view returns (address)",
  "function token1() external view returns (address)",
  "function safelyGetStateOfAMM() external view returns (uint160 sqrtPriceX96, int24 tick, uint16 lastFee, uint8 pluginConfig, uint16 communityFee, bool unlocked)",
  "function liquidity() external view returns (uint128)"
];

// Default slippage tolerance (0.5% = 50 basis points)
const DEFAULT_SLIPPAGE_BPS = 50;

// Gas price for Dukong testnet (minimum required)
const TESTNET_GAS_PRICE = ethers.utils.parseUnits("50", "gwei");

class SwapHelper {
  constructor(signer, options = {}) {
    this.signer = signer;
    this.slippageBps = options.slippageBps || DEFAULT_SLIPPAGE_BPS;
    this.debug = options.debug || false;
    
    // Initialize DirectPoolSwapper (for QuickSwap)
    if (config.quickswap.directPoolSwapper) {
      this.directPoolSwapper = new ethers.Contract(
        config.quickswap.directPoolSwapper,
        DIRECT_POOL_SWAPPER_ABI,
        signer
      );
    }
    
    // Initialize Lotus router
    this.lotusRouter = new ethers.Contract(
      config.lotus.swapRouter,
      LOTUS_ROUTER_ABI,
      signer
    );
    
    // Pool address mapping (token pair -> pool address)
    this.quickswapPools = config.pools.quickswap;
    this.lotusPools = config.pools.lotus;
  }

  async _pendingNonce() {
    const addr = await this.signer.getAddress();
    return this.signer.provider.getTransactionCount(addr, "pending");
  }

  /**
   * Log debug messages if debug mode is enabled
   */
  log(message, ...args) {
    if (this.debug) {
      console.log(`    [SwapHelper] ${message}`, ...args);
    }
  }

  /**
   * Get token info for diagnostics
   */
  async getTokenInfo(tokenAddress) {
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, this.signer);

    const isRetryable = (e) => {
      const msg = String(e?.message || "");
      return (
        msg.includes("Too Many Requests") ||
        msg.includes("could not detect network") ||
        msg.includes("noNetwork") ||
        msg.includes("NETWORK_ERROR")
      );
    };

    const owner = await this.signer.getAddress();

    let symbol = "UNKNOWN";
    let decimals = 18;
    let balance = ethers.BigNumber.from(0);

    try {
      symbol = await token.symbol();
    } catch (e) {
      if (isRetryable(e)) throw e;
    }

    try {
      decimals = await token.decimals();
    } catch (e) {
      if (isRetryable(e)) throw e;
    }

    try {
      balance = await token.balanceOf(owner);
    } catch (e) {
      if (isRetryable(e)) throw e;
    }

    return { symbol, decimals, balance, contract: token };
  }

  /**
   * Format amount with proper decimals
   */
  formatAmount(amount, decimals) {
    return ethers.utils.formatUnits(amount, decimals);
  }

  /**
   * Ensure token approval for a spender
   */
  async ensureApproval(tokenAddress, spenderAddress, amount) {
    const token = new ethers.Contract(tokenAddress, ERC20_ABI, this.signer);
    const owner = await this.signer.getAddress();
    
    const currentAllowance = await token.allowance(owner, spenderAddress);
    
    if (currentAllowance.gte(amount)) {
      this.log(`Token already approved`);
      return { alreadyApproved: true };
    }
    
    this.log(`Approving token...`);
    const tx = await token.approve(spenderAddress, ethers.constants.MaxUint256, {
      gasPrice: TESTNET_GAS_PRICE,
      nonce: await this._pendingNonce()
    });
    const receipt = await tx.wait();
    this.log(`Approval confirmed in block ${receipt.blockNumber}`);
    
    return { alreadyApproved: false, txHash: receipt.transactionHash };
  }

  /**
   * Find the pool address for a QuickSwap token pair
   */
  findQuickSwapPool(tokenIn, tokenOut) {
    const tokenInLower = tokenIn.toLowerCase();
    const tokenOutLower = tokenOut.toLowerCase();
    
    // Check each pool in config
    for (const [pairName, poolAddress] of Object.entries(this.quickswapPools)) {
      // Get tokens from pool to match
      // Pool names are like "USDT_mUSD"
      const tokens = pairName.split("_");
      const token0Symbol = tokens[0];
      const token1Symbol = tokens[1];
      
      // Get addresses from config
      const token0Address = config.tokens[token0Symbol];
      const token1Address = config.tokens[token1Symbol];
      
      if (!token0Address || !token1Address) continue;
      
      // Check if this pool matches our tokens
      if (
        (token0Address.toLowerCase() === tokenInLower && token1Address.toLowerCase() === tokenOutLower) ||
        (token0Address.toLowerCase() === tokenOutLower && token1Address.toLowerCase() === tokenInLower)
      ) {
        return {
          poolAddress,
          pairName,
          token0: token0Address,
          token1: token1Address
        };
      }
    }
    
    return null;
  }

  /**
   * Execute QuickSwap swap using DirectPoolSwapper
   * This bypasses the router's broken pool address computation
   */
  async swapQuickSwap(tokenIn, tokenOut, amountIn, options = {}) {
    console.log(`    🔄 QuickSwap Swap`);
    
    // 1. Get token info
    const tokenInInfo = await this.getTokenInfo(tokenIn);
    const tokenOutInfo = await this.getTokenInfo(tokenOut);
    
    console.log(`       ${tokenInInfo.symbol} → ${tokenOutInfo.symbol}`);
    console.log(`       Amount: ${this.formatAmount(amountIn, tokenInInfo.decimals)} ${tokenInInfo.symbol}`);
    
    // 2. Check balance
    if (tokenInInfo.balance.lt(amountIn)) {
      const error = new Error(`Insufficient ${tokenInInfo.symbol} balance`);
      error.code = "INSUFFICIENT_BALANCE";
      error.details = {
        required: this.formatAmount(amountIn, tokenInInfo.decimals),
        available: this.formatAmount(tokenInInfo.balance, tokenInInfo.decimals),
        tokenIn: tokenIn,
        tokenInSymbol: tokenInInfo.symbol
      };
      throw error;
    }
    
    // 3. Find the pool
    const poolInfo = this.findQuickSwapPool(tokenIn, tokenOut);
    if (!poolInfo) {
      const error = new Error(`No QuickSwap pool found for ${tokenInInfo.symbol}/${tokenOutInfo.symbol}`);
      error.code = "POOL_NOT_FOUND";
      throw error;
    }
    
    console.log(`       Pool: ${poolInfo.pairName} (${poolInfo.poolAddress})`);
    
    // 4. Check if DirectPoolSwapper is available
    if (!this.directPoolSwapper) {
      const error = new Error("DirectPoolSwapper not configured. Add 'directPoolSwapper' address to testnet-config.json under 'quickswap'");
      error.code = "SWAPPER_NOT_CONFIGURED";
      throw error;
    }
    
    // 5. Determine swap direction (zeroToOne)
    // If tokenIn is token0, we're swapping token0 for token1 (zeroToOne = true)
    const pool = new ethers.Contract(poolInfo.poolAddress, POOL_ABI, this.signer.provider);
    const poolToken0 = await pool.token0();
    const zeroToOne = tokenIn.toLowerCase() === poolToken0.toLowerCase();
    
    console.log(`       Direction: ${zeroToOne ? 'token0 → token1' : 'token1 → token0'}`);
    
    // 6. Check pool liquidity
    const liquidity = await pool.liquidity();
    if (liquidity.eq(0)) {
      const error = new Error(`Pool has no liquidity`);
      error.code = "NO_LIQUIDITY";
      throw error;
    }
    
    // 7. Ensure approval for DirectPoolSwapper
    await this.ensureApproval(tokenIn, this.directPoolSwapper.address, amountIn);
    
    // 8. Get balances before
    const tokenOutBalanceBefore = await tokenOutInfo.contract.balanceOf(await this.signer.getAddress());
    
    // 9. Execute swap
    try {
      const tx = await this.directPoolSwapper.swap(
        poolInfo.poolAddress,
        zeroToOne,
        amountIn, // positive = exact input
        0, // no price limit
        {
          gasLimit: 500000,
          gasPrice: TESTNET_GAS_PRICE,
          nonce: await this._pendingNonce()
        }
      );
      
      console.log(`       Tx sent: ${tx.hash}`);
      const receipt = await tx.wait();
      
      // 10. Calculate actual output
      const tokenOutBalanceAfter = await tokenOutInfo.contract.balanceOf(await this.signer.getAddress());
      const actualOutput = tokenOutBalanceAfter.sub(tokenOutBalanceBefore);
      
      console.log(`       ✅ Swap confirmed in block ${receipt.blockNumber}`);
      console.log(`       Output: ${this.formatAmount(actualOutput, tokenOutInfo.decimals)} ${tokenOutInfo.symbol}`);
      
      return {
        success: true,
        txHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        amountIn: amountIn,
        amountOut: actualOutput,
        pool: poolInfo.poolAddress
      };
    } catch (error) {
      // Enhanced error diagnostics
      const swapError = new Error(`Swap failed: ${error.message}`);
      swapError.code = "SWAP_FAILED";
      swapError.details = {
        tokenIn,
        tokenOut,
        tokenInSymbol: tokenInInfo.symbol,
        tokenOutSymbol: tokenOutInfo.symbol,
        amountIn: this.formatAmount(amountIn, tokenInInfo.decimals),
        pool: poolInfo.poolAddress,
        originalError: error.message
      };
      
      // Try to get more details from transaction
      if (error.transactionHash) {
        swapError.details.txHash = error.transactionHash;
      }
      
      throw swapError;
    }
  }

  /**
   * Execute Lotus swap (UniV3-style router)
   */
  async swapLotus(tokenIn, tokenOut, feeTier, amountIn, options = {}) {
    const recipient = options.recipient || await this.signer.getAddress();
    
    console.log(`    🔄 Lotus DEX Swap`);
    
    // 1. Get token info
    const tokenInInfo = await this.getTokenInfo(tokenIn);
    const tokenOutInfo = await this.getTokenInfo(tokenOut);
    
    console.log(`       ${tokenInInfo.symbol} → ${tokenOutInfo.symbol}`);
    console.log(`       Amount: ${this.formatAmount(amountIn, tokenInInfo.decimals)} ${tokenInInfo.symbol}`);
    console.log(`       Fee tier: ${feeTier / 10000}%`);
    
    // 2. Check balance
    if (tokenInInfo.balance.lt(amountIn)) {
      const error = new Error(`Insufficient ${tokenInInfo.symbol} balance`);
      error.code = "INSUFFICIENT_BALANCE";
      error.details = {
        required: this.formatAmount(amountIn, tokenInInfo.decimals),
        available: this.formatAmount(tokenInInfo.balance, tokenInInfo.decimals),
        tokenIn: tokenIn,
        tokenInSymbol: tokenInInfo.symbol
      };
      throw error;
    }
    
    // 3. Ensure token approval
    await this.ensureApproval(tokenIn, config.lotus.swapRouter, amountIn);
    
    // 4. Get balances before
    const tokenOutBalanceBefore = await tokenOutInfo.contract.balanceOf(await this.signer.getAddress());
    
    // 5. Build swap params
    const deadline = Math.floor(Date.now() / 1000) + 600;
    const params = {
      tokenIn,
      tokenOut,
      fee: feeTier,
      recipient,
      deadline,
      amountIn,
      amountOutMinimum: 0, // No slippage protection for now (can be improved with quoter)
      sqrtPriceLimitX96: 0
    };
    
    // 6. Execute swap
    try {
      const tx = await this.lotusRouter.exactInputSingle(params, {
        gasLimit: 500000,
        gasPrice: TESTNET_GAS_PRICE,
        nonce: await this._pendingNonce()
      });
      
      console.log(`       Tx sent: ${tx.hash}`);
      const receipt = await tx.wait();
      
      // Calculate actual output
      const tokenOutBalanceAfter = await tokenOutInfo.contract.balanceOf(await this.signer.getAddress());
      const actualOutput = tokenOutBalanceAfter.sub(tokenOutBalanceBefore);
      
      console.log(`       ✅ Swap confirmed in block ${receipt.blockNumber}`);
      console.log(`       Output: ${this.formatAmount(actualOutput, tokenOutInfo.decimals)} ${tokenOutInfo.symbol}`);
      
      return {
        success: true,
        txHash: receipt.transactionHash,
        blockNumber: receipt.blockNumber,
        gasUsed: receipt.gasUsed.toString(),
        amountIn: amountIn,
        amountOut: actualOutput
      };
    } catch (error) {
      const swapError = new Error(`Lotus swap failed: ${error.message}`);
      swapError.code = "SWAP_FAILED";
      swapError.details = {
        tokenIn,
        tokenOut,
        tokenInSymbol: tokenInInfo.symbol,
        tokenOutSymbol: tokenOutInfo.symbol,
        amountIn: this.formatAmount(amountIn, tokenInInfo.decimals),
        feeTier,
        originalError: error.message
      };
      throw swapError;
    }
  }

  /**
   * Unified swap entrypoint.
   *
   * Supports both signatures:
   * - swap(dex, tokenIn, tokenOut, amountIn, options)
   * - swap({ dex, tokenIn, tokenOut, amountIn, feeTier, options })
   */
  async swap(dexOrParams, tokenIn, tokenOut, amountIn, options = {}) {
    let dex = dexOrParams;
    let feeTier = options.feeTier;

    // New-style object params
    if (dexOrParams && typeof dexOrParams === "object") {
      dex = dexOrParams.dex;
      tokenIn = dexOrParams.tokenIn;
      tokenOut = dexOrParams.tokenOut;
      amountIn = dexOrParams.amountIn;
      feeTier = dexOrParams.feeTier;
      options = dexOrParams.options || {};
    }

    if (!dex || typeof dex !== "string") {
      throw new Error(`Invalid dex parameter: ${String(dex)}`);
    }

    if (dex.toLowerCase() === "quickswap") {
      return this.swapQuickSwap(tokenIn, tokenOut, amountIn, options);
    }
    if (dex.toLowerCase() === "lotus") {
      const lotusFeeTier = feeTier || options.feeTier || 500; // Default to 0.05%
      return this.swapLotus(tokenIn, tokenOut, lotusFeeTier, amountIn, options);
    }
    throw new Error(`Unknown DEX: ${dex}. Supported: quickswap, lotus`);
  }

  /**
   * Get pool state for a QuickSwap pool
   */
  async getQuickSwapPoolState(poolAddress) {
    const pool = new ethers.Contract(poolAddress, POOL_ABI, this.signer.provider);
    
    try {
      const [token0, token1, state, liquidity] = await Promise.all([
        pool.token0(),
        pool.token1(),
        pool.safelyGetStateOfAMM(),
        pool.liquidity()
      ]);
      
      return {
        token0,
        token1,
        sqrtPriceX96: state.sqrtPriceX96,
        tick: state.tick,
        lastFee: state.lastFee,
        unlocked: state.unlocked,
        liquidity
      };
    } catch (error) {
      return { error: error.message };
    }
  }
}

module.exports = { SwapHelper };
