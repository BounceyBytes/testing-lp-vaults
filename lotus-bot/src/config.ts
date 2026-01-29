import dotenv from 'dotenv';

dotenv.config();

export interface Config {
  rpcUrl: string;
  chainId: number;
  privateKey: string;
  logLevel: string;
  poolAddresses: string[];
  contracts: {
    factory: string;
    poolDeployer: string;
    swapRouter: string;
    nonfungiblePositionManager: string;
  };
}

// Addresses from testnet-config.json for Lotus DEX
export const config: Config = {
  rpcUrl: process.env.RPC_URL || 'https://rpc.dukong.mantrachain.io',
  chainId: parseInt(process.env.CHAIN_ID || '96970'),
  privateKey: process.env.PRIVATE_KEY || '',
  logLevel: process.env.LOG_LEVEL || 'info',
  poolAddresses: process.env.POOL_ADDRESSES?.split(',').filter(Boolean) || [],
  
  contracts: {
    factory: '0x17E1ebf15BE528b179d34148fB9aB2466555F605',
    poolDeployer: '0x41B1E93A249d9635b12344E7976Ff8E4dD2CC9c1',
    swapRouter: '0xae52Aa627D6eFAce03Fecd41a79DEEcbc168cb0c',
    nonfungiblePositionManager: '0x84fb9302f2232050bB30D0C15Cef44823153De6f'
  },
};

export function validateConfig(): void {
  if (!config.privateKey) {
    throw new Error('PRIVATE_KEY is required in .env file');
  }
}
