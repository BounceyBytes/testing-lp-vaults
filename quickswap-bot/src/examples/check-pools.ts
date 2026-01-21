import { ethers } from 'ethers';
import { logger } from '../logger';

// Factory ABIs
const FACTORY_ABI = [
  'function poolByPair(address tokenA, address tokenB) external view returns (address pool)',
  'function getPool(address tokenA, address tokenB, uint24 fee) external view returns (address pool)',
];

const POOL_ABI = [
  'function token0() external view returns (address)',
  'function token1() external view returns (address)',
  'function liquidity() external view returns (uint128)',
  'function globalState() external view returns (uint160 price, int24 tick, uint16 fee, uint16 timepointIndex, uint8 communityFee0, uint8 communityFee1, bool unlocked)',
];

const ERC20_ABI = [
  'function symbol() view returns (string)',
  'function decimals() view returns (uint8)',
];

// Config from testnet-config.json
const config = {
  rpcUrl: 'https://evm.dukong.mantrachain.io',
  quickswap: {
    factory: '0x10253594A832f967994b44f33411940533302ACb',
    name: 'QuickSwap (Algebra)',
  },
  lotus: {
    factory: '0x17E1ebf15BE528b179d34148fB9aB2466555F605',
    name: 'Lotus DEX',
  },
  tokens: {
    WETH: '0x139847104029584df72Bf1805e2720D2c5ae4728',
    USDC: '0xDcc8a320dc2Ce505bB37DAb4b47ECE8E3ad1864F',
    USDT: '0xCDb248d19195e23a4cdffCa8a67dD8c7f97000D9',
    WBTC: '0x2A8E20Ba7aB3C3A90527EF0d2d970fd22f7C25AB',
  },
};

const TOKEN_PAIRS = [
  ['WETH', 'USDC'],
  ['WETH', 'USDT'],
  ['WBTC', 'WETH'],
  ['USDC', 'USDT'],
  ['WBTC', 'USDC'],
  ['WBTC', 'USDT'],
];

async function checkPoolExists(
  provider: ethers.JsonRpcProvider,
  factoryAddress: string,
  token0Address: string,
  token1Address: string,
  dexName: string
): Promise<{ pool: string; liquidity: string } | null> {
  const factory = new ethers.Contract(factoryAddress, FACTORY_ABI, provider);
  
  try {
    // Try poolByPair (Algebra/QuickSwap style)
    const pool = await factory.poolByPair(token0Address, token1Address);
    if (pool && pool !== ethers.ZeroAddress) {
      const poolContract = new ethers.Contract(pool, POOL_ABI, provider);
      try {
        const liquidity = await poolContract.liquidity();
        return { pool, liquidity: liquidity.toString() };
      } catch {
        return { pool, liquidity: 'unknown' };
      }
    }
  } catch {
    // Try getPool for Uniswap v3 style (with fee tiers)
    for (const fee of [500, 3000, 10000]) {
      try {
        const pool = await factory.getPool(token0Address, token1Address, fee);
        if (pool && pool !== ethers.ZeroAddress) {
          const poolContract = new ethers.Contract(pool, POOL_ABI, provider);
          try {
            const liquidity = await poolContract.liquidity();
            return { pool, liquidity: liquidity.toString() };
          } catch {
            return { pool, liquidity: 'unknown' };
          }
        }
      } catch {
        continue;
      }
    }
  }
  return null;
}

async function main() {
  const provider = new ethers.JsonRpcProvider(
    config.rpcUrl,
    { chainId: 5887, name: 'dukong-testnet' },
    { staticNetwork: true }
  );

  console.log('\n=== Checking Pools on Dukong Testnet ===\n');
  console.log(`RPC: ${config.rpcUrl}\n`);

  // Check both DEXs
  for (const [dexKey, dexConfig] of Object.entries({ quickswap: config.quickswap, lotus: config.lotus })) {
    console.log(`\n${'='.repeat(50)}`);
    console.log(`${dexConfig.name}`);
    console.log(`Factory: ${dexConfig.factory}`);
    console.log(`${'='.repeat(50)}\n`);

    const foundPools: string[] = [];

    for (const [token0Name, token1Name] of TOKEN_PAIRS) {
      const token0Addr = (config.tokens as any)[token0Name];
      const token1Addr = (config.tokens as any)[token1Name];

      if (!token0Addr || !token1Addr || token0Addr === ethers.ZeroAddress || token1Addr === ethers.ZeroAddress) {
        console.log(`⏭️  ${token0Name}/${token1Name}: Skipped (token address not configured)`);
        continue;
      }

      const result = await checkPoolExists(provider, dexConfig.factory, token0Addr, token1Addr, dexConfig.name);
      
      if (result) {
        console.log(`✅ ${token0Name}/${token1Name}: ${result.pool}`);
        console.log(`   Liquidity: ${result.liquidity}`);
        foundPools.push(`${token0Name}/${token1Name}: ${result.pool}`);
      } else {
        console.log(`❌ ${token0Name}/${token1Name}: No pool found`);
      }
    }

    console.log(`\n📊 Summary for ${dexConfig.name}: ${foundPools.length} pools found`);
    if (foundPools.length > 0) {
      console.log('Pools:');
      foundPools.forEach(p => console.log(`   - ${p}`));
    }
  }

  console.log('\n=== Done ===\n');
}

main().catch((err) => {
  console.error('Error:', err);
  process.exit(1);
});

