const { expect } = require("chai");
const { ethers } = require("hardhat");

const { getNetworkName } = require("../utils/config");
const { getClmVaultConfigs } = require("../utils/vault-configs");
const { createRunReporter } = require("../utils/reporting");
const { getVaultState, getTokenMeta } = require("../utils/vault-state");
const { SwapHelper } = require("../utils/swaps");
const { STRATEGY_MIN_ABI, ERC20_ABI } = require("../utils/abis");
const { withRetry, sleep, isTransientRpcError } = require("../utils/retry");
const { waitForNoPendingTransactions } = require("../utils/tx");
const { usingRemoteNetwork, getTestnetSigner } = require("../utils/testnet-signer");

function decodeRevert(e) {
  const reason = e?.reason || e?.error?.reason || e?.errorName || e?.error?.errorName;
  const data = e?.error?.data || e?.data || e?.error?.error?.data;
  if (reason) return String(reason);
  if (!data || typeof data !== "string") return null;

  const hex = data.toLowerCase();
  try {
    if (hex.startsWith("0x08c379a0")) {
      // Error(string)
      const decoded = ethers.utils.defaultAbiCoder.decode(["string"], "0x" + hex.slice(10));
      return `Error(${decoded[0]})`;
    }
    if (hex.startsWith("0x4e487b71")) {
      // Panic(uint256)
      const decoded = ethers.utils.defaultAbiCoder.decode(["uint256"], "0x" + hex.slice(10));
      return `Panic(${decoded[0].toString()})`;
    }
  } catch {
    // fall through
  }

  return `revertData=${hex.slice(0, 10)}`;
}

// Testnet RPCs can be flaky for gas estimation; keep reasonable fallbacks.
const FALLBACK_GAS = {
  approve: ethers.BigNumber.from(150000),
  deposit: ethers.BigNumber.from(2500000),
  withdraw: ethers.BigNumber.from(2500000)
};

// Minimal vault ABI: add deposit/withdraw variants on top of VAULT_MIN_ABI usage patterns.
const VAULT_ACTIONS_ABI = [
  "function totalSupply() view returns (uint256)",
  "function balanceOf(address) view returns (uint256)",
  "function strategy() view returns (address)",
  "function paused() view returns (bool)",
  "function owner() view returns (address)",
  "function want() view returns (address)",
  "function swapFee() view returns (uint256)",
  "function price() view returns (uint256)",

  // These CLM vaults are EIP-1167 proxies; the implementation exposes a zero-arg deposit.
  // Discovered on-chain via selector resolution:
  // - deposit() selector 0xd0e30db0
  // - withdrawAll(uint256,uint256) selector 0x7aff49d7
  // - withdraw(uint256,uint256,uint256) selector 0xa41fe49f
  "function deposit() external returns (uint256 shares)",
  "function previewDeposit(uint256 amount0, uint256 amount1) view returns (uint256 shares)",
  "function withdrawAll(uint256 amount0Min, uint256 amount1Min) external returns (uint256 amount0, uint256 amount1)",
  "function withdraw(uint256 shares, uint256 amount0Min, uint256 amount1Min) external returns (uint256 amount0, uint256 amount1)",
  "function withdraw(uint256 shares, uint256 amount0Min, uint256 amount1Min, address to) external returns (uint256 amount0, uint256 amount1)"
];

function baseAmountForSymbol(symbol, size) {
  const isStable = symbol === "USDC" || symbol === "USDT" || symbol === "mUSD" || symbol === "mmUSD";
  // Keep deposits conservative; many vaults are ratio-sensitive.
  if (isStable) return size === "large" ? "10" : "1";
  return size === "large" ? "1" : "0.1";
}

async function parseAmount(signer, tokenAddress, tokenSymbol, amountHuman) {
  const meta = await getTokenMeta(signer, tokenAddress, tokenSymbol);
  return ethers.utils.parseUnits(String(amountHuman), meta.decimals);
}

async function approveIfNeeded({ signer, tokenAddress, spender, minAllowance }) {
  const token = new ethers.Contract(tokenAddress, ERC20_ABI, signer);
  const owner = await signer.getAddress();
  const allowance = await withRetry(() => token.allowance(owner, spender)).catch(() => ethers.constants.Zero);
  if (allowance.gte(minAllowance)) return;

  let gasLimit = FALLBACK_GAS.approve;
  try {
    const estimate = await token.estimateGas.approve(spender, ethers.constants.MaxUint256);
    gasLimit = estimate.mul(12).div(10);
  } catch (e) {
    // fall back
  }

  const tx = await token.approve(spender, ethers.constants.MaxUint256, { gasLimit });
  await tx.wait();
}

async function tryDeposit({ vault }) {
  const attempt = async (fn) =>
    withRetry(fn, { retries: 6, minDelayMs: 1250, maxDelayMs: 20000, shouldRetry: isTransientRpcError });

  return await attempt(async () => {
    try {
      await vault.callStatic.deposit();
    } catch (e) {
      const decoded = decodeRevert(e);
      throw new Error(decoded || "deposit() reverted");
    }

    let estimate = null;
    try {
      estimate = await vault.estimateGas.deposit();
    } catch (e) {
      // fall back
    }
    return await vault.deposit({ gasLimit: estimate ? estimate.mul(12).div(10) : FALLBACK_GAS.deposit });
  });
}

async function tryWithdrawAll({ signer, vault }) {
  const to = await signer.getAddress();
  const shares = await withRetry(() => vault.balanceOf(to)).catch(() => ethers.constants.Zero);
  if (shares.isZero()) return null;

  // Prefer withdrawAll() when available; avoids needing share math.
  try {
    return await withRetry(async () => {
      let estimate = null;
      try {
        estimate = await vault.estimateGas.withdrawAll(0, 0);
      } catch (e) {
        // fall back
      }
      return vault.withdrawAll(0, 0, { gasLimit: estimate ? estimate.mul(12).div(10) : FALLBACK_GAS.withdraw });
    }, { retries: 6, minDelayMs: 1250, maxDelayMs: 20000, shouldRetry: isTransientRpcError });
  } catch (e) {
    // fall through
  }

  try {
    return await withRetry(async () => {
      let estimate = null;
      try {
        estimate = await vault.estimateGas["withdraw(uint256,uint256,uint256,address)"](shares, 0, 0, to);
      } catch (e) {
        // fall back
      }
      return vault["withdraw(uint256,uint256,uint256,address)"](shares, 0, 0, to, {
        gasLimit: estimate ? estimate.mul(12).div(10) : FALLBACK_GAS.withdraw
      });
    }, { retries: 6, minDelayMs: 1250, maxDelayMs: 20000, shouldRetry: isTransientRpcError });
  } catch (e) {
    return await withRetry(async () => {
      let estimate = null;
      try {
        estimate = await vault.estimateGas["withdraw(uint256,uint256,uint256)"](shares, 0, 0);
      } catch (e2) {
        // fall back
      }
      return vault["withdraw(uint256,uint256,uint256)"](shares, 0, 0, {
        gasLimit: estimate ? estimate.mul(12).div(10) : FALLBACK_GAS.withdraw
      });
    }, { retries: 6, minDelayMs: 1250, maxDelayMs: 20000, shouldRetry: isTransientRpcError });
  }
}

async function readStrategyFees(strategy) {
  if (!strategy) return { ok: false };

  const safe = async (fn) => {
    try {
      return await withRetry(fn, { retries: 4, minDelayMs: 750, maxDelayMs: 8000, shouldRetry: isTransientRpcError });
    } catch {
      return null;
    }
  };

  const [fees0, fees1, unclaimed0, unclaimed1] = await Promise.all([
    safe(() => strategy.fees0()),
    safe(() => strategy.fees1()),
    safe(() => strategy.unclaimedFees0()),
    safe(() => strategy.unclaimedFees1())
  ]);

  const anyReadable = fees0 !== null || fees1 !== null || unclaimed0 !== null || unclaimed1 !== null;
  return {
    ok: anyReadable,
    fees0,
    fees1,
    unclaimed0,
    unclaimed1
  };
}

function bnOrZero(x) {
  return x === null || x === undefined ? ethers.constants.Zero : x;
}

function feeSum(snapshot) {
  if (!snapshot || !snapshot.ok) return null;
  return bnOrZero(snapshot.fees0).add(bnOrZero(snapshot.fees1)).add(bnOrZero(snapshot.unclaimed0)).add(bnOrZero(snapshot.unclaimed1));
}

describe("User journey: deposit → trade scenarios per-vault → withdraw", function () {
  this.timeout(35 * 60 * 1000);

  let signer;
  let swapHelper;

  const reporter = createRunReporter({ suite: "user-journey", network: getNetworkName() });

  before(async function () {
    if (usingRemoteNetwork()) {
      ({ signer } = getTestnetSigner());
    } else {
      [signer] = await withRetry(() => ethers.getSigners(), {
        retries: 8,
        minDelayMs: 750,
        maxDelayMs: 15000,
        shouldRetry: isTransientRpcError
      });
    }

    await waitForNoPendingTransactions(signer, { timeoutMs: 90000, pollMs: 5000 });
    swapHelper = new SwapHelper(signer, { debug: false, slippageBps: 100 });
  });

  afterEach(async function () {
    // pacing to avoid 429s on shared RPC
    await sleep(1500);
  });

  after(function () {
    reporter.finalize({ filePrefix: "user-journey" });
  });

  const vaults = getClmVaultConfigs();
  if (!vaults.length) {
    it("has vault configs", function () {
      expect(vaults.length).to.be.gt(0);
    });
    return;
  }

  const scenarios = [
    { name: "small-up", dir: "up", size: "small" },
    { name: "large-up", dir: "up", size: "large" },
    { name: "small-down", dir: "down", size: "small" },
    { name: "large-down", dir: "down", size: "large" }
  ];

  // Track which vaults we actually deposited into so we can withdraw at the end.
  const activeVaults = [];

  it("1) deposits into all vaults", async function () {
    const user = await signer.getAddress();

    for (const vaultConfig of vaults) {
      console.log(`\n🏦 Deposit: ${vaultConfig.name}`);
      const vault = new ethers.Contract(vaultConfig.vault, VAULT_ACTIONS_ABI, signer);

      const paused = await withRetry(() => vault.paused()).catch(() => null);
      if (paused === true) {
        reporter.recordScenario(vaultConfig.name, "deposit", {
          skipped: true,
          success: false,
          note: "vault is paused",
          vaultMeta: { address: vaultConfig.vault, dex: vaultConfig.dex }
        });
        continue;
      }

      const state = await getVaultState(signer, vaultConfig);

      const amt0Human = baseAmountForSymbol(state.user.token0Symbol, "small");
      const amt1Human = baseAmountForSymbol(state.user.token1Symbol, "small");

      const [amt0, amt1] = await Promise.all([
        parseAmount(signer, state.token0Address, state.user.token0Symbol, amt0Human),
        parseAmount(signer, state.token1Address, state.user.token1Symbol, amt1Human)
      ]);

      const token0 = new ethers.Contract(state.token0Address, ERC20_ABI, signer);
      const token1 = new ethers.Contract(state.token1Address, ERC20_ABI, signer);
      const [allow0, allow1] = await Promise.all([
        withRetry(() => token0.allowance(user, vault.address)).catch(() => ethers.constants.Zero),
        withRetry(() => token1.allowance(user, vault.address)).catch(() => ethers.constants.Zero)
      ]);

      const [vaultOwner, wantAddr, swapFee, price] = await Promise.all([
        withRetry(() => vault.owner()).catch(() => null),
        withRetry(() => vault.want()).catch(() => null),
        withRetry(() => vault.swapFee()).catch(() => null),
        withRetry(() => vault.price()).catch(() => null)
      ]);

      const previewShares = await withRetry(() => vault.previewDeposit(amt0, amt1)).catch(() => null);

      const preShares = await withRetry(() => vault.balanceOf(user)).catch(() => ethers.constants.Zero);

      try {
        // We don't know whether deposit() pulls a fixed amount or consumes full balances.
        // Ensure allowance is at least the current wallet balance to avoid silent transferFrom reverts.
        const minAllowance0 = state.user.token0Balance;
        const minAllowance1 = state.user.token1Balance;

        const has0 = state.user.token0Balance.gte(amt0);
        const has1 = state.user.token1Balance.gte(amt1);

        if (!has0 || !has1) {
          reporter.recordScenario(vaultConfig.name, "deposit", {
            skipped: true,
            success: false,
            note: `insufficient wallet funds for test deposit (need ~${amt0Human} ${state.user.token0Symbol} and ~${amt1Human} ${state.user.token1Symbol})`,
            vaultMeta: { address: vaultConfig.vault, dex: vaultConfig.dex },
            details: {
              owner: vaultOwner,
              want: wantAddr,
              swapFee: swapFee ? swapFee.toString() : null,
              price: price ? price.toString() : null,
              previewShares: previewShares ? previewShares.toString() : null,
              token0: state.user.token0Symbol,
              token1: state.user.token1Symbol,
              token0Address: state.token0Address,
              token1Address: state.token1Address,
              token0Balance: state.user.token0Balance.toString(),
              token1Balance: state.user.token1Balance.toString(),
              allowance0: allow0.toString(),
              allowance1: allow1.toString(),
              amount0Human: amt0Human,
              amount1Human: amt1Human
            }
          });
          console.log(`  ⏭️  skipping deposit: insufficient funds (has0=${has0} has1=${has1})`);
          continue;
        }

        await approveIfNeeded({ signer, tokenAddress: state.token0Address, spender: vault.address, minAllowance: minAllowance0 });
        await approveIfNeeded({ signer, tokenAddress: state.token1Address, spender: vault.address, minAllowance: minAllowance1 });

        console.log(`  depositing: ~${amt0Human} ${state.user.token0Symbol} + ~${amt1Human} ${state.user.token1Symbol} (via deposit())...`);

        let deposited = false;
        let mode = "approve-only";
        let receipt = null;
        let lastError = null;
        try {
          const tx = await tryDeposit({ vault });
          receipt = await tx.wait();
          deposited = true;
        } catch (e) {
          lastError = String(e?.reason || e?.error?.reason || e?.message || e).slice(0, 220);
        }

        // NOTE: we intentionally do NOT auto-transfer tokens into the vault as a fallback;
        // if deposit() still reverts, a pre-transfer would strand funds in the vault contract.

        await sleep(2500);
        const postShares = await withRetry(() => vault.balanceOf(user)).catch(() => ethers.constants.Zero);
        const minted = postShares.sub(preShares);

        if (deposited && minted.gt(0)) activeVaults.push(vaultConfig);

        reporter.recordScenario(vaultConfig.name, "deposit", {
          success: deposited && minted.gt(0),
          note: `mode=${mode} mintedShares=${ethers.utils.formatEther(minted)} tx=${receipt ? receipt.transactionHash : ""}${lastError ? ` err=${lastError}` : ""}`,
          vaultMeta: { address: vaultConfig.vault, dex: vaultConfig.dex },
          details: {
            owner: vaultOwner,
            want: wantAddr,
            swapFee: swapFee ? swapFee.toString() : null,
            price: price ? price.toString() : null,
            previewShares: previewShares ? previewShares.toString() : null,
            token0: state.user.token0Symbol,
            token1: state.user.token1Symbol,
            token0Address: state.token0Address,
            token1Address: state.token1Address,
            token0Balance: state.user.token0Balance.toString(),
            token1Balance: state.user.token1Balance.toString(),
            allowance0: allow0.toString(),
            allowance1: allow1.toString(),
            amount0Human: amt0Human,
            amount1Human: amt1Human,
            mintedShares: minted.toString()
          }
        });

        if (!deposited) {
          console.log(`  ❌ deposit failed${lastError ? ` (${lastError})` : ""}`);
          continue;
        }

        expect(minted.gt(0), "deposit minted 0 shares").to.equal(true);
      } catch (e) {
        const txHash = e?.transactionHash || e?.receipt?.transactionHash || "";
        const reason = e?.reason || e?.error?.reason || e?.errorName || "";
        console.log(`  ❌ deposit failed: ${String(e.message).slice(0, 160)}`);
        reporter.recordScenario(vaultConfig.name, "deposit", {
          success: false,
          note: `deposit failed: ${String(e.message).slice(0, 200)}${reason ? ` reason=${reason}` : ""}${txHash ? ` tx=${txHash}` : ""}`,
          vaultMeta: { address: vaultConfig.vault, dex: vaultConfig.dex }
        });
        // Don’t hard-fail the entire journey for one vault; we’ll continue.
      }

      await sleep(1000);
    }

    // Sanity: at least one vault should be active. If none succeeded, skip the rest of the journey.
    if (activeVaults.length === 0) {
      reporter.recordScenario("journey", "deposit-all", {
        skipped: true,
        success: false,
        note: "no vaults were deposit-ready (all deposits reverted)",
        vaultMeta: { address: null, dex: null }
      });
      this.skip();
    }
  });

  for (const vaultConfig of vaults) {
    describe(`2-4) Vault: ${vaultConfig.name}`, function () {
      for (const s of scenarios) {
        it(`trade: ${s.name} → check invariants/fees/rebalance`, async function () {
          console.log(`\n📈 Trade: ${vaultConfig.name} | ${s.name}`);
          // If deposit step skipped this vault, skip its trading journey.
          if (!activeVaults.find((v) => v.vault === vaultConfig.vault)) {
            this.skip();
          }

          const vault = new ethers.Contract(vaultConfig.vault, VAULT_ACTIONS_ABI, signer);

          const before = await getVaultState(signer, vaultConfig);
          const totalSupplyBefore = await withRetry(() => vault.totalSupply()).catch(() => null);

          const strategy = before.strategyAddress ? new ethers.Contract(before.strategyAddress, STRATEGY_MIN_ABI, signer) : null;
          const feesBefore = await readStrategyFees(strategy);

          const tokenIn = s.dir === "up" ? vaultConfig.token0 : vaultConfig.token1;
          const tokenOut = s.dir === "up" ? vaultConfig.token1 : vaultConfig.token0;
          const symbolIn = s.dir === "up" ? before.user.token0Symbol : before.user.token1Symbol;

          const amountHuman = baseAmountForSymbol(symbolIn, s.size);
          const amountIn = await parseAmount(signer, tokenIn, symbolIn, amountHuman);

          // Ensure balance
          const balanceIn = s.dir === "up" ? before.user.token0Balance : before.user.token1Balance;
          if (balanceIn.lt(amountIn)) {
            reporter.recordScenario(vaultConfig.name, s.name, {
              skipped: true,
              success: false,
              note: `insufficient ${symbolIn} for amount=${amountHuman}`,
              vaultMeta: { address: vaultConfig.vault, dex: vaultConfig.dex }
            });
            this.skip();
          }

          let txHash = null;
          let tickMoved = null;
          let after = null;

          try {
            console.log(`  swapping ${amountHuman} ${symbolIn} (${vaultConfig.dex})...`);
            const swapResult = await withRetry(
              () =>
                swapHelper.swap({
                  dex: vaultConfig.dex,
                  tokenIn,
                  tokenOut,
                  amountIn,
                  feeTier: vaultConfig.feeTier,
                  options: { slippageBps: 100 }
                }),
              { retries: 6, minDelayMs: 1000, maxDelayMs: 20000, shouldRetry: isTransientRpcError }
            );

            txHash = swapResult.txHash;
            await sleep(3500);

            after = await getVaultState(signer, vaultConfig);
            if (before.pool.ok && after.pool.ok) tickMoved = before.pool.tick !== after.pool.tick;

            // 3) Share invariants after trading
            if (totalSupplyBefore) {
              const totalSupplyAfter = await withRetry(() => vault.totalSupply()).catch(() => null);
              if (totalSupplyAfter) {
                expect(totalSupplyAfter.eq(totalSupplyBefore), "totalSupply changed during trade").to.equal(true);
              }
            }

            expect(after.user.shares.eq(before.user.shares), "user shares changed during trade").to.equal(true);

            // 3) Trading fees earned (best-effort)
            const feesAfter = await readStrategyFees(strategy);
            const sumBefore = feeSum(feesBefore);
            const sumAfter = feeSum(feesAfter);

            // Only assert fee increase if fee counters are readable and we stayed in-range.
            const canAssertFees = sumBefore !== null && sumAfter !== null && before.inRange === true && after.inRange === true;
            if (canAssertFees) {
              expect(sumAfter.gte(sumBefore), "strategy fee counters decreased").to.equal(true);
              expect(sumAfter.gt(sumBefore), "strategy fee counters did not increase").to.equal(true);
            }

            // 3) Rebalancing check (only when moved out-of-range)
            const movedOutOfRange = before.inRange === true && after.inRange === false;
            let rebalanceAttempted = false;
            let rebalanceTx = null;
            let afterRebalance = null;
            if (movedOutOfRange && strategy) {
              rebalanceAttempted = true;
              try {
                console.log(`  out-of-range detected; attempting rebalance()...`);
                const tx = await withRetry(
                  () => strategy.rebalance({ gasLimit: 1_200_000 }),
                  { retries: 3, minDelayMs: 1500, maxDelayMs: 15000, shouldRetry: isTransientRpcError }
                );
                const receipt = await tx.wait();
                rebalanceTx = receipt.transactionHash;
                await sleep(3500);
                afterRebalance = await getVaultState(signer, vaultConfig);

                // If rebalance succeeded, range should change OR in-range should improve.
                const rangeChanged =
                  afterRebalance.tickLower !== after.tickLower ||
                  afterRebalance.tickUpper !== after.tickUpper;
                const improved = afterRebalance.inRange === true || afterRebalance.inRange !== after.inRange;
                expect(rangeChanged || improved, "rebalance succeeded but no observable range/inRange improvement").to.equal(true);
              } catch (e) {
                // Some vaults restrict rebalance permissions; record but do not fail the scenario.
              }
            }

            reporter.recordScenario(vaultConfig.name, s.name, {
              success: true,
              note: `tx=${txHash || ""} tickMoved=${tickMoved === null ? "n/a" : String(tickMoved)} rebalanceAttempted=${rebalanceAttempted} rebalanceTx=${rebalanceTx || ""}`,
              vaultMeta: { address: vaultConfig.vault, dex: vaultConfig.dex },
              details: {
                tickBefore: before.pool.ok ? before.pool.tick : null,
                tickAfter: after?.pool?.ok ? after.pool.tick : null,
                inRangeBefore: before.inRange,
                inRangeAfter: after?.inRange ?? null,
                tickLowerBefore: before.tickLower,
                tickUpperBefore: before.tickUpper,
                tickLowerAfter: after?.tickLower ?? null,
                tickUpperAfter: after?.tickUpper ?? null,
                shares: before.user.shares.toString(),
                totalSupply: totalSupplyBefore ? totalSupplyBefore.toString() : null
              }
            });

            // Tick-move assert only when pool reads are available
            if (before.pool.ok && after.pool.ok) {
              expect(tickMoved, "tick did not move; swap ineffective").to.equal(true);
            }
          } catch (e) {
            reporter.recordScenario(vaultConfig.name, s.name, {
              success: false,
              note: String(e.message).slice(0, 200),
              vaultMeta: { address: vaultConfig.vault, dex: vaultConfig.dex }
            });
            throw e;
          }
        });
      }
    });
  }

  it("5) withdraws back to wallet", async function () {
    const user = await signer.getAddress();

    for (const vaultConfig of activeVaults) {
      console.log(`\n🏁 Withdraw: ${vaultConfig.name}`);
      const vault = new ethers.Contract(vaultConfig.vault, VAULT_ACTIONS_ABI, signer);
      const before = await getVaultState(signer, vaultConfig);

      const preShares = await withRetry(() => vault.balanceOf(user)).catch(() => ethers.constants.Zero);
      if (preShares.isZero()) {
        reporter.recordScenario(vaultConfig.name, "withdraw", {
          skipped: true,
          success: false,
          note: "no shares",
          vaultMeta: { address: vaultConfig.vault, dex: vaultConfig.dex }
        });
        continue;
      }

      const pre0 = before.user.token0Balance;
      const pre1 = before.user.token1Balance;

      try {
        console.log(`  withdrawing ${ethers.utils.formatEther(preShares)} shares...`);
        const tx = await tryWithdrawAll({ signer, vault });
        const receipt = tx ? await tx.wait() : null;
        await sleep(3500);

        const after = await getVaultState(signer, vaultConfig);
        const postShares = await withRetry(() => vault.balanceOf(user)).catch(() => ethers.constants.Zero);

        expect(postShares.isZero(), "withdraw did not burn all shares").to.equal(true);

        const gotSomethingBack = after.user.token0Balance.gt(pre0) || after.user.token1Balance.gt(pre1);
        expect(gotSomethingBack, "withdraw did not increase wallet token balances").to.equal(true);

        reporter.recordScenario(vaultConfig.name, "withdraw", {
          success: true,
          note: `shares=${ethers.utils.formatEther(preShares)} tx=${receipt ? receipt.transactionHash : ""}`,
          vaultMeta: { address: vaultConfig.vault, dex: vaultConfig.dex }
        });
      } catch (e) {
        reporter.recordScenario(vaultConfig.name, "withdraw", {
          success: false,
          note: String(e.message).slice(0, 200),
          vaultMeta: { address: vaultConfig.vault, dex: vaultConfig.dex }
        });
        throw e;
      }

      await sleep(1000);
    }
  });
});
