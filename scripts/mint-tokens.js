/**
 * Token Minting Script for LP Vault Testing
 *
 * This script mints test tokens (WETH, USDC, USDT, WBTC) to the test wallet
 * for use in LP vault testing on Mantra Dukong testnet.
 */

const { ethers } = require("hardhat");
const config = require("../testnet-config.json");

// ERC20 Mintable ABI
const MINTABLE_TOKEN_ABI = [
  "function mint(address to, uint256 amount) external",
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)",
  "function name() external view returns (string)"
];

// Alternative mint function signatures that might be used
const ALTERNATIVE_MINT_ABI = [
  "function mint(uint256 amount) external",
  "function faucet(address to, uint256 amount) external",
  "function requestTokens(uint256 amount) external",
  "function getMeTokens(uint256 amount) external"
];

// Mint amounts (adjust as needed)
const MINT_AMOUNTS = {
  WETH: ethers.utils.parseEther("100"),        // 100 WETH
  USDC: ethers.utils.parseUnits("100000", 6),  // 100,000 USDC (6 decimals)
  USDT: ethers.utils.parseUnits("100000", 6),  // 100,000 USDT (6 decimals)
  WBTC: ethers.utils.parseUnits("10", 8)       // 10 WBTC (8 decimals)
};

async function main() {
  const [signer] = await ethers.getSigners();
  const address = await signer.getAddress();

  console.log("=== Token Minting Script ===\n");
  console.log("Wallet Address:", address);
  console.log("Network: MANTRA Dukong Testnet");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Check OM balance first
  const omBalance = await signer.getBalance();
  console.log(`OM Balance: ${ethers.utils.formatEther(omBalance)} OM`);

  if (omBalance.eq(0)) {
    console.log("\n❌ ERROR: No OM balance!");
    console.log("Please get OM from the faucet first:");
    console.log("https://faucet.dukong.mantrachain.io");
    console.log(`Wallet address: ${address}`);
    process.exit(1);
  }
  console.log("✓ Sufficient OM for gas\n");

  // Tokens to mint
  const tokens = ["WETH", "USDC", "USDT", "WBTC"];

  for (const tokenSymbol of tokens) {
    const tokenAddress = config.tokens[tokenSymbol];

    if (!tokenAddress || tokenAddress === "0x0000000000000000000000000000000000000000") {
      console.log(`⚠️  Skipping ${tokenSymbol} - address not configured\n`);
      continue;
    }

    console.log(`=== Minting ${tokenSymbol} ===`);
    console.log(`Token Address: ${tokenAddress}`);

    try {
      // Create contract instance
      const token = new ethers.Contract(tokenAddress, MINTABLE_TOKEN_ABI, signer);

      // Get token info
      const [name, symbol, decimals] = await Promise.all([
        token.name(),
        token.symbol(),
        token.decimals()
      ]);

      console.log(`Token Name: ${name}`);
      console.log(`Symbol: ${symbol}`);
      console.log(`Decimals: ${decimals}`);

      // Check balance before
      const balanceBefore = await token.balanceOf(address);
      console.log(`Balance Before: ${ethers.utils.formatUnits(balanceBefore, decimals)} ${symbol}`);

      // Mint tokens
      const mintAmount = MINT_AMOUNTS[tokenSymbol];
      console.log(`Minting: ${ethers.utils.formatUnits(mintAmount, decimals)} ${symbol}...`);

      try {
        // Try standard mint(address, amount) function
        const tx = await token.mint(address, mintAmount);
        console.log(`Transaction sent: ${tx.hash}`);

        const receipt = await tx.wait();
        console.log(`✓ Transaction confirmed in block ${receipt.blockNumber}`);

      } catch (mintError) {
        // If standard mint fails, try alternative signatures
        console.log(`Standard mint failed, trying alternatives...`);

        const altToken = new ethers.Contract(tokenAddress, ALTERNATIVE_MINT_ABI, signer);

        // Try mint(amount) without address
        try {
          const tx = await altToken.mint(mintAmount);
          console.log(`Transaction sent: ${tx.hash}`);
          const receipt = await tx.wait();
          console.log(`✓ Transaction confirmed in block ${receipt.blockNumber}`);
        } catch (e) {
          throw new Error(`Could not mint tokens. The contract might require special permissions or use a different function. Error: ${mintError.message}`);
        }
      }

      // Check balance after
      const balanceAfter = await token.balanceOf(address);
      console.log(`Balance After: ${ethers.utils.formatUnits(balanceAfter, decimals)} ${symbol}`);
      console.log(`✓ Successfully minted ${symbol}!\n`);

    } catch (error) {
      console.error(`✗ Error minting ${tokenSymbol}:`, error.message);
      console.log(`\nTroubleshooting tips:`);
      console.log(`1. Check if the token contract has a public mint function`);
      console.log(`2. Verify the contract on explorer: https://explorer.dukong.io/address/${tokenAddress}`);
      console.log(`3. You might need to use the block explorer's "Write Contract" feature directly`);
      console.log(`4. The mint function might require special permissions\n`);
    }
  }

  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("\n✅ Minting process completed!");
  console.log("\nNext steps:");
  console.log("1. Verify balances: npx hardhat run scripts/check-token-balances.js --network testnet");
  console.log("2. Start testing: node scripts/price-mover.js quickswap WETH/USDC small-up");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("\n❌ Script failed:", error);
    process.exit(1);
  });
