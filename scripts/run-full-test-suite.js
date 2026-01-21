#!/usr/bin/env node

/**
 * Comprehensive Test Execution Script
 *
 * This script runs the complete LP Vault testing plan automatically,
 * executing all scenarios across both DEXs and generating a detailed report.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

// Test configuration - using only pools that exist on testnet
// QuickSwap pools: USDC/USDT
// Lotus pools: WETH/USDT, USDC/USDT, WBTC/USDC
const TEST_CONFIG = {
  dexes: ['quickswap', 'lotus'],
  // Pair availability by DEX:
  // - USDC/USDT: both
  // - WETH/USDT: lotus only
  // - WBTC/USDC: lotus only
  pairsByDex: {
    quickswap: ['USDC/USDT'],
    lotus: ['WETH/USDT', 'USDC/USDT', 'WBTC/USDC']
  },
  pairs: ['USDC/USDT', 'WETH/USDT', 'WBTC/USDC'],
  scenarios: [
    'small-up',
    'small-down',
    'large-up',
    'large-down',
    'volatility',
    'out-of-range-up',
    'out-of-range-down',
    'gradual-up',
    'gradual-down'
  ]
};

// Results tracking
const results = {
  startTime: new Date().toISOString(),
  tests: [],
  summary: {
    total: 0,
    passed: 0,
    failed: 0,
    skipped: 0
  }
};

// Helper function to run command and capture output
function runCommand(command, description) {
  console.log(`\n${'='.repeat(80)}`);
  console.log(`📋 ${description}`);
  console.log(`🔧 Command: ${command}`);
  console.log(`${'='.repeat(80)}\n`);

  const startTime = Date.now();

  try {
    const output = execSync(command, {
      encoding: 'utf8',
      stdio: 'pipe',
      maxBuffer: 10 * 1024 * 1024 // 10MB buffer
    });

    const duration = Date.now() - startTime;
    console.log(output);
    console.log(`\n✅ Success! Duration: ${(duration / 1000).toFixed(2)}s\n`);

    return {
      success: true,
      output,
      duration,
      error: null
    };
  } catch (error) {
    const duration = Date.now() - startTime;
    console.error(`\n❌ Failed! Duration: ${(duration / 1000).toFixed(2)}s`);
    console.error(`Error: ${error.message}\n`);
    console.error(error.stdout?.toString() || '');
    console.error(error.stderr?.toString() || '');

    return {
      success: false,
      output: error.stdout?.toString() || '',
      duration,
      error: error.message
    };
  }
}

// Save results to file
function saveResults() {
  const resultsDir = path.join(__dirname, '..', 'test-results');
  if (!fs.existsSync(resultsDir)) {
    fs.mkdirSync(resultsDir, { recursive: true });
  }

  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const resultsFile = path.join(resultsDir, `test-results-${timestamp}.json`);
  const reportFile = path.join(resultsDir, `test-report-${timestamp}.md`);

  // Save JSON results
  fs.writeFileSync(resultsFile, JSON.stringify(results, null, 2));
  console.log(`\n📊 Results saved to: ${resultsFile}`);

  // Generate markdown report
  const report = generateMarkdownReport();
  fs.writeFileSync(reportFile, report);
  console.log(`📄 Report saved to: ${reportFile}`);
}

// Generate markdown report
function generateMarkdownReport() {
  const { summary, tests, startTime, endTime } = results;
  const duration = endTime ? (new Date(endTime) - new Date(startTime)) / 1000 : 0;

  let report = `# LP Vault Testing Report\n\n`;
  report += `**Generated**: ${new Date().toISOString()}\n`;
  report += `**Start Time**: ${startTime}\n`;
  report += `**End Time**: ${endTime}\n`;
  report += `**Total Duration**: ${(duration / 60).toFixed(2)} minutes\n\n`;

  report += `## Summary\n\n`;
  report += `| Metric | Count |\n`;
  report += `|--------|-------|\n`;
  report += `| Total Tests | ${summary.total} |\n`;
  report += `| Passed | ${summary.passed} |\n`;
  report += `| Failed | ${summary.failed} |\n`;
  report += `| Skipped | ${summary.skipped} |\n`;
  report += `| Success Rate | ${summary.total > 0 ? ((summary.passed / summary.total) * 100).toFixed(2) : 0}% |\n\n`;

  report += `## Test Results\n\n`;

  // Group by DEX
  const testsByDex = {};
  tests.forEach(test => {
    if (!testsByDex[test.dex]) {
      testsByDex[test.dex] = [];
    }
    testsByDex[test.dex].push(test);
  });

  for (const [dex, dexTests] of Object.entries(testsByDex)) {
    report += `### ${dex.toUpperCase()}\n\n`;
    report += `| Pair | Scenario | Status | Duration | Notes |\n`;
    report += `|------|----------|--------|----------|-------|\n`;

    dexTests.forEach(test => {
      const status = test.success ? '✅' : '❌';
      const duration = `${(test.duration / 1000).toFixed(2)}s`;
      const notes = test.error ? test.error.substring(0, 50) : 'Success';
      report += `| ${test.pair} | ${test.scenario} | ${status} | ${duration} | ${notes} |\n`;
    });

    report += `\n`;
  }

  // Failed tests details
  const failedTests = tests.filter(t => !t.success);
  if (failedTests.length > 0) {
    report += `## Failed Tests Details\n\n`;

    failedTests.forEach((test, index) => {
      report += `### ${index + 1}. ${test.dex} - ${test.pair} - ${test.scenario}\n\n`;
      report += `**Error**: ${test.error}\n\n`;
      if (test.output) {
        report += `**Output**:\n\`\`\`\n${test.output.substring(0, 500)}\n\`\`\`\n\n`;
      }
    });
  }

  return report;
}

// Main test execution
async function runTests() {
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║                    LP VAULT COMPREHENSIVE TEST SUITE                      ║
║                         MANTRA Dukong Testnet                             ║
╚═══════════════════════════════════════════════════════════════════════════╝
  `);

  // Step 1: Check balances
  console.log('\n📊 STEP 1: Verifying Token Balances\n');
  const balanceCheck = runCommand(
    'npx hardhat run scripts/check-token-balances.js --network testnet',
    'Checking token balances'
  );

  if (!balanceCheck.success) {
    console.error('\n❌ Balance check failed! Please ensure:');
    console.error('  1. You have OM tokens for gas');
    console.error('  2. You have test tokens (WETH, USDC, USDT, WBTC)');
    console.error('  3. RPC connection is working');
    process.exit(1);
  }

  // Step 2: Run tests for each DEX, pair, and scenario
  console.log('\n🧪 STEP 2: Running Price Movement Tests\n');

  for (const dex of TEST_CONFIG.dexes) {
    console.log(`\n${'━'.repeat(80)}`);
    console.log(`🔄 Testing ${dex.toUpperCase()}`);
    console.log(`${'━'.repeat(80)}\n`);

    // Get pairs available for this DEX
    const availablePairs = TEST_CONFIG.pairsByDex[dex] || TEST_CONFIG.pairs;
    
    for (const pair of availablePairs) {
      // Skip pairs with placeholder addresses
      if (pair.includes('MATIC') || pair.includes('DAI')) {
        console.log(`⏭️  Skipping ${pair} (not configured)\n`);
        continue;
      }

      console.log(`\n  📈 Testing pair: ${pair}\n`);

      for (const scenario of TEST_CONFIG.scenarios) {
        const testName = `${dex}-${pair}-${scenario}`;
        const command = `HARDHAT_NETWORK=testnet node scripts/price-mover.js ${dex} ${pair} ${scenario}`;

        results.summary.total++;

        const result = runCommand(
          command,
          `${dex.toUpperCase()} | ${pair} | ${scenario}`
        );

        const testResult = {
          dex,
          pair,
          scenario,
          success: result.success,
          duration: result.duration,
          output: result.output,
          error: result.error,
          timestamp: new Date().toISOString()
        };

        results.tests.push(testResult);

        if (result.success) {
          results.summary.passed++;
        } else {
          results.summary.failed++;
        }

        // Small delay between tests
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
  }

  // Step 3: Test both DEXs simultaneously
  console.log('\n🔀 STEP 3: Testing Both DEXs Simultaneously\n');

  const simultaneousTests = [
    { pair: 'WETH/USDC', scenario: 'small-up' },
    { pair: 'WETH/USDC', scenario: 'volatility' },
    { pair: 'WETH/USDC', scenario: 'out-of-range-up' }
  ];

  for (const test of simultaneousTests) {
    results.summary.total++;

    const result = runCommand(
      `HARDHAT_NETWORK=testnet node scripts/price-mover.js both ${test.pair} ${test.scenario}`,
      `BOTH DEXs | ${test.pair} | ${test.scenario}`
    );

    results.tests.push({
      dex: 'both',
      pair: test.pair,
      scenario: test.scenario,
      success: result.success,
      duration: result.duration,
      output: result.output,
      error: result.error,
      timestamp: new Date().toISOString()
    });

    if (result.success) {
      results.summary.passed++;
    } else {
      results.summary.failed++;
    }

    await new Promise(resolve => setTimeout(resolve, 2000));
  }

  // Finalize results
  results.endTime = new Date().toISOString();

  // Step 4: Generate report
  console.log('\n📊 STEP 4: Generating Test Report\n');
  saveResults();

  // Print summary
  console.log(`
╔═══════════════════════════════════════════════════════════════════════════╗
║                           TEST EXECUTION COMPLETE                         ║
╚═══════════════════════════════════════════════════════════════════════════╝

📊 SUMMARY:
  Total Tests:   ${results.summary.total}
  ✅ Passed:      ${results.summary.passed}
  ❌ Failed:      ${results.summary.failed}
  ⏭️  Skipped:     ${results.summary.skipped}
  📈 Success Rate: ${results.summary.total > 0 ? ((results.summary.passed / results.summary.total) * 100).toFixed(2) : 0}%
  ⏱️  Duration:    ${((new Date(results.endTime) - new Date(results.startTime)) / 1000 / 60).toFixed(2)} minutes

Check the test-results/ directory for detailed reports.
  `);

  if (results.summary.failed > 0) {
    console.log('⚠️  Some tests failed. Review the report for details.');
    process.exit(1);
  } else {
    console.log('✅ All tests passed successfully!');
    process.exit(0);
  }
}

// Handle errors
process.on('unhandledRejection', (error) => {
  console.error('\n❌ Unhandled error:', error);
  results.endTime = new Date().toISOString();
  saveResults();
  process.exit(1);
});

process.on('SIGINT', () => {
  console.log('\n\n⚠️  Test execution interrupted by user');
  results.endTime = new Date().toISOString();
  saveResults();
  process.exit(1);
});

// Run tests
runTests().catch(error => {
  console.error('\n❌ Test execution failed:', error);
  results.endTime = new Date().toISOString();
  saveResults();
  process.exit(1);
});
