import { ethers, Contract, Wallet, formatUnits, parseUnits } from 'ethers';
import { config } from '../config';
import { logger } from '../logger';
import SwapRouterABI from '../abis/SwapRouter.json';
import AlgebraPoolABI from '../abis/AlgebraPool.json';
import QuoterV2ABI from '../abis/QuoterV2.json';
import ERC20ABI from '../abis/ERC20.json';

export interface PoolInfo {
  address: string;
  token0: string;
  token1: string;
  token0Symbol: string;
  token1Symbol: string;
  token0Decimals: number;
  token1Decimals: number;
  currentPrice: bigint;
  currentTick: number;
  liquidity: bigint;
}

export interface SwapParams {
  tokenIn: string;
  tokenOut: string;
  deployer?: string;
  amountIn: bigint;
  amountOutMinimum: bigint;
  recipient: string;
}

export class QuickswapClient {
  private provider: ethers.JsonRpcProvider;
  private wallet: Wallet;
  private swapRouter: Contract;
  private quoterV2: Contract;

  constructor() {
    this.provider = new ethers.JsonRpcProvider(config.rpcUrl);
    this.wallet = new Wallet(config.privateKey, this.provider);
    
    this.swapRouter = new Contract(
      config.contracts.swapRouter,
      SwapRouterABI,
      this.wallet
    );
    
    this.quoterV2 = new Contract(
      config.contracts.quoterV2,
      QuoterV2ABI,
      this.provider
    );
    
    logger.info(`QuickswapClient initialized with wallet: ${this.wallet.address}`);
  }

  async validateSetup(): Promise<void> {
    const network = await this.provider.getNetwork();
    if (Number(network.chainId) !== config.chainId) {
      throw new Error(`Connected to chain ${network.chainId}, expected ${config.chainId}`);
    }

    const contractAddresses = [
      { name: 'SwapRouter', address: config.contracts.swapRouter },
      { name: 'QuoterV2', address: config.contracts.quoterV2 },
      { name: 'Quoter', address: config.contracts.quoter },
      { name: 'AlgebraFactory', address: config.contracts.algebraFactory },
      { name: 'PoolDeployer', address: config.contracts.poolDeployer },
      { name: 'NonfungiblePositionManager', address: config.contracts.nonfungiblePositionManager },
    ];

    for (const { name, address } of contractAddresses) {
      const code = await this.provider.getCode(address);
      if (!code || code === '0x') {
        throw new Error(`No contract code found for ${name} at ${address}`);
      }
    }
  }

  async getPoolInfo(poolAddress: string): Promise<PoolInfo> {
    const poolContract = new Contract(poolAddress, AlgebraPoolABI, this.provider);
    
    const [token0Address, token1Address, globalState, liquidity] = await Promise.all([
      poolContract.token0(),
      poolContract.token1(),
      poolContract.globalState(),
      poolContract.liquidity(),
    ]);

    const token0Contract = new Contract(token0Address, ERC20ABI, this.provider);
    const token1Contract = new Contract(token1Address, ERC20ABI, this.provider);

    const [token0Symbol, token1Symbol, token0Decimals, token1Decimals] = await Promise.all([
      token0Contract.symbol(),
      token1Contract.symbol(),
      token0Contract.decimals(),
      token1Contract.decimals(),
    ]);

    return {
      address: poolAddress,
      token0: token0Address,
      token1: token1Address,
      token0Symbol,
      token1Symbol,
      token0Decimals: Number(token0Decimals),
      token1Decimals: Number(token1Decimals),
      currentPrice: globalState.price,
      currentTick: Number(globalState.tick),
      liquidity: liquidity,
    };
  }

  async getQuote(
    tokenIn: string,
    tokenOut: string,
    amountIn: bigint,
    deployer?: string
  ): Promise<{ amountOut: bigint; sqrtPriceX96After: bigint }> {
    const deployerAddress = deployer || config.contracts.poolDeployer;
    
    try {
      // Try with deployer parameter first (newer Algebra versions)
      const result = await this.quoterV2.quoteExactInputSingle.staticCall(
        tokenIn,
        tokenOut,
        deployerAddress,
        amountIn,
        0 // limitSqrtPrice = 0 means no limit
      );

      return {
        amountOut: result.amountOut,
        sqrtPriceX96After: result.sqrtPriceX96After,
      };
    } catch (error) {
      // Fallback: try without deployer parameter (older Algebra versions)
      logger.debug('Retrying quote without deployer parameter...');
      try {
        const result = await this.quoterV2.quoteExactInputSingleWithoutDeployer.staticCall(
          tokenIn,
          tokenOut,
          amountIn,
          0
        );
        return {
          amountOut: result.amountOut,
          sqrtPriceX96After: result.sqrtPriceX96After,
        };
      } catch (fallbackError) {
        logger.error('Error getting quote:', error);
        throw error;
      }
    }
  }

  async approveToken(tokenAddress: string, amount: bigint): Promise<void> {
    const tokenContract = new Contract(tokenAddress, ERC20ABI, this.wallet);
    
    const currentAllowance = await tokenContract.allowance(
      this.wallet.address,
      config.contracts.swapRouter
    );

    if (currentAllowance >= amount) {
      logger.debug(`Token ${tokenAddress} already approved`);
      return;
    }

    logger.info(`Approving token ${tokenAddress} for amount ${amount.toString()}`);
    const tx = await tokenContract.approve(config.contracts.swapRouter, amount);
    await tx.wait();
    logger.info(`Token approved. Tx: ${tx.hash}`);
  }

  async executeSwap(params: SwapParams): Promise<string> {
    const deadline = Math.floor(Date.now() / 1000) + 600; // 10 minutes from now

    const swapParams = {
      tokenIn: params.tokenIn,
      tokenOut: params.tokenOut,
      deployer: params.deployer || config.contracts.poolDeployer,
      recipient: params.recipient,
      deadline: deadline,
      amountIn: params.amountIn,
      amountOutMinimum: params.amountOutMinimum,
      limitSqrtPrice: 0, // No price limit
    };

    logger.info(`Executing swap: ${params.amountIn.toString()} tokens`);
    
    const tx = await this.swapRouter.exactInputSingle(swapParams, {
      gasLimit: 500000,
    });

    logger.info(`Swap transaction sent: ${tx.hash}`);
    const receipt = await tx.wait();
    logger.info(`Swap confirmed in block ${receipt.blockNumber}`);

    return tx.hash;
  }

  async getTokenBalance(tokenAddress: string, walletAddress?: string): Promise<bigint> {
    const tokenContract = new Contract(tokenAddress, ERC20ABI, this.provider);
    const address = walletAddress || this.wallet.address;
    return await tokenContract.balanceOf(address);
  }

  async getNativeBalance(): Promise<bigint> {
    return await this.provider.getBalance(this.wallet.address);
  }

  getWalletAddress(): string {
    return this.wallet.address;
  }

  async waitForTransaction(txHash: string): Promise<void> {
    const receipt = await this.provider.waitForTransaction(txHash);
    if (receipt?.status === 0) {
      throw new Error(`Transaction failed: ${txHash}`);
    }
  }
}

