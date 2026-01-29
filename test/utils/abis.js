// Central ABIs used by the Mocha test harness (Ethers v5)

const VAULT_MIN_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function balances() view returns (uint256 amount0, uint256 amount1)",
  "function strategy() view returns (address)",
  "function paused() view returns (bool)",
  // optional range/position (may not exist on all vaults)
  "function positionMain() view returns (int24 tickLower, int24 tickUpper, uint128 liquidity)",
  "function range() view returns (int24 lowerTick, int24 upperTick)"
];

const STRATEGY_MIN_ABI = [
  "function lpToken0() view returns (address)",
  "function lpToken1() view returns (address)",
  "function pool() view returns (address)",
  "function rebalance() external",
  // optional fee + maintenance hooks (not present on all strategies)
  "function harvest() external",
  "function fees0() view returns (uint256)",
  "function fees1() view returns (uint256)",
  "function unclaimedFees0() view returns (uint256)",
  "function unclaimedFees1() view returns (uint256)",
  "function accumulatedFees() view returns (uint256, uint256)",
  "function balances() view returns (uint256 amount0, uint256 amount1)",
  "function lastHarvest() view returns (uint256)"
];

const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function transfer(address to, uint256 amount) external returns (bool)",
  "function transferFrom(address from, address to, uint256 amount) external returns (bool)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)"
];

module.exports = {
  VAULT_MIN_ABI,
  STRATEGY_MIN_ABI,
  ERC20_ABI
};
