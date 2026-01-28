/**
 * Token Balance Checker
 *
 * Checks the balances of the tokens required for the current vault tests,
 * plus OM for gas.
 */

const { ethers } = require("hardhat");
const config = require("../testnet-config.json");

const ERC20_ABI = [
  "function balanceOf(address account) external view returns (uint256)",
  "function decimals() external view returns (uint8)",
  "function symbol() external view returns (string)",
  "function name() external view returns (string)"
];

async function main() {
  const [signer] = await ethers.getSigners();
  const address = await signer.getAddress();

  console.log("=== Token Balances ===\n");
  console.log("Wallet Address:", address);
  console.log("Network: MANTRA Dukong Testnet");
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━\n");

  // Check OM (native token) balance
  const omBalance = await signer.getBalance();
  console.log(`OM (Gas Token): ${ethers.utils.formatEther(omBalance)} OM\n`);

  // Check ERC20 token balances
  const tokens = ["USDC", "USDT", "mUSD", "wOM"];
  const balances = {};

  for (const tokenSymbol of tokens) {
    const tokenAddress = config.tokens[tokenSymbol];

    if (!tokenAddress || tokenAddress === "0x0000000000000000000000000000000000000000") {
      console.log(`${tokenSymbol}: Not configured`);
      continue;
    }

    try {
      const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);

      const [balance, decimals, symbol, name] = await Promise.all([
        token.balanceOf(address),
        token.decimals(),
        token.symbol(),
        token.name()
      ]);

      const formattedBalance = ethers.utils.formatUnits(balance, decimals);
      balances[tokenSymbol] = formattedBalance;

      console.log(`${symbol}:`);
      console.log(`  Name: ${name}`);
      console.log(`  Address: ${tokenAddress}`);
      console.log(`  Balance: ${formattedBalance} ${symbol}`);
      console.log(`  Decimals: ${decimals}\n`);

    } catch (error) {
      console.log(`${tokenSymbol}: Error reading balance (${error.message})\n`);
    }
  }

  // Summary
  console.log("━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
  console.log("\n=== Balance Summary ===");
  console.log(`OM:   ${ethers.utils.formatEther(omBalance)}`);
  for (const [symbol, balance] of Object.entries(balances)) {
    console.log(`${symbol}: ${balance}`);
  }

  // Check if ready for testing
  console.log("\n=== Readiness Check ===");
  const hasOM = omBalance.gt(ethers.utils.parseEther("0.1"));
  const hasUSDC = balances.USDC && parseFloat(balances.USDC) > 100;
  const hasUSDT = balances.USDT && parseFloat(balances.USDT) > 100;
  const hasMUSD = balances.mUSD && parseFloat(balances.mUSD) > 100;
  const hasWOM = balances.wOM && parseFloat(balances.wOM) > 1;

  console.log(`OM for gas:  ${hasOM ? '✓' : '✗'} ${hasOM ? 'Ready' : 'Need more OM from faucet'}`);
  console.log(`USDC:        ${hasUSDC ? '✓' : '✗'} ${hasUSDC ? 'Ready' : 'Need to mint USDC'}`);
  console.log(`USDT:        ${hasUSDT ? '✓' : '✗'} ${hasUSDT ? 'Ready' : 'Need to mint USDT'}`);
  console.log(`mUSD:        ${hasMUSD ? '✓' : '✗'} ${hasMUSD ? 'Ready' : 'Need mUSD for *-mUSD pools'}`);
  console.log(`wOM:         ${hasWOM ? '✓' : '✗'} ${hasWOM ? 'Ready' : 'Need wOM for wOM/* pools'}`);

  const allReady = hasOM && hasUSDC && hasUSDT && hasMUSD && hasWOM;

  if (allReady) {
    console.log("\n✅ All tokens ready! You can start testing.");
    console.log("\nNext steps:");
    console.log("  npx hardhat run scripts/test-vaults.js --network testnet");
  } else {
    console.log("\n⚠️  Some tokens are missing.");
    console.log("\nNext steps:");
    if (!hasOM) {
      console.log("  1. Get OM from faucet: https://faucet.dukong.mantrachain.io");
    }
    if (!hasUSDC || !hasUSDT || !hasMUSD) {
      console.log("  2. Mint tokens: npx hardhat run scripts/mint-tokens.js --network testnet");
    }
  }

  console.log("\n━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
