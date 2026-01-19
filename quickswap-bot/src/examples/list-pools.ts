import { ethers } from 'ethers';
import { config } from '../config';
import { logger } from '../logger';

type PoolRecord = {
  pool: string;
  token0: string;
  token1: string;
  blockNumber: number;
  eventName: string;
};

const FACTORY_ADDRESS = '0x10253594A832f967994b44f33411940533302ACb';

const CANDIDATE_EVENTS = [
  'event Pool(address indexed token0, address indexed token1, address pool)',
  'event PoolCreated(address indexed token0, address indexed token1, address pool)',
  // Some Algebra factories include fee or plugin info in event; try a few variants.
  'event PoolCreated(address indexed token0, address indexed token1, address pool, uint16 fee)',
  'event PoolCreated(address indexed token0, address indexed token1, address pool, uint16 fee, address plugin)',
];

const ERC20_ABI = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
];

function parseArg(flag: string): string | undefined {
  const idx = process.argv.indexOf(flag);
  if (idx === -1 || idx + 1 >= process.argv.length) return undefined;
  return process.argv[idx + 1];
}

async function main(): Promise<void> {
  const rpcUrl = parseArg('--rpc-url') || config.rpcUrl;
  // Use a static network config to avoid relying on eth_chainId when the RPC is limited.
  const provider = new ethers.JsonRpcProvider(
    rpcUrl,
    { chainId: config.chainId, name: 'mantra-testnet' },
    { staticNetwork: true }
  );

  const fromBlockArg = parseArg('--from-block');
  const toBlockArg = parseArg('--to-block');
  const withSymbols = process.argv.includes('--with-symbols');

  const fromBlock = fromBlockArg ? Number(fromBlockArg) : 0;
  const toBlock = toBlockArg ? Number(toBlockArg) : 'latest';

  logger.info(`Scanning pools from AlgebraFactory: ${FACTORY_ADDRESS}`);
  logger.info(`RPC: ${rpcUrl}`);
  logger.info(`Range: ${fromBlock} -> ${toBlock}`);
  logger.info(`Include symbols: ${withSymbols}`);

  const poolsByAddress = new Map<string, PoolRecord>();

  for (const eventSig of CANDIDATE_EVENTS) {
    const iface = new ethers.Interface([eventSig]);
    const nameMatch = eventSig.match(/event\s+([A-Za-z0-9_]+)/);
    const eventName = nameMatch ? nameMatch[1] : undefined;
    if (!eventName) {
      logger.warn(`Unable to parse event name from signature: ${eventSig}`);
      continue;
    }
    const event = iface.getEvent(eventName);
    if (!event) {
      logger.warn(`Event not found in interface: ${eventName}`);
      continue;
    }
    const topic = event.topicHash;

    let logs: ethers.Log[] = [];
    try {
      logs = await provider.getLogs({
        address: FACTORY_ADDRESS,
        fromBlock,
        toBlock,
        topics: [topic],
      });
    } catch (error) {
      const message = String(error);
      logger.warn(`Failed to fetch logs for event ${eventSig}: ${message}`);
      if (message.includes('Method not found')) {
        logger.error(
          'RPC does not support eth_getLogs. Please use an EVM JSON-RPC endpoint that supports logs.'
        );
        logger.error(
          'You can pass one directly: npm run list-pools -- --rpc-url https://<evm-rpc> --with-symbols'
        );
        return;
      }
      continue;
    }

    for (const log of logs) {
      try {
        const parsed = iface.parseLog(log);
        if (!parsed) continue;
        const token0 = parsed.args.token0 as string;
        const token1 = parsed.args.token1 as string;
        const pool = parsed.args.pool as string;

        if (!poolsByAddress.has(pool)) {
          poolsByAddress.set(pool, {
            pool,
            token0,
            token1,
            blockNumber: log.blockNumber ?? 0,
            eventName: parsed.name,
          });
        }
      } catch {
        // Ignore logs that don't match this signature
      }
    }
  }

  const pools = Array.from(poolsByAddress.values()).sort(
    (a, b) => a.blockNumber - b.blockNumber
  );

  logger.info(`Found ${pools.length} pools`);

  if (pools.length === 0) {
    logger.info('No pools found. Try a different block range or verify the factory address.');
    return;
  }

  if (!withSymbols) {
    for (const pool of pools) {
      logger.info(`${pool.pool} | ${pool.token0} / ${pool.token1} | block ${pool.blockNumber}`);
    }
    return;
  }

  // Optionally enrich with token symbols/decimals
  for (const pool of pools) {
    try {
      const token0Contract = new ethers.Contract(pool.token0, ERC20_ABI, provider);
      const token1Contract = new ethers.Contract(pool.token1, ERC20_ABI, provider);

      const [token0Symbol, token1Symbol, token0Decimals, token1Decimals] =
        await Promise.all([
          token0Contract.symbol(),
          token1Contract.symbol(),
          token0Contract.decimals(),
          token1Contract.decimals(),
        ]);

      logger.info(
        `${pool.pool} | ${token0Symbol}(${token0Decimals}) / ${token1Symbol}(${token1Decimals}) | block ${pool.blockNumber}`
      );
    } catch (error) {
      logger.warn(
        `${pool.pool} | ${pool.token0} / ${pool.token1} | block ${pool.blockNumber} (symbol lookup failed: ${String(error)})`
      );
    }
  }
}

if (require.main === module) {
  main().catch((error) => {
    logger.error(`Failed to list pools: ${String(error)}`);
    process.exit(1);
  });
}


