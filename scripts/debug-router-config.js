const { ethers } = require('hardhat');

async function main() {
  // Tokens 
  const USDT = "0x21e56013a76a7f1f86cf7ee95c0a5670c7b7e44d";
  const mUSD = "0x4b545d0758eda6601b051259bd977125fbda7ba2";
  
  // Addresses
  const ROUTER = "0x3012E9049d05B4B5369D690114D5A5861EbB85cb";
  const FACTORY = "0x10253594A832f967994b44f33411940533302ACb";
  const POOL_DEPLOYER = "0xd7cB0E0692f2D55A17bA81c1fE5501D66774fC4A";
  
  const router = new ethers.Contract(
    ROUTER,
    [
      "function factory() view returns (address)",
      "function poolDeployer() view returns (address)",
      "function POOL_INIT_CODE_HASH() view returns (bytes32)"
    ],
    ethers.provider
  );
  
  const deployer = new ethers.Contract(
    POOL_DEPLOYER,
    [
      "function POOL_INIT_CODE_HASH() view returns (bytes32)",
      "function factory() view returns (address)"
    ],
    ethers.provider
  );
  
  console.log("=== Router Configuration ===");
  const routerFactory = await router.factory();
  const routerDeployer = await router.poolDeployer();
  console.log("router.factory():", routerFactory);
  console.log("router.poolDeployer():", routerDeployer);
  
  try {
    const routerInitHash = await router.POOL_INIT_CODE_HASH();
    console.log("router.POOL_INIT_CODE_HASH():", routerInitHash);
  } catch (e) {
    console.log("router has no POOL_INIT_CODE_HASH");
  }
  
  console.log("\n=== Deployer Configuration ===");
  try {
    const deployerInitHash = await deployer.POOL_INIT_CODE_HASH();
    console.log("deployer.POOL_INIT_CODE_HASH():", deployerInitHash);
  } catch (e) {
    console.log("deployer has no POOL_INIT_CODE_HASH");
  }
  
  try {
    const deployerFactory = await deployer.factory();
    console.log("deployer.factory():", deployerFactory);
  } catch (e) {
    console.log("deployer has no factory()");
  }
  
  // Try to manually compute the expected pool address
  console.log("\n=== Manual Pool Address Computation ===");
  
  // Algebra uses CREATE2 with: deployer + salt(token0, token1) + initCodeHash
  // Sort tokens
  const [token0, token1] = USDT.toLowerCase() < mUSD.toLowerCase() 
    ? [USDT, mUSD] 
    : [mUSD, USDT];
  
  console.log("token0:", token0);
  console.log("token1:", token1);
  
  // The actual pool address
  console.log("\nActual pool from factory:", "0xf22D49e30794AEe1e74E114332B37dEBd79eE64a");
  console.log("Wrong pool router tried:  ", "0xb1c5318d9e779ae5cedb45bf726d3d305531cf60");
  
  // Check the actual pool's deployer
  const actualPool = new ethers.Contract(
    "0xf22D49e30794AEe1e74E114332B37dEBd79eE64a",
    [
      "function factory() view returns (address)",
    ],
    ethers.provider
  );
  
  console.log("\n=== Actual Pool's Factory ===");
  try {
    const poolFactory = await actualPool.factory();
    console.log("pool.factory():", poolFactory);
    console.log("Expected factory:", FACTORY);
    console.log("Match:", poolFactory.toLowerCase() === FACTORY.toLowerCase());
  } catch (e) {
    console.log("pool has no factory()?", e.message.slice(0, 100));
  }
}

main().catch(console.error);
