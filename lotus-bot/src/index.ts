import { ethers } from 'ethers';
import { config, validateConfig } from './config';
import { logger } from './logger';

async function main() {
  try {
    validateConfig();
    logger.info('Starting Lotus Bot...');
    logger.info(`Connected to RPC: ${config.rpcUrl}`);
    
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const network = await provider.getNetwork();
    
    logger.info(`Network Check: ${network.name} (Chain ID: ${network.chainId})`);
    
    // Add bot logic here
    
  } catch (error) {
    logger.error('Fatal error starting bot:', error);
    process.exit(1);
  }
}

main();
