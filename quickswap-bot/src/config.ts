import dotenv from 'dotenv';

dotenv.config();

export interface Config {
  rpcUrl: string;
  chainId: number;
  privateKey: string;
  swapAmountOM: string;
  priceImpactTarget: number;
  swapIntervalMs: number;
  maxSlippagePercent: number;
  poolAddresses: string[];
  logLevel: string;
  contracts: {
    swapRouter: string;
    nonfungiblePositionManager: string;
    algebraFactory: string;
    poolDeployer: string;
    quoterV2: string;
    quoter: string;
  };
}

export const config: Config = {
  rpcUrl: process.env.RPC_URL || 'https://rpc.dukong.mantrachain.io',
  chainId: parseInt(process.env.CHAIN_ID || '96970'),
  privateKey: process.env.PRIVATE_KEY || '',
  swapAmountOM: process.env.SWAP_AMOUNT_OM || '1.0',
  priceImpactTarget: parseFloat(process.env.PRICE_IMPACT_TARGET || '5.0'),
  swapIntervalMs: parseInt(process.env.SWAP_INTERVAL_MS || '30000'),
  maxSlippagePercent: parseFloat(process.env.MAX_SLIPPAGE_PERCENT || '10'),
  poolAddresses: process.env.POOL_ADDRESSES?.split(',').filter(Boolean) || [],
  logLevel: process.env.LOG_LEVEL || 'info',
  contracts: {
    swapRouter: '0x3012E9049d05B4B5369D690114D5A5861EbB85cb',
    nonfungiblePositionManager: '0x69D57B9D705eaD73a5d2f2476C30c55bD755cc2F',
    algebraFactory: '0x10253594A832f967994b44f33411940533302ACb',
    poolDeployer: process.env.POOL_DEPLOYER || '0x10253594A832f967994b44f33411940533302ACb',
    quoterV2: '0xa77aD9f635a3FB3bCCC5E6d1A87cB269746Aba17',
    quoter: '0x03f8B4b140249Dc7B2503C928E7258CCe1d91F1A',
  },
};

export function validateConfig(): void {
  if (!config.privateKey) {
    throw new Error('PRIVATE_KEY is required in .env file');
  }
  
  if (config.privateKey === 'your_private_key_here') {
    throw new Error('Please set a valid PRIVATE_KEY in .env file');
  }
  
  if (config.poolAddresses.length === 0) {
    console.warn('⚠️  No POOL_ADDRESSES specified. Bot will need pool addresses to operate.');
  }
}

