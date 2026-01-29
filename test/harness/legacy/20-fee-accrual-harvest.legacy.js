const { expect } = require("chai");
const { ethers } = require("hardhat");

const { getNetworkName } = require("../utils/config");
const { getClmVaultConfigs } = require("../utils/vault-configs");
const { createRunReporter } = require("../utils/reporting");
const { getVaultState, getTokenMeta } = require("../utils/vault-state");
const { SwapHelper } = require("../utils/swaps");
const { VAULT_MIN_ABI, STRATEGY_MIN_ABI } = require("../utils/abis");

const { getSharePrice } = require("../../scripts/utils/share-math");

const POOL_FEE_ABI = [
  // UniV3 / Algebra commonly expose these (some Algebra deployments don’t)
  "function feeGrowthGlobal0X128() view returns (uint256)",
  "function feeGrowthGlobal1X128() view returns (uint256)",
  // UniV3-style position storage (also present in several Algebra forks)
  "function positions(bytes32 key) view returns (uint128 liquidity, uint256 feeGrowthInside0LastX128, uint256 feeGrowthInside1LastX128, uint128 tokensOwed0, uint128 tokensOwed1)"
];

function isRetryableRpcError(e) {
  const msg = String(e?.message || "");
  return (
    msg.includes("Too Many Requests") ||
    msg.includes("could not detect network") ||
    msg.includes("noNetwork") ||
    msg.includes("NETWORK_ERROR")
  );
}

async function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function withRetries(label, fn, { retries = 5, baseDelayMs = 1500 } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      return await fn();
    } catch (e) {
      lastErr = e;

      // Don't retry if the swap helper already has a tx hash: rerunning could double-swap.
      const txHash = e?.details?.txHash || e?.transactionHash || e?.hash;
      if (txHash) throw e;

      if (!isRetryableRpcError(e) || attempt === retries) throw e;

      const backoff = Math.min(15000, baseDelayMs * Math.pow(2, attempt));
      const jitter = Math.floor(Math.random() * 250);
      // eslint-disable-next-line no-console
      console.log(`    [retry] ${label} attempt ${attempt + 1}/${retries + 1} in ${backoff + jitter}ms`);
      await sleep(backoff + jitter);
    }
  }
  throw lastErr;
}

function baseAmountForSymbol(symbol, size) {
  const isStable = symbol === "USDC" || symbol === "USDT" || symbol === "mUSD";
  if (isStable) return size === "large" ? "10" : "1";
  return size === "large" ? "0.1" : "0.01";
}

async function parseAmount(signer, tokenAddress, tokenSymbol, amountHuman) {
  const meta = await getTokenMeta(signer, tokenAddress, tokenSymbol);
  return ethers.utils.parseUnits(String(amountHuman), meta.decimals);
}

async function tryCall(contract, fragment, args = []) {
  try {
    const res = await contract[fragment](...args);
    return { ok: true, value: res };
  } catch (e) {
    return { ok: false, error: e };
  }
}

async function readMaybeBn(contract, fragment) {
  const r = await tryCall(contract, fragment, []);
  if (!r.ok) return null;
  return r.value;
}

async function readMaybePair(contract, fragment) {
  const r = await tryCall(contract, fragment, []);
  if (!r.ok) return null;
  if (Array.isArray(r.value)) return r.value;
  // ethers may return object-like too
  return [r.value[0], r.value[1]];
}

function bnOrZero(x) {
  return x ? x : ethers.BigNumber.from(0);
}

function sumBn(a, b) {
  return bnOrZero(a).add(bnOrZero(b));
}

function bnEq(a, b) {
  return bnOrZero(a).eq(bnOrZero(b));
}

async function readFeeSnapshot({ signer, vaultConfig }) {
  return withRetries(
    `snapshot:${vaultConfig.name}`,
    async () => {
      const provider = signer.provider;

      const vault = new ethers.Contract(vaultConfig.vault, VAULT_MIN_ABI, signer);

      const state = await getVaultState(signer, vaultConfig);

      const strategy = state.strategyAddress
        ? new ethers.Contract(state.strategyAddress, STRATEGY_MIN_ABI, signer)
        : null;

      const pool = new ethers.Contract(vaultConfig.pool, POOL_FEE_ABI, provider);

      const totalSupply = await vault.totalSupply().catch(() => null);
      const vaultBalances = await vault.balances().catch(() => null);

      const ppfs = await getSharePrice(vault).catch(() => null);

      // Strategy fee getters (optional)
      const strategyFees0 = strategy ? await readMaybeBn(strategy, "fees0") : null;
      const strategyFees1 = strategy ? await readMaybeBn(strategy, "fees1") : null;
      const strategyUnclaimed0 = strategy ? await readMaybeBn(strategy, "unclaimedFees0") : null;
      const strategyUnclaimed1 = strategy ? await readMaybeBn(strategy, "unclaimedFees1") : null;
      const strategyAccum = strategy ? await readMaybePair(strategy, "accumulatedFees") : null;
      const lastHarvest = strategy ? await readMaybeBn(strategy, "lastHarvest") : null;

      // Pool fee growth (optional)
      const feeGrowth0 = await readMaybeBn(pool, "feeGrowthGlobal0X128");
      const feeGrowth1 = await readMaybeBn(pool, "feeGrowthGlobal1X128");

      // Pool position accounting (optional)
      let position = null;
      if (state.strategyAddress && state.tickLower !== null && state.tickUpper !== null) {
        try {
          const key = ethers.utils.solidityKeccak256(
            ["address", "int24", "int24"],
            [state.strategyAddress, state.tickLower, state.tickUpper]
          );
          const pos = await pool.positions(key);
          position = {
            liquidity: pos.liquidity,
            tokensOwed0: pos.tokensOwed0,
            tokensOwed1: pos.tokensOwed1,
            feeGrowthInside0LastX128: pos.feeGrowthInside0LastX128,
            feeGrowthInside1LastX128: pos.feeGrowthInside1LastX128
          };
        } catch {
          position = null;
        }
      }

      return {
        ts: Date.now(),
        inRange: state.inRange,
        tick: state.pool?.ok ? state.pool.tick : null,
        tickLower: state.tickLower,
        tickUpper: state.tickUpper,
        strategyAddress: state.strategyAddress,
        totalSupply,
        vaultBalances,
        ppfs,
        strategyFees0,
        strategyFees1,
        strategyUnclaimed0,
        strategyUnclaimed1,
        strategyAccum,
        lastHarvest,
        feeGrowth0,
        feeGrowth1,
        position
      };
    },
    { retries: 5, baseDelayMs: 1500 }
  );
}

async function driveVolume({ swapHelper, signer, vaultConfig, rounds, size, direction }) {
  const tokenIn0 = direction === "up" ? vaultConfig.token0 : vaultConfig.token1;
  const tokenOut0 = direction === "up" ? vaultConfig.token1 : vaultConfig.token0;
  const symbolIn0 = direction === "up" ? vaultConfig.token0Symbol : vaultConfig.token1Symbol;
  const symbolIn1 = direction === "up" ? vaultConfig.token1Symbol : vaultConfig.token0Symbol;

  const amountHuman0 = baseAmountForSymbol(symbolIn0, size);
  const amountIn0 = await parseAmount(signer, tokenIn0, symbolIn0, amountHuman0);

  const amountHuman1 = baseAmountForSymbol(symbolIn1, size);
  const amountIn1 = await parseAmount(signer, tokenOut0, symbolIn1, amountHuman1);

  const before = await withRetries(`getVaultState:${vaultConfig.name}:driveVolume`, () => getVaultState(signer, vaultConfig), {
    retries: 5,
    baseDelayMs: 1500
  });
  const balance0 = before.user.token0Balance;
  const balance1 = before.user.token1Balance;

  const hasLeg0 = (direction === "up" ? balance0 : balance1).gte(amountIn0);
  const hasLeg1 = (direction === "up" ? balance1 : balance0).gte(amountIn1);

  if (!hasLeg0 || !hasLeg1) {
    const why = !hasLeg0
      ? `insufficient ${symbolIn0} for volume (${amountHuman0})`
      : `insufficient ${symbolIn1} for volume (${amountHuman1})`;
    return { ok: false, skipped: true, note: why };
  }

  let lastTx = null;
  for (let i = 0; i < rounds; i++) {
    const even = i % 2 === 0;
    const tokenIn = even ? tokenIn0 : tokenOut0;
    const tokenOut = even ? tokenOut0 : tokenIn0;

    const symbolIn = even ? symbolIn0 : (direction === "up" ? vaultConfig.token1Symbol : vaultConfig.token0Symbol);
    const amountHuman = baseAmountForSymbol(symbolIn, size);
    const amountIn = await parseAmount(signer, tokenIn, symbolIn, amountHuman);

    const swapResult = await withRetries(
      `swap:${vaultConfig.name}:${i + 1}/${rounds}`,
      () =>
        swapHelper.swap({
          dex: vaultConfig.dex,
          tokenIn,
          tokenOut,
          amountIn,
          feeTier: vaultConfig.feeTier,
          options: { slippageBps: 100 }
        }),
      { retries: 6, baseDelayMs: 2000 }
    );
    lastTx = swapResult.txHash;

    await new Promise((r) => setTimeout(r, 3500));
  }

  return { ok: true, lastTx, note: `rounds=${rounds} size=${size} dir=${direction}` };
}

async function pushOutOfRange({ swapHelper, signer, vaultConfig, maxAttempts = 6, direction = "up" }) {
  const tokenIn = direction === "up" ? vaultConfig.token0 : vaultConfig.token1;
  const tokenOut = direction === "up" ? vaultConfig.token1 : vaultConfig.token0;
  const symbolIn = direction === "up" ? vaultConfig.token0Symbol : vaultConfig.token1Symbol;

  const before = await withRetries(`getVaultState:${vaultConfig.name}:pushOutOfRange:before`, () => getVaultState(signer, vaultConfig), {
    retries: 5,
    baseDelayMs: 1500
  });
  if (before.inRange !== true) {
    return { ok: true, alreadyOutOfRange: true, note: `already out-of-range (inRange=${before.inRange})` };
  }

  // Exponentially increase notional until inRange flips false.
  const baseHuman = baseAmountForSymbol(symbolIn, "small");
  const balanceIn = direction === "up" ? before.user.token0Balance : before.user.token1Balance;

  let lastTx = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const scaledHuman = String(Number(baseHuman) * Math.pow(10, attempt));
    const scaled = await parseAmount(signer, tokenIn, symbolIn, scaledHuman);

    if (balanceIn.lt(scaled)) break;

    const swapResult = await withRetries(
      `pushOutOfRange:${vaultConfig.name}:${attempt + 1}/${maxAttempts}`,
      () =>
        swapHelper.swap({
          dex: vaultConfig.dex,
          tokenIn,
          tokenOut,
          amountIn: scaled,
          feeTier: vaultConfig.feeTier,
          options: { slippageBps: 150 }
        }),
      { retries: 6, baseDelayMs: 2500 }
    );
    lastTx = swapResult.txHash;

    await new Promise((r) => setTimeout(r, 3500));
    const after = await withRetries(`getVaultState:${vaultConfig.name}:pushOutOfRange:after`, () => getVaultState(signer, vaultConfig), {
      retries: 5,
      baseDelayMs: 1500
    });

    if (after.inRange === false) {
      return {
        ok: true,
        alreadyOutOfRange: false,
        lastTx,
        attempts: attempt + 1,
        note: `pushed out-of-range in ${attempt + 1} swaps (dir=${direction})`
      };
    }
  }

  return { ok: false, note: `failed to push out-of-range (dir=${direction})`, lastTx };
}

describe("Fee accrual + harvest/compounding validation", function () {
  this.timeout(20 * 60 * 1000);

  let signer;
  let swapHelper;

  const reporter = createRunReporter({ suite: "fee-accrual-harvest", network: getNetworkName() });

  before(async function () {
    [signer] = await ethers.getSigners();
    swapHelper = new SwapHelper(signer, { debug: false, slippageBps: 100 });
  });

  after(function () {
    reporter.finalize({ filePrefix: "fee-accrual-harvest" });
  });

  const vaults = getClmVaultConfigs();
  if (!vaults.length) {
    it("has vault configs", function () {
      expect(vaults.length).to.be.gt(0);
    });
    return;
  }

  for (const vaultConfig of vaults) {
    describe(`Vault: ${vaultConfig.name}`, function () {
      // Fail fast: run the most extreme fee behavior test first.

      async function runOutOfRangeFees(ctx) {
        const before = await readFeeSnapshot({ signer, vaultConfig });

        const pushed = await pushOutOfRange({
          swapHelper,
          signer,
          vaultConfig,
          direction: "up"
        });

        if (!pushed.ok) {
          reporter.recordScenario(vaultConfig.name, "out-of-range-fees", {
            skipped: true,
            success: false,
            note: pushed.note,
            vaultMeta: { address: vaultConfig.vault, dex: vaultConfig.dex }
          });
          ctx.skip();
        }

        const afterPush = await readFeeSnapshot({ signer, vaultConfig });
        if (afterPush.inRange !== false) {
          reporter.recordScenario(vaultConfig.name, "out-of-range-fees", {
            skipped: true,
            success: false,
            note: `could not confirm out-of-range (inRange=${afterPush.inRange})`,
            vaultMeta: { address: vaultConfig.vault, dex: vaultConfig.dex }
          });
          ctx.skip();
        }

        // Generate volume while staying out-of-range (same direction swaps).
        const tokenIn = vaultConfig.token0;
        const tokenOut = vaultConfig.token1;
        const symbolIn = vaultConfig.token0Symbol;

        const amountHuman = baseAmountForSymbol(symbolIn, "small");
        const amountIn = await parseAmount(signer, tokenIn, symbolIn, amountHuman);

        const stateForBal = await withRetries(`getVaultState:${vaultConfig.name}:outOfRangeVolume`, () => getVaultState(signer, vaultConfig), {
          retries: 5,
          baseDelayMs: 1500
        });
        if (stateForBal.user.token0Balance.lt(amountIn)) {
          reporter.recordScenario(vaultConfig.name, "out-of-range-fees", {
            skipped: true,
            success: false,
            note: `insufficient ${symbolIn} to drive out-of-range volume`,
            vaultMeta: { address: vaultConfig.vault, dex: vaultConfig.dex }
          });
          ctx.skip();
        }

        for (let i = 0; i < 4; i++) {
          await withRetries(
            `swapOutOfRange:${vaultConfig.name}:${i + 1}/4`,
            () =>
              swapHelper.swap({
                dex: vaultConfig.dex,
                tokenIn,
                tokenOut,
                amountIn,
                feeTier: vaultConfig.feeTier,
                options: { slippageBps: 150 }
              }),
            { retries: 6, baseDelayMs: 2500 }
          );
          await new Promise((r) => setTimeout(r, 3500));
        }

        const afterVol = await readFeeSnapshot({ signer, vaultConfig });

        // DEX-level fee growth may still rise, but position/strategy fees should not.
        const posOwedBefore = before.position ? sumBn(before.position.tokensOwed0, before.position.tokensOwed1) : null;
        const posOwedAfter = afterVol.position ? sumBn(afterVol.position.tokensOwed0, afterVol.position.tokensOwed1) : null;

        const stratUnclaimedBefore = sumBn(before.strategyUnclaimed0, before.strategyUnclaimed1);
        const stratUnclaimedAfter = sumBn(afterVol.strategyUnclaimed0, afterVol.strategyUnclaimed1);

        const stratFeesBefore = sumBn(before.strategyFees0, before.strategyFees1);
        const stratFeesAfter = sumBn(afterVol.strategyFees0, afterVol.strategyFees1);

        // Only assert "no accrual" when we have a measurable counter.
        const canCheckStrategy =
          before.strategyUnclaimed0 !== null ||
          before.strategyUnclaimed1 !== null ||
          before.strategyFees0 !== null ||
          before.strategyFees1 !== null;

        const canCheckPosition = posOwedBefore !== null && posOwedAfter !== null;

        if (canCheckPosition) {
          expect(posOwedAfter.lte(posOwedBefore), "position tokensOwed increased while out-of-range").to.equal(true);
        } else if (canCheckStrategy) {
          const noIncrease = stratUnclaimedAfter.lte(stratUnclaimedBefore) && stratFeesAfter.lte(stratFeesBefore);
          expect(noIncrease, "strategy fee counters increased while out-of-range").to.equal(true);
        } else {
          // If we can’t read any counters, we can only record the state.
          ctx.skip();
        }

        reporter.recordScenario(vaultConfig.name, "out-of-range-fees", {
          success: true,
          note: pushed.note,
          vaultMeta: { address: vaultConfig.vault, dex: vaultConfig.dex },
          details: {
            inRangeAfterPush: afterPush.inRange,
            inRangeAfterVol: afterVol.inRange,
            tickAfterPush: afterPush.tick,
            tickAfterVol: afterVol.tick,
            posOwedBefore: posOwedBefore ? posOwedBefore.toString() : null,
            posOwedAfter: posOwedAfter ? posOwedAfter.toString() : null,
            stratUnclaimedBefore: stratUnclaimedBefore.toString(),
            stratUnclaimedAfter: stratUnclaimedAfter.toString(),
            stratFeesBefore: stratFeesBefore.toString(),
            stratFeesAfter: stratFeesAfter.toString()
          }
        });

      }

      async function runInRangeHarvest(ctx) {
        const before = await readFeeSnapshot({ signer, vaultConfig });

        // Always generate DEX volume (this also acts as a pool liveness check)
        const volume = await driveVolume({
          swapHelper,
          signer,
          vaultConfig,
          rounds: 4,
          size: "small",
          direction: "up"
        });

        if (!volume.ok && volume.skipped) {
          reporter.recordScenario(vaultConfig.name, "in-range+harvest", {
            skipped: true,
            success: false,
            note: volume.note,
            vaultMeta: { address: vaultConfig.vault, dex: vaultConfig.dex }
          });
          ctx.skip();
        }

        const afterSwaps = await readFeeSnapshot({ signer, vaultConfig });

        // (a) Prove volume/fee growth happened at the DEX level.
        // If feeGrowth is readable, it should increase after swaps.
        if (before.feeGrowth0 && afterSwaps.feeGrowth0) {
          expect(afterSwaps.feeGrowth0.gt(before.feeGrowth0), "feeGrowthGlobal0 did not increase").to.equal(true);
        }
        if (before.feeGrowth1 && afterSwaps.feeGrowth1) {
          expect(afterSwaps.feeGrowth1.gt(before.feeGrowth1), "feeGrowthGlobal1 did not increase").to.equal(true);
        }

        // If strategy exposes fee counters, expect them to move when we are in-range.
        const strategyFeeBefore = sumBn(before.strategyFees0, before.strategyFees1);
        const strategyFeeAfter = sumBn(afterSwaps.strategyFees0, afterSwaps.strategyFees1);
        const strategyUnclaimedBefore = sumBn(before.strategyUnclaimed0, before.strategyUnclaimed1);
        const strategyUnclaimedAfter = sumBn(afterSwaps.strategyUnclaimed0, afterSwaps.strategyUnclaimed1);

        const canAssertInRange = before.inRange === true && afterSwaps.inRange === true;
        const hasStrategyFeeCounters =
          before.strategyFees0 !== null ||
          before.strategyFees1 !== null ||
          before.strategyUnclaimed0 !== null ||
          before.strategyUnclaimed1 !== null;

        if (canAssertInRange && hasStrategyFeeCounters) {
          const moved = strategyFeeAfter.gt(strategyFeeBefore) || strategyUnclaimedAfter.gt(strategyUnclaimedBefore);
          expect(moved, "strategy fee counters did not increase while in-range").to.equal(true);
        }

        // (b) Harvest, if callable by our wallet.
        let harvestAttempted = false;
        let harvestOk = false;
        let harvestTx = null;
        if (afterSwaps.strategyAddress) {
          const strategy = new ethers.Contract(afterSwaps.strategyAddress, STRATEGY_MIN_ABI, signer);
          harvestAttempted = true;
          try {
            const tx = await strategy.harvest({ gasLimit: 1_200_000 });
            const receipt = await tx.wait();
            harvestOk = true;
            harvestTx = receipt.transactionHash;
            await new Promise((r) => setTimeout(r, 3000));
          } catch (e) {
            // If harvest isn't callable by our signer, we still report fee accrual evidence.
            harvestOk = false;
          }
        }

        const afterHarvest = await readFeeSnapshot({ signer, vaultConfig });

        // Harvest validations are conditional: only enforce when harvest succeeds.
        if (harvestOk) {
          // PPFS should usually not decrease after harvesting fees (but may be flat).
          if (before.ppfs?.raw && afterHarvest.ppfs?.raw) {
            expect(
              afterHarvest.ppfs.raw.gte(before.ppfs.raw),
              "PPFS decreased after harvest"
            ).to.equal(true);
          }

          // Strategy-side unclaimed fees often drop after harvest, or fee counters shift.
          const unclaimedDropped = strategyUnclaimedAfter.gt(0) && sumBn(afterHarvest.strategyUnclaimed0, afterHarvest.strategyUnclaimed1).lte(strategyUnclaimedAfter);
          const feesShifted = !bnEq(sumBn(afterHarvest.strategyFees0, afterHarvest.strategyFees1), strategyFeeAfter);

          // Accept either: unclaimed decreased OR counters changed OR vault balances changed.
          const vaultBalancesChanged =
            before.vaultBalances &&
            afterHarvest.vaultBalances &&
            (!before.vaultBalances.amount0.eq(afterHarvest.vaultBalances.amount0) || !before.vaultBalances.amount1.eq(afterHarvest.vaultBalances.amount1));

          expect(unclaimedDropped || feesShifted || vaultBalancesChanged, "harvest succeeded but no observable accounting change").to.equal(true);
        }

        // (c) Accounting consistency: harvest/swaps should not change supply or user shares.
        if (before.totalSupply && afterHarvest.totalSupply) {
          expect(afterHarvest.totalSupply.eq(before.totalSupply), "totalSupply changed during swaps/harvest").to.equal(true);
        }

        reporter.recordScenario(vaultConfig.name, "in-range+harvest", {
          success: true,
          note: `volume=${volume.note} harvestAttempted=${harvestAttempted} harvestOk=${harvestOk} tx=${harvestTx || volume.lastTx || ""}`,
          vaultMeta: { address: vaultConfig.vault, dex: vaultConfig.dex },
          details: {
            inRangeBefore: before.inRange,
            inRangeAfterSwaps: afterSwaps.inRange,
            feeGrowth0Before: before.feeGrowth0 ? before.feeGrowth0.toString() : null,
            feeGrowth0After: afterSwaps.feeGrowth0 ? afterSwaps.feeGrowth0.toString() : null,
            feeGrowth1Before: before.feeGrowth1 ? before.feeGrowth1.toString() : null,
            feeGrowth1After: afterSwaps.feeGrowth1 ? afterSwaps.feeGrowth1.toString() : null,
            strategyFeesBefore: strategyFeeBefore.toString(),
            strategyFeesAfter: strategyFeeAfter.toString(),
            strategyUnclaimedBefore: strategyUnclaimedBefore.toString(),
            strategyUnclaimedAfter: strategyUnclaimedAfter.toString(),
            ppfsBefore: before.ppfs?.formatted ?? null,
            ppfsAfterHarvest: afterHarvest.ppfs?.formatted ?? null,
            harvestTx
          }
        });
      }

      it("fees stop (or slow) accruing when fully out-of-range (if expected)", async function () {
        await runOutOfRangeFees(this);
      });

      it("accrues fees with swaps (in-range when possible) and harvest changes accounting", async function () {
        await runInRangeHarvest(this);
      });
    });
  }
});
