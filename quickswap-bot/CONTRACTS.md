# Quickswap Testnet Contracts Reference

This document lists all relevant contract addresses and ABIs for interacting with Quickswap on the Mantrachain Dukong testnet.

## Network Information

- **Network Name**: Mantra Dukong Testnet
- **RPC URL**: `https://rpc.dukong.mantrachain.io`
- **Chain ID**: `96970`
- **Currency Symbol**: `OM`
- **Block Explorer**: `https://explorer.dukong.io`

## Quickswap/Algebra Contracts

### Core Contracts

| Contract | Address | Purpose |
|----------|---------|---------|
| **AlgebraFactory** | `0x10253594A832f967994b44f33411940533302ACb` | Creates and manages pools |
| **AlgebraPoolDeployer** | `0xd7cB0E0692f2D55A17bA81c1fE5501D66774fC4A` | Deploys pool contracts |
| **AlgebraCommunityVault** | `0x4439199c3743161ca22bB8F8B6deC5bF6fF65b04` | Community fee collection |
| **AlgebraVaultFactoryStub** | `0x955B95b8532fe75DDCf2161f61127Be74A768158` | Vault factory |
| **PluginFactory** | `0xFe3BEcd788320465ab649015F34F7771220A88b2` | Plugin management |

### Periphery Contracts (Used by Bot)

| Contract | Address | Purpose |
|----------|---------|---------|
| **SwapRouter** | `0x3012E9049d05B4B5369D690114D5A5861EbB85cb` | Execute token swaps |
| **QuoterV2** | `0xa77aD9f635a3FB3bCCC5E6d1A87cB269746Aba17` | Get swap quotes |
| **NonfungiblePositionManager** | `0x69D57B9D705eaD73a5d2f2476C30c55bD755cc2F` | Manage LP positions |
| **NonfungibleTokenPositionDescriptor** | `0xD637cbc214Bc3dD354aBb309f4fE717ffdD0B28C` | Position metadata |
| **TickLens** | `0x13fcE0acbe6Fb11641ab753212550574CaD31415` | Query tick data |
| **AlgebraInterfaceMulticall** | `0xB4F9b6b019E75CBe51af4425b2Fc12797e2Ee2a1` | Batch queries |
| **Proxy** | `0x6AD6A4f233F1E33613e996CCc17409B93fF8bf5f` | Proxy contract |

### Utility Contracts

| Contract | Address | Purpose |
|----------|---------|---------|
| **EntryPoint** | `0x4A3BC48C156384f9564Fd65A53a2f3D534D8f2b7` | Account abstraction |

## Contract Interfaces

### SwapRouter Interface

The bot primarily uses the SwapRouter for executing trades.

**IMPORTANT**: The Algebra SwapRouter requires a `deployer` parameter which is the **AlgebraPoolDeployer** address (`0xd7cB0E0692f2D55A17bA81c1fE5501D66774fC4A`), NOT the factory address!

```solidity
interface ISwapRouter {
    struct ExactInputSingleParams {
        address tokenIn;
        address tokenOut;
        address deployer;         // AlgebraPoolDeployer address - REQUIRED!
        address recipient;
        uint256 deadline;
        uint256 amountIn;
        uint256 amountOutMinimum;
        uint160 limitSqrtPrice;
    }

    function exactInputSingle(ExactInputSingleParams calldata params)
        external
        payable
        returns (uint256 amountOut);
}
```

> **Note**: The `deployer` parameter is used by the router to identify which pool deployer created the pool. Using the wrong address (e.g., the factory address) will cause swaps to fail with callback validation errors.

### AlgebraPool Interface

For querying pool state:

```solidity
interface IAlgebraPool {
    function globalState()
        external
        view
        returns (
            uint160 price,
            int24 tick,
            uint16 fee,
            uint16 timepointIndex,
            uint8 communityFeeToken0,
            uint8 communityFeeToken1,
            bool unlocked
        );

    function token0() external view returns (address);
    function token1() external view returns (address);
    function liquidity() external view returns (uint128);
}
```

### QuoterV2 Interface

For getting swap quotes:

```solidity
interface IQuoterV2 {
    function quoteExactInputSingle(
        address tokenIn,
        address tokenOut,
        uint256 amountIn,
        uint160 limitSqrtPrice
    )
        external
        returns (
            uint256 amountOut,
            uint160 sqrtPriceX96After,
            uint32 initializedTicksCrossed,
            uint256 gasEstimate
        );
}
```

## Finding Pool Addresses

### Method 1: Query AlgebraFactory

```typescript
import { ethers } from 'ethers';

const provider = new ethers.JsonRpcProvider('https://rpc.dukong.mantrachain.io');
const factoryAddress = '0x10253594A832f967994b44f33411940533302ACb';

const factoryABI = [
  'function poolByPair(address tokenA, address tokenB) external view returns (address pool)'
];

const factory = new ethers.Contract(factoryAddress, factoryABI, provider);

// Get pool for token pair
const poolAddress = await factory.poolByPair(
  '0xToken0Address',
  '0xToken1Address'
);

console.log('Pool address:', poolAddress);
```

### Method 2: Block Explorer

1. Go to https://explorer.dukong.io
2. Navigate to the AlgebraFactory contract: `0x10253594A832f967994b44f33411940533302ACb`
3. Check the "Events" tab for `PoolCreated` events
4. Find the pool for your desired token pair

### Method 3: Quickswap Interface

1. Visit Quickswap on Mantrachain testnet
2. Navigate to the liquidity pool of interest
3. Check the URL or interface for the pool contract address

## Token Contracts

Common testnet tokens (add your specific tokens here):

| Token | Symbol | Address | Decimals |
|-------|--------|---------|----------|
| Wrapped OM | WOM | `TBD` | 18 |
| Test Token A | TTA | `TBD` | 18 |
| Test Token B | TTB | `TBD` | 18 |

> **Note**: Update this table with actual testnet token addresses you're using

## Important Constants

### Price Representation

Quickswap/Algebra uses `sqrtPriceX96` for price representation:

```
price = (sqrtPriceX96 / 2^96)^2
```

The actual price of token1 in terms of token0:

```
price = (sqrtPriceX96 / 2^96)^2 * 10^(decimals0 - decimals1)
```

### Tick Representation

Ticks are logarithmic price points:

```
price = 1.0001^tick
```

### Fee Tiers

Algebra uses dynamic fees, but typical ranges:
- Low volatility: 0.01% - 0.05%
- Medium volatility: 0.05% - 0.3%
- High volatility: 0.3% - 1%

## Verifying Contracts

All contracts can be verified on the Mantrachain testnet explorer:

```bash
# Using Hardhat
npx hardhat verify --network mantra-testnet CONTRACT_ADDRESS "Constructor Args"
```

Explorer: https://explorer.dukong.io

## Getting Testnet Tokens

### Native OM Tokens

Contact Mantrachain team or use their testnet faucet (if available).

### Pool Tokens

1. Get token addresses from pool contracts
2. Check if there's a faucet for test tokens
3. If tokens are wrapped native tokens, use the wrapper contract
4. Some pools may have testnet-specific minting functions

## Contract Source Code

Quickswap uses Algebra Protocol. Source code references:

- **Algebra Core**: https://github.com/cryptoalgebra/Algebra
- **Algebra Periphery**: https://github.com/cryptoalgebra/Algebra-periphery

## Advanced: Creating Your Own Pool

If you need to create a test pool:

```typescript
import { ethers } from 'ethers';

const factoryAddress = '0x10253594A832f967994b44f33411940533302ACb';
const factoryABI = [
  'function createPool(address tokenA, address tokenB) external returns (address pool)'
];

const wallet = new ethers.Wallet(privateKey, provider);
const factory = new ethers.Contract(factoryAddress, factoryABI, wallet);

// Create pool
const tx = await factory.createPool(token0Address, token1Address);
await tx.wait();

// Get pool address
const poolAddress = await factory.poolByPair(token0Address, token1Address);
console.log('Created pool:', poolAddress);
```

Then initialize the pool with starting price and add liquidity using NonfungiblePositionManager.

## Security Considerations

### Testnet Only

These contracts are on **testnet only**. Never use with real funds.

### Approvals

The bot will request token approvals for the SwapRouter. On testnet, you can approve unlimited amounts for convenience:

```typescript
await tokenContract.approve(swapRouterAddress, ethers.MaxUint256);
```

### Private Keys

Always use a dedicated testnet wallet. Never use your mainnet private key.

## Resources

- **Mantrachain Docs**: https://docs.mantrachain.io
- **Testnet Explorer**: https://explorer.dukong.io
- **Algebra Documentation**: https://docs.algebra.finance
- **Quickswap Docs**: https://docs.quickswap.exchange

## Support

For issues with contracts or testnet:
- Mantrachain Discord/Telegram
- Quickswap community channels
- Check testnet status page

---

**Last Updated**: January 2026

**Source**: [Mantrachain Testnet Documentation](https://docs.mantrachain.io/resources/contracts/testnet)

