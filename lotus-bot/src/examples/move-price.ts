import { ethers } from 'ethers';
import { config, validateConfig } from '../config';
import { logger } from '../logger';
import { PriceMover } from '../bot/price-mover';

async function main() {
    validateConfig();
  
    // Usage: ts-node src/examples/move-price.ts <poolAddress> <direction> <percent>
    const args = process.argv.slice(2);
    if (args.length < 3) {
      console.log(`Usage: npx ts-node src/examples/move-price.ts <poolAddress> <up|down> <percent>`);
      process.exit(1);
    }
  
    const poolAddress = args[0];
    const direction = args[1];
    const percent = parseFloat(args[2]);
  
    if (direction !== 'up' && direction !== 'down') {
      logger.error("Direction must be 'up' or 'down'");
      process.exit(1);
    }
  
    const provider = new ethers.JsonRpcProvider(config.rpcUrl);
    const signer = new ethers.Wallet(config.privateKey, provider);
    
    logger.info(`Running Price Move with ${signer.address}`);
    
    const mover = new PriceMover(signer);
    
    try {
        await mover.movePrice(
            ethers.ZeroAddress, // tokenAddress param ignored in current implementation (derived from pool) -> wait, implementation needs review
            poolAddress,
            direction,
            percent
        );
        logger.info("Done.");
    } catch (e) {
        logger.error(e);
        process.exit(1);
    }
}
  
main();
