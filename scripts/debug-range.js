const { ethers } = require("hardhat");

async function main() {
  const [signer] = await ethers.getSigners();
  
  const strategyAddr = "0x145f974732D8528D105d07A1B9A87C2DD2D6F205";
  
  // Try different ABI signatures for range()
  const abis = [
    "function range() view returns (int24, int24)",
    "function range() view returns (int24 lowerTick, int24 upperTick)",
    "function range() view returns (uint256)",
    "function range() view returns (int256)",
    "function range() external view returns (int24, int24)"
  ];
  
  for (const abi of abis) {
    try {
      const contract = new ethers.Contract(strategyAddr, [abi], signer);
      const result = await contract.range();
      console.log(`ABI: ${abi}`);
      console.log(`Result type: ${typeof result}`);
      console.log(`Result:`, result);
      console.log(`Is array: ${Array.isArray(result)}`);
      if (Array.isArray(result)) {
        console.log(`  [0]: ${result[0]} (type: ${typeof result[0]})`);
        console.log(`  [1]: ${result[1]} (type: ${typeof result[1]})`);
      }
      console.log('---');
    } catch (e) {
      console.log(`ABI: ${abi} - FAILED: ${e.message.slice(0, 80)}`);
    }
  }
  
  // Also check what the raw call returns
  console.log('\n--- Raw call data ---');
  const iface = new ethers.utils.Interface(["function range() view returns (int24, int24)"]);
  const calldata = iface.encodeFunctionData("range");
  console.log(`Calldata: ${calldata}`);
  
  const rawResult = await signer.call({ to: strategyAddr, data: calldata });
  console.log(`Raw result: ${rawResult}`);
  
  // Decode it
  const decoded = iface.decodeFunctionResult("range", rawResult);
  console.log(`Decoded: ${decoded}`);
  console.log(`Decoded[0]: ${decoded[0]} (${typeof decoded[0]})`);
  console.log(`Decoded[1]: ${decoded[1]} (${typeof decoded[1]})`);
}

main().catch(console.error);
