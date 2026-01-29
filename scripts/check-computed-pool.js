const { ethers } = require('hardhat');

async function main() {
  // Tokens from the trade - use lowercase to skip checksum
  const USDT = "0x21e56013a76a7f1f86cf7ee95c0a5670c7b7e44d";
  const mUSD = "0x4b545d0758eda6601b051259bd977125fbda7ba2";
  
  // Factory
  const factory = new ethers.Contract(
    "0x10253594A832f967994b44f33411940533302ACb",
    [
      "function poolByPair(address,address) view returns (address)",
      "function computePoolAddress(address,address) view returns (address)"
    ],
    ethers.provider
  );
  
  console.log("=== Pool Address Investigation ===\n");
  
  // Check poolByPair
  const poolByPair = await factory.poolByPair(USDT, mUSD);
  console.log("Factory.poolByPair(USDT, mUSD):", poolByPair);
  
  const poolByPairReverse = await factory.poolByPair(mUSD, USDT);
  console.log("Factory.poolByPair(mUSD, USDT):", poolByPairReverse);
  
  // Expected pool from config
  console.log("\nExpected pool from config:", "0xf22D49e30794AEe1e74E114332B37dEBd79eE64a");
  
  // Pool that was actually called by router
  console.log("Pool router actually called:", "0xb1c5318d9e779ae5cedb45bf726d3d305531cf60");
  
  // Check what the "wrong" pool actually is
  console.log("\n=== Checking the pool router called ===");
  const wrongPool = new ethers.Contract(
    "0xb1c5318d9e779ae5cedb45bf726d3d305531cf60",
    [
      "function token0() view returns (address)",
      "function token1() view returns (address)",
      "function safelyGetStateOfAMM() view returns (uint160, int24, uint16, uint8, uint8, bool)"
    ],
    ethers.provider
  );
  
  try {
    const token0 = await wrongPool.token0();
    const token1 = await wrongPool.token1();
    console.log("token0:", token0);
    console.log("token1:", token1);
  } catch (e) {
    console.log("Pool at wrong address has no token0/token1:", e.message.slice(0, 100));
  }
  
  // Check the correct pool
  console.log("\n=== Checking the correct pool from config ===");
  const correctPool = new ethers.Contract(
    "0xf22D49e30794AEe1e74E114332B37dEBd79eE64a",
    [
      "function token0() view returns (address)",
      "function token1() view returns (address)"
    ],
    ethers.provider
  );
  
  try {
    const token0 = await correctPool.token0();
    const token1 = await correctPool.token1();
    console.log("token0:", token0);
    console.log("token1:", token1);
  } catch (e) {
    console.log("Error:", e.message);
  }
  
  // Check which token is token0 by sorting
  console.log("\n=== Token Sorting ===");
  console.log("USDT address:", USDT);
  console.log("mUSD address:", mUSD);
  console.log("USDT < mUSD ?", USDT.toLowerCase() < mUSD.toLowerCase());
}

main().catch(console.error);
