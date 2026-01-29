const { expect } = require("chai");
const { ethers } = require("hardhat");

const { getNetworkName } = require("../utils/config");
const { getClmVaultConfigs } = require("../utils/vault-configs");
const { createRunReporter } = require("../utils/reporting");
const { getVaultState, getTokenMeta } = require("../utils/vault-state");
const { SwapHelper } = require("../utils/swaps");
const { STRATEGY_MIN_ABI } = require("../utils/abis");
const { withRetry, sleep, isTransientRpcError } = require("../utils/retry");
const { waitForNoPendingTransactions } = require("../utils/tx");
const { usingRemoteNetwork, getTestnetSigner } = require("../utils/testnet-signer");

function baseAmountForSymbol(symbol, size) {
  const isStable = symbol === "USDC" || symbol === "USDT" || symbol === "mUSD";
  // Prefer fewer swaps with larger notionals to reliably move tick while reducing RPC churn.
  if (isStable) return size === "large" ? "100" : "10";
  // wOM and anything else: smaller notionals
  return size === "large" ? "1" : "0.1";
}

async function parseAmount(signer, tokenAddress, tokenSymbol, amountHuman) {
  const meta = await getTokenMeta(signer, tokenAddress, tokenSymbol);
  return ethers.utils.parseUnits(String(amountHuman), meta.decimals);
}

describe("CLM vault scenarios (tick move + optional rebalance)", function () {
  this.timeout(15 * 60 * 1000);

  function poolPriceChanged(a, b) {
    if (!a || !b) return false;
    const sa = a.sqrtPriceX96;
    const sb = b.sqrtPriceX96;
    if (sa === null || sa === undefined) return false;
    if (sb === null || sb === undefined) return false;

    // Handle BigNumber (Ethers v5) and other scalar-ish representations.
    if (ethers.BigNumber.isBigNumber(sa) && ethers.BigNumber.isBigNumber(sb)) return !sa.eq(sb);
    return String(sa) !== String(sb);
  }

  let signer;
  let swapHelper;

  const reporter = createRunReporter({ suite: "clm-vault-scenarios", network: getNetworkName() });

  before(async function () {
    if (usingRemoteNetwork()) {
      ({ signer } = getTestnetSigner());
    } else {
      [signer] = await withRetry(() => ethers.getSigners(), { retries: 8, minDelayMs: 750, maxDelayMs: 15000, shouldRetry: isTransientRpcError });
    }
    await waitForNoPendingTransactions(signer, { timeoutMs: 90000, pollMs: 5000 });
    swapHelper = new SwapHelper(signer, { debug: false, slippageBps: 100 });
  });

  afterEach(async function () {
    // Small pacing to avoid 429s on shared RPC.
    await sleep(1500);
  });

  after(function () {
    reporter.finalize({ filePrefix: "clm-vault-scenarios" });
  });

  const vaults = getClmVaultConfigs();
  if (!vaults.length) {
    it("has vault configs", function () {
      expect(vaults.length).to.be.gt(0);
    });
    return;
  }

  // Fail fast: run the most extreme moves first.
  const scenarios = [
    { name: "large-up", dir: "up", size: "large" },
    { name: "large-down", dir: "down", size: "large" },
    { name: "small-up", dir: "up", size: "small" },
    { name: "small-down", dir: "down", size: "small" }
  ];

  for (const vaultConfig of vaults) {
    describe(`Vault: ${vaultConfig.name}`, function () {
      for (const s of scenarios) {
        it(`${s.name} (swap + tick move)`, async function () {
          const tokenIn = s.dir === "up" ? vaultConfig.token0 : vaultConfig.token1;
          const tokenOut = s.dir === "up" ? vaultConfig.token1 : vaultConfig.token0;
          const symbolIn = s.dir === "up" ? vaultConfig.token0Symbol : vaultConfig.token1Symbol;
          const symbolOut = s.dir === "up" ? vaultConfig.token1Symbol : vaultConfig.token0Symbol;

          const amountHuman = baseAmountForSymbol(symbolIn, s.size);
          let lastTx = null;

          try {
            const amountIn = await parseAmount(signer, tokenIn, symbolIn, amountHuman);

            // light pacing to reduce rate limiting
            await sleep(250);
            const before = await getVaultState(signer, vaultConfig);

          // Preflight: ensure balance
          const balanceIn = s.dir === "up" ? before.user.token0Balance : before.user.token1Balance;
          if (balanceIn.lt(amountIn)) {
            reporter.recordScenario(vaultConfig.name, s.name, {
              skipped: true,
              success: false,
              note: `insufficient ${symbolIn} for amount=${amountHuman}`,
              vaultMeta: { address: vaultConfig.vault }
            });
            this.skip();
          }

            // Attempt up to 2 times to move price/tick.
            let after = null;
            let moved = false;
            let tickMoved = false;
            let priceMoved = false;
            for (let attempt = 0; attempt < 2; attempt++) {
            const scaledHuman = attempt === 0 ? amountHuman : String(Number(amountHuman) * 2);
            const scaled = await parseAmount(signer, tokenIn, symbolIn, scaledHuman);

            if (balanceIn.lt(scaled)) break;

            const swapResult = await withRetry(
              () => swapHelper.swap({
                dex: vaultConfig.dex,
                tokenIn,
                tokenOut,
                amountIn: scaled,
                feeTier: vaultConfig.feeTier,
                options: { slippageBps: 100 }
              }),
              { retries: 6, minDelayMs: 1000, maxDelayMs: 20000, shouldRetry: isTransientRpcError }
            );
              lastTx = swapResult.txHash;

              await sleep(3000);
              after = await getVaultState(signer, vaultConfig);

            if (before.pool.ok && after.pool.ok) {
              tickMoved = before.pool.tick !== after.pool.tick;
              priceMoved = poolPriceChanged(before.pool, after.pool);
              moved = tickMoved || priceMoved;
              if (moved) break;
            }
          }

            // Optional rebalance attempt if moved out-of-range.
            let rebalanceAttempted = false;
            let rebalanceTx = null;
            let afterRebalance = null;

            const movedOutOfRange = before.inRange === true && after?.inRange === false;
            if (movedOutOfRange && after?.strategyAddress) {
              rebalanceAttempted = true;
              try {
                const strategy = new ethers.Contract(after.strategyAddress, STRATEGY_MIN_ABI, signer);
                const tx = await withRetry(
                  () => strategy.rebalance({ gasLimit: 800000 }),
                  { retries: 5, minDelayMs: 1000, maxDelayMs: 20000, shouldRetry: isTransientRpcError }
                );
                const receipt = await tx.wait();
                rebalanceTx = receipt.transactionHash;
                await sleep(3000);
                afterRebalance = await getVaultState(signer, vaultConfig);
              } catch (e) {
                reporter.addDiagnostic({
                  kind: "rebalance_failed",
                  vault: vaultConfig.name,
                  scenario: s.name,
                  error: String(e.message).slice(0, 200)
                });
              }
            }

          // Assertions: the swap should have moved the pool price when pool reads are available.
          // Note: price can move within the same tick, so tick may not change.
          if (before.pool.ok && after?.pool?.ok) {
            expect(moved, "price/tick did not move; swap may be ineffective").to.equal(true);
          }

          // If rebalance tx succeeded, range should change OR in-range should improve.
          if (rebalanceTx && afterRebalance) {
            const rangeChanged =
              afterRebalance.tickLower !== after.tickLower ||
              afterRebalance.tickUpper !== after.tickUpper;
            const inRangeImproved = after.inRange === false && afterRebalance.inRange === true;
            expect(rangeChanged || inRangeImproved, "rebalance succeeded but range/inRange did not improve").to.equal(true);
          }

            reporter.recordScenario(vaultConfig.name, s.name, {
              success: true,
              note: `swap=${symbolIn}->${symbolOut} amount=${amountHuman} tx=${lastTx || ""}`,
              vaultMeta: { address: vaultConfig.vault, dex: vaultConfig.dex },
              details: {
                tickBefore: before.pool.ok ? before.pool.tick : null,
                tickAfter: after?.pool?.ok ? after.pool.tick : null,
                sqrtPriceX96Before: before.pool.ok && before.pool.sqrtPriceX96 ? before.pool.sqrtPriceX96.toString() : null,
                sqrtPriceX96After: after?.pool?.ok && after.pool.sqrtPriceX96 ? after.pool.sqrtPriceX96.toString() : null,
                tickMoved,
                priceMoved,
                inRangeBefore: before.inRange,
                inRangeAfter: after?.inRange,
                rebalanceAttempted,
                rebalanceTx,
                inRangeAfterRebalance: afterRebalance?.inRange ?? null
              }
            });
          } catch (e) {
            if (e && e.pending === true) throw e;
            reporter.recordScenario(vaultConfig.name, s.name, {
              success: false,
              note: `swap=${symbolIn}->${symbolOut} amount=${amountHuman} tx=${lastTx || ""}`,
              error: String(e.message).slice(0, 200),
              vaultMeta: { address: vaultConfig.vault, dex: vaultConfig.dex }
            });
            throw e;
          }
        });
      }
    });
  }
});
