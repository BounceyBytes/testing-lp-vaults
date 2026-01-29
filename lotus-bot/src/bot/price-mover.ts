import { ethers } from 'ethers';
import { config } from '../config';
import { logger } from '../logger';
import { ERC20_ABI, LOTUS_ROUTER_ABI, LOTUS_POOL_ABI } from '../abis';

export class PriceMover {
  private signer: ethers.Wallet;
  private router: ethers.Contract;

  constructor(signer: ethers.Wallet) {
    this.signer = signer;
    this.router = new ethers.Contract(config.contracts.swapRouter, LOTUS_ROUTER_ABI, signer);
  }

  private async getToken(address: string): Promise<ethers.Contract> {
    return new ethers.Contract(address, ERC20_ABI, this.signer);
  }

  async approveToken(tokenAddress: string, spender: string, amount: bigint) {
    const token = await this.getToken(tokenAddress);
    const symbol = await token.symbol();
    const allowance = await token.allowance(this.signer.address, spender);
    
    if (allowance < amount) {
        logger.info(`Approving ${symbol} for spending...`);
        const tx = await token.approve(spender, ethers.MaxUint256);
        await tx.wait();
        logger.info(`✓ Approved ${symbol}`);
    } else {
        logger.info(`✓ ${symbol} already approved`);
    }
  }

  async executeSwap(
    tokenIn: string, 
    tokenOut: string, 
    feeTier: number, 
    amountIn: bigint, 
    recipient?: string
  ) {
    await this.approveToken(tokenIn, config.contracts.swapRouter, amountIn);

    const params = {
      tokenIn: tokenIn,
      tokenOut: tokenOut,
      fee: feeTier,
      recipient: recipient || this.signer.address,
      deadline: Math.floor(Date.now() / 1000) + 3600,
      amountIn: amountIn,
      amountOutMinimum: 0, // No slippage protection for price moving
      sqrtPriceLimitX96: 0
    };

    logger.info(`Swapping...`);
    try {
      const tx = await this.router.exactInputSingle(params);
      const receipt = await tx.wait();
      logger.info(`✓ Swap successful: ${receipt.hash}`);
      return receipt;
    } catch (error: any) {
      logger.error(`Swap failed: ${error.message}`);
      throw error;
    }
  }

  async movePrice(
    tokenAddress: string, 
    poolAddress: string, 
    direction: 'up' | 'down', 
    percentMove: number,
    baseAmountHuman: string = "1.0"
  ) {
    // 1. Resolve tokens from pool
    const pool = new ethers.Contract(poolAddress, LOTUS_POOL_ABI, this.signer);
    const token0 = await pool.token0();
    const token1 = await pool.token1();
    
    // 2. Identify tokens
    // Price UP = Buy Token 0? No, let's look at standard definitions.
    // Price usually defined as token1 per token0.
    // Buying token0 (input token1) -> Price goes UP.
    // Selling token0 (input token0) -> Price goes DOWN.
    
    // However, the user simply says "move price up" or "down".
    // If I want price to go UP, I should BUY token0 (swap token1 -> token0).
    // If I want price to go DOWN, I should SELL token0 (swap token0 -> token1).
    
    // NOTE: This logic depends on which token is the "base" token.
    // Ideally we assume token0 is the base asset for technical price sqrtPriceX96.
    
    let inputToken, outputToken;
    
    if (direction === 'up') {
        inputToken = token1;
        outputToken = token0;
        logger.info(`Attempting to move price UP (Buy Token0 / Sell Token1)`);
    } else {
        inputToken = token0;
        outputToken = token1;
        logger.info(`Attempting to move price DOWN (Sell Token0 / Buy Token1)`);
    }

    const tInContract = await this.getToken(inputToken);
    const decimals = await tInContract.decimals();
    
    // 3. Calculate Amount
    // Percent move is a heuristic. We just swap a "significant" amount relative to the pool size or a fixed amount.
    // For now, let's use the fixed amount passed in.
    
    const amountIn = ethers.parseUnits(baseAmountHuman, decimals);
    
    // Adjust logic: If percentMove is high, multiply the base amount? 
    // Or just interpret the baseAmount as "1 unit" and percentMove as multiplier?
    // Let's do: amount = baseAmount * (percentMove / 10) -- Arbitrary scaling for now to match legacy behavior
    
    const scale = BigInt(Math.max(1, Math.floor(percentMove)));
    const finalAmount = amountIn * scale; // Simple BigInt mult
    
    const tInSym = await tInContract.symbol();
    logger.info(`Swapping ${ethers.formatUnits(finalAmount, decimals)} ${tInSym}`);

    // Fee tier - hardcoded for now or fetch from pool?
    // Lotus pools have fee in slot0 or immutable?
    // Lotus/UniV3 pools are initialized with a fee. We can't easily read it from the pool contract directly in V3 standard 
    // (ABI doesn't always expose 'fee' public getter on the Pool, but the Factory has getPool).
    // Actually, Slot0 keeps some state, but 'fee' is immutable.
    // We will assume 3000 (0.3%) which is standard for most test pools, or pass it in.
    const fee = 3000; 

    await this.executeSwap(inputToken, outputToken, fee, finalAmount);
  }
}
