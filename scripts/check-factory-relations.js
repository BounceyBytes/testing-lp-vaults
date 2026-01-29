/**
 * Deep dive: Check pool-factory relationship
 */

const { ethers } = require("hardhat");
const config = require("../testnet-config.json");

async function main() {
  console.log("=== Pool-Factory Relationship Check ===\n");
  
  const [signer] = await ethers.getSigners();
  
  // Factory ABI
  const FACTORY_ABI = [
    "function poolByPair(address tokenA, address tokenB) view returns (address pool)",
    "function poolDeployer() view returns (address)",
    "function owner() view returns (address)"
  ];
  
  // Pool Deployer ABI
  const DEPLOYER_ABI = [
    "function factory() view returns (address)",
    "function getPool(address tokenA, address tokenB) view returns (address pool)"
  ];
  
  // Pool ABI
  const POOL_ABI = [
    "function factory() view returns (address)",
    "function token0() view returns (address)",
    "function token1() view returns (address)",
    "function plugin() view returns (address)"
  ];
  
  const factory = new ethers.Contract(config.quickswap.factory, FACTORY_ABI, signer);
  const deployer = new ethers.Contract(config.quickswap.poolDeployer, DEPLOYER_ABI, signer);
  
  console.log("Contract addresses from config:");
  console.log(`  Factory: ${config.quickswap.factory}`);
  console.log(`  PoolDeployer: ${config.quickswap.poolDeployer}`);
  
  // Check factory's pool deployer
  console.log("\n--- Factory State ---");
  try {
    const factoryDeployer = await factory.poolDeployer();
    console.log(`Factory.poolDeployer(): ${factoryDeployer}`);
    console.log(`Matches config: ${factoryDeployer.toLowerCase() === config.quickswap.poolDeployer.toLowerCase()}`);
  } catch (e) {
    console.log(`Could not get factory.poolDeployer(): ${e.message.slice(0, 100)}`);
  }
  
  try {
    const owner = await factory.owner();
    console.log(`Factory.owner(): ${owner}`);
  } catch (e) {
    console.log(`Could not get factory.owner(): ${e.message.slice(0, 50)}`);
  }
  
  // Check deployer's factory
  console.log("\n--- PoolDeployer State ---");
  try {
    const deployerFactory = await deployer.factory();
    console.log(`PoolDeployer.factory(): ${deployerFactory}`);
    console.log(`Matches config: ${deployerFactory.toLowerCase() === config.quickswap.factory.toLowerCase()}`);
  } catch (e) {
    console.log(`Could not get deployer.factory(): ${e.message.slice(0, 100)}`);
  }
  
  // Check the USDT/mUSD pool
  console.log("\n--- USDT/mUSD Pool Check ---");
  const USDT = config.tokens.USDT;
  const mUSD = config.tokens.mUSD;
  const poolAddress = config.pools.quickswap.USDT_mUSD;
  
  console.log(`USDT: ${USDT}`);
  console.log(`mUSD: ${mUSD}`);
  console.log(`Pool from config: ${poolAddress}`);
  
  // Get pool from factory
  try {
    const factoryPool = await factory.poolByPair(USDT, mUSD);
    console.log(`Factory.poolByPair(USDT,mUSD): ${factoryPool}`);
    console.log(`Matches config: ${factoryPool.toLowerCase() === poolAddress.toLowerCase()}`);
  } catch (e) {
    console.log(`Could not get pool from factory: ${e.message.slice(0, 100)}`);
  }
  
  // Get pool from deployer
  try {
    const deployerPool = await deployer.getPool(USDT, mUSD);
    console.log(`PoolDeployer.getPool(USDT,mUSD): ${deployerPool}`);
  } catch (e) {
    console.log(`Could not get pool from deployer: ${e.message.slice(0, 100)}`);
  }
  
  // Check pool's factory reference
  const pool = new ethers.Contract(poolAddress, POOL_ABI, signer);
  try {
    const poolFactory = await pool.factory();
    console.log(`\nPool.factory(): ${poolFactory}`);
    console.log(`Matches config factory: ${poolFactory.toLowerCase() === config.quickswap.factory.toLowerCase()}`);
  } catch (e) {
    console.log(`Could not get pool.factory(): ${e.message.slice(0, 100)}`);
  }
  
  try {
    const plugin = await pool.plugin();
    console.log(`Pool.plugin(): ${plugin}`);
  } catch (e) {
    console.log(`Could not get pool.plugin(): ${e.message.slice(0, 50)}`);
  }
  
  // Let's also check the router's WNativeToken and factory references
  console.log("\n--- SwapRouter State ---");
  const ROUTER_VIEW_ABI = [
    "function factory() view returns (address)",
    "function poolDeployer() view returns (address)",
    "function WNativeToken() view returns (address)"
  ];
  
  const router = new ethers.Contract(config.quickswap.router, ROUTER_VIEW_ABI, signer);
  
  try {
    const routerFactory = await router.factory();
    console.log(`Router.factory(): ${routerFactory}`);
    console.log(`Matches config: ${routerFactory.toLowerCase() === config.quickswap.factory.toLowerCase()}`);
  } catch (e) {
    console.log(`Could not get router.factory(): ${e.message.slice(0, 100)}`);
  }
  
  try {
    const routerDeployer = await router.poolDeployer();
    console.log(`Router.poolDeployer(): ${routerDeployer}`);
    console.log(`Matches config: ${routerDeployer.toLowerCase() === config.quickswap.poolDeployer.toLowerCase()}`);
  } catch (e) {
    console.log(`Could not get router.poolDeployer(): ${e.message.slice(0, 100)}`);
  }
  
  try {
    const wNative = await router.WNativeToken();
    console.log(`Router.WNativeToken(): ${wNative}`);
  } catch (e) {
    console.log(`Could not get router.WNativeToken(): ${e.message.slice(0, 50)}`);
  }
  
  console.log("\n=== Check Complete ===");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
