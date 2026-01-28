/**
 * Batch Price Scenario Runner
 *
 * Runs multiple price movement scenarios for the narrowed vault pairs:
 * - Lotus USDC/mUSD
 * - Lotus USDT/USDC
 *
 * Usage:
 *   node scripts/batch-price-scenarios.js
 */

const { ethers } = require("hardhat");
const { PriceMover } = require("./price-mover");
const config = require("../testnet-config.json");

const scenarios = [
  {
    name: "Initial Small Moves (Lotus)",
    tests: [
      { dex: "lotus", pair: "USDT/USDC", action: "small-up" },
      { dex: "lotus", pair: "USDT/USDC", action: "small-down" },
      { dex: "lotus", pair: "USDC/mUSD", action: "small-up" },
      { dex: "lotus", pair: "USDC/mUSD", action: "small-down" }
    ]
  },
  {
    name: "Rebalance Testing (Lotus)",
    tests: [
      { dex: "lotus", pair: "USDT/USDC", action: "out-of-range-up" },
      { dex: "lotus", pair: "USDT/USDC", action: "out-of-range-down" },
      { dex: "lotus", pair: "USDC/mUSD", action: "out-of-range-up" },
      { dex: "lotus", pair: "USDC/mUSD", action: "out-of-range-down" }
    ]
  },
  {
    name: "Volatility Testing (Lotus)",
    tests: [
      { dex: "lotus", pair: "USDT/USDC", action: "volatility" },
      { dex: "lotus", pair: "USDC/mUSD", action: "volatility" }
    ]
  }
];

async function runScenario(mover, test) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🎯 Running: ${test.dex.toUpperCase()} | ${test.pair} | ${test.action}`);
  console.log('='.repeat(80));

  const pairConfig = config.pairs.find(p => p.name === test.pair);
  if (!pairConfig) {
    console.error(`⚠️  Pair ${test.pair} not found, skipping...`);
    return { success: false, error: "Pair not found" };
  }

  const token0Address = config.tokens[pairConfig.token0];
  const token1Address = config.tokens[pairConfig.token1];

  if (!token0Address || !token1Address) {
    console.error(`⚠️  Token addresses not configured for ${test.pair}, skipping...`);
    return { success: false, error: "Tokens not configured" };
  }

  try {
    const startTime = Date.now();

    switch (test.action) {
      case "small-up":
        await mover.movePriceUp(test.dex, token0Address, token1Address, pairConfig.feeTier, 3);
        break;
      case "small-down":
        await mover.movePriceDown(test.dex, token0Address, token1Address, pairConfig.feeTier, 3);
        break;
      case "large-up":
        await mover.movePriceUp(test.dex, token0Address, token1Address, pairConfig.feeTier, 15);
        break;
      case "large-down":
        await mover.movePriceDown(test.dex, token0Address, token1Address, pairConfig.feeTier, 15);
        break;
      case "volatility":
        await mover.createVolatility(test.dex, token0Address, token1Address, pairConfig.feeTier, 10, "medium");
        break;
      case "out-of-range-up":
        await mover.pushOutOfRange(test.dex, token0Address, token1Address, pairConfig.feeTier, "up");
        break;
      case "out-of-range-down":
        await mover.pushOutOfRange(test.dex, token0Address, token1Address, pairConfig.feeTier, "down");
        break;
      case "gradual-up":
        await mover.gradualDrift(test.dex, token0Address, token1Address, pairConfig.feeTier, "up", 5);
        break;
      case "gradual-down":
        await mover.gradualDrift(test.dex, token0Address, token1Address, pairConfig.feeTier, "down", 5);
        break;
      default:
        throw new Error(`Unknown action: ${test.action}`);
    }

    const duration = ((Date.now() - startTime) / 1000).toFixed(2);
    console.log(`✅ Completed in ${duration}s`);

    return { success: true, duration };

  } catch (error) {
    console.error(`❌ Failed: ${error.message}`);
    return { success: false, error: error.message };
  }
}

async function main() {
  const [signer] = await ethers.getSigners();
  console.log(`\n💼 Using account: ${await signer.getAddress()}\n`);

  const mover = new PriceMover(signer);

  const results = {
    total: 0,
    successful: 0,
    failed: 0,
    skipped: 0,
    details: []
  };

  console.log(`\n🚀 Starting Batch Price Scenario Testing`);
  console.log(`${'='.repeat(80)}\n`);

  for (const scenario of scenarios) {
    console.log(`\n📋 Scenario Group: ${scenario.name}`);
    console.log(`${'─'.repeat(80)}`);

    for (const test of scenario.tests) {
      results.total++;
      const result = await runScenario(mover, test);

      if (result.success) {
        results.successful++;
      } else if (result.error === "Pair not found" || result.error === "Tokens not configured") {
        results.skipped++;
      } else {
        results.failed++;
      }

      results.details.push({
        scenario: scenario.name,
        test: `${test.dex} | ${test.pair} | ${test.action}`,
        ...result
      });

      // Delay between tests
      await new Promise(resolve => setTimeout(resolve, 3000));
    }
  }

  // Print summary
  console.log(`\n\n${'='.repeat(80)}`);
  console.log(`📊 BATCH TESTING SUMMARY`);
  console.log('='.repeat(80));
  console.log(`Total Tests: ${results.total}`);
  console.log(`✅ Successful: ${results.successful}`);
  console.log(`❌ Failed: ${results.failed}`);
  console.log(`⚠️  Skipped: ${results.skipped}`);
  console.log('='.repeat(80));

  if (results.failed > 0) {
    console.log(`\n❌ Failed Tests:`);
    results.details
      .filter(d => d.success === false && d.error !== "Pair not found" && d.error !== "Tokens not configured")
      .forEach(d => {
        console.log(`  - ${d.test}: ${d.error}`);
      });
  }

  if (results.skipped > 0) {
    console.log(`\n⚠️  Skipped Tests (needs configuration):`);
    results.details
      .filter(d => d.error === "Pair not found" || d.error === "Tokens not configured")
      .forEach(d => {
        console.log(`  - ${d.test}`);
      });
  }

  console.log(`\n✨ Batch testing completed!\n`);
}

if (require.main === module) {
  main()
    .then(() => process.exit(0))
    .catch((error) => {
      console.error(error);
      process.exit(1);
    });
}

module.exports = { scenarios };
