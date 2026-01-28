#!/usr/bin/env node

/**
 * Quick Test Script
 *
 * Runs the narrowed vault test suite (USDC/mUSD + USDT/USDC) for fast validation.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const QUICK_TESTS = [
  {
    description: 'CLM vault tests (USDC/mUSD + USDT/USDC)',
    command: 'npx hardhat run scripts/test-vaults.js --network testnet'
  }
];

const results = {
  startTime: new Date().toISOString(),
  tests: [],
  passed: 0,
  failed: 0
};

function runTest(test) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`🧪 ${test.description}`);
  console.log(`   Command: ${test.command}`);
  console.log(`${'='.repeat(80)}\n`);

  const startTime = Date.now();

  try {
    const output = execSync(test.command, {
      encoding: 'utf8',
      stdio: 'pipe',
      maxBuffer: 10 * 1024 * 1024
    });

    const duration = Date.now() - startTime;
    console.log(output);
    console.log(`\n✅ Test passed! Duration: ${(duration / 1000).toFixed(2)}s\n`);

    results.tests.push({ description: test.description, command: test.command, success: true, duration, error: null });
    results.passed++;
    return true;
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`\n❌ Test failed! Duration: ${(duration / 1000).toFixed(2)}s`);
    console.error(`Error: ${error.message}\n`);

    results.tests.push({ description: test.description, command: test.command, success: false, duration, error: error.message });
    results.failed++;
    return false;
  }
}

async function runQuickTests() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║                    LP VAULT QUICK TEST SUITE                              ║
║                    Running ${QUICK_TESTS.length} Essential Test(s)                              ║
╚═══════════════════════════════════════════════════════════════════════════╝
  `);

  // Check balances first
  console.log('\n📊 Checking token balances...\n');
  try {
    execSync('npx hardhat run scripts/check-token-balances.js --network testnet', {
      stdio: 'inherit'
    });
  } catch (error) {
    console.error('\n❌ Balance check failed! Aborting tests.');
    process.exit(1);
  }

  // Run quick tests
  console.log('\n🚀 Starting quick tests...\n');

  for (const test of QUICK_TESTS) {
    await runTest(test);
    // Small delay between tests
    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  results.endTime = new Date().toISOString();
  const duration = (new Date(results.endTime) - new Date(results.startTime)) / 1000;

  // Summary
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║                      QUICK TEST SUITE COMPLETE                            ║
╚═══════════════════════════════════════════════════════════════════════════╝

📊 SUMMARY:
  Total Tests:   ${QUICK_TESTS.length}
  ✅ Passed:      ${results.passed}
  ❌ Failed:      ${results.failed}
  📈 Success Rate: ${((results.passed / QUICK_TESTS.length) * 100).toFixed(2)}%
  ⏱️  Duration:    ${(duration / 60).toFixed(2)} minutes

${results.failed === 0 ? '✅ All quick tests passed! Ready to run full test suite.' : '⚠️  Some tests failed. Fix issues before running full suite.'}
  `);

  // Save results
  const resultsDir = path.join(__dirname, '..', 'test-results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const resultsFile = path.join(resultsDir, `quick-test-results-${timestamp}.json`);
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  console.log(`\n📊 Results saved to: ${resultsFile}\n`);

  process.exit(results.failed > 0 ? 1 : 0);
}

// Run
runQuickTests().catch(error => {
  console.error('\n❌ Quick test execution failed:', error);
  process.exit(1);
});
