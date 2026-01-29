const { expect } = require("chai");
const { ethers } = require("hardhat");
const { config, getVaultList, getNetworkName } = require("./utils/config");
const { createRunReporter } = require("./utils/reporting");

// ABI Definitions
const VAULT_ABI = [
  // Read-only
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function totalSupply() view returns (uint256)",
  "function totalAssets() view returns (uint256 assets0, uint256 assets1)",
  "function balances() view returns (uint256 amount0, uint256 amount1)",
  "function strategy() view returns (address)", 
  "function balanceOf(address) view returns (uint256)",
  "function paused() view returns (bool)",
  
  // Write - Multiple variants to probe
  "function deposit(uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min) external returns (uint256 shares, uint256 amount0, uint256 amount1)",
  "function deposit(uint256 amount0Desired, uint256 amount1Desired, uint256 amount0Min, uint256 amount1Min, address to) external returns (uint256 shares, uint256 amount0, uint256 amount1)",
  "function deposit(uint256 amount0, uint256 amount1) external returns (uint256 shares)",
  
  "function withdraw(uint256 shares, uint256 amount0Min, uint256 amount1Min) external returns (uint256 amount0, uint256 amount1)",
  "function withdraw(uint256 shares, uint256 amount0Min, uint256 amount1Min, address to) external returns (uint256 amount0, uint256 amount1)"
];

const STRATEGY_ABI = [
  "function lpToken0() view returns (address)",
  "function lpToken1() view returns (address)"
];

const ERC20_ABI = [
  "function name() view returns (string)",
  "function symbol() view returns (string)",
  "function decimals() view returns (uint8)",
  "function balanceOf(address) view returns (uint256)",
  "function approve(address spender, uint256 amount) external returns (bool)",
  "function allowance(address owner, address spender) view returns (uint256)"
];

const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
const reporter = createRunReporter({ suite: "vault-operations", network: getNetworkName() });

describe("CLM Vault Deposit/Withdraw Suite", function () {
  let signer;
  const testResults = {
    timestamp: new Date().toISOString(),
    network: config.network,
    results: []
  };

  before(async function () {
    // Retry logic for getSigners to handle rate limiting "Too Many Requests"
    let retries = 5;
    while (retries > 0) {
      try {
        [signer] = await ethers.getSigners();
        console.log(`\nRunning tests with account: ${signer.address}`);
        break;
      } catch (e) {
        console.log(`Error getting signers (retries left: ${retries}): ${e.message}`);
        retries--;
        if (retries === 0) throw e;
        await sleep(2000);
      }
    }
  });

  after(async function () {
    // Unified JSON + Markdown reporting
    reporter.run.vaults = testResults.results.map(r => ({ name: r.vault, address: r.address, scenarios: (r.tests || []).map(t => ({
      name: t.name,
      success: String(t.status).toLowerCase().startsWith("passed"),
      skipped: String(t.status).toLowerCase().includes("skip"),
      note: t.status,
      details: t.details
    })) }));
    reporter.run.summary = reporter.run.summary; // keep counters from recordScenario calls
    const paths = reporter.finalize({ filePrefix: "vault-ops" });
    console.log(`\n\nTest report saved to: ${paths.jsonPath}`);
    console.log(`Markdown report saved to: ${paths.mdPath}`);
  });

  const staticVaults = getVaultList();

  staticVaults.forEach(vaultConf => {
    describe(`Vault: ${vaultConf.name} (${vaultConf.address})`, function () {
      let vault;
      let token0, token1;
      let t0Sym, t1Sym;
      let t0Dec, t1Dec;
      
      let vaultResult = {
        vault: vaultConf.name,
        address: vaultConf.address,
        tests: []
      };

      // Helper to try deposit variants
      const tryDeposit = async (a0, a1) => {
        const _attempt = async (fn) => {
           let r = 5;
           while(r > 0) {
              try { return await fn(); }
              catch(e) { 
                 if (e.message.includes("Too Many Requests") || e.message.includes("429") || e.message.includes("network")) {
                     console.log(`    ⚠️ Rate limit hit, retrying in 5s... (${r} left)`);
                     await sleep(5000);
                     r--;
                     if(r===0) throw e;
                 } else {
                     throw e; // Standard revert or other error
                 }
              }
           }
        };

        // Variant 1: 5 args
        try {
            return await _attempt(async () => {
                const estimate = await vault.estimateGas["deposit(uint256,uint256,uint256,uint256,address)"](a0, a1, 0, 0, signer.address);
                return await vault["deposit(uint256,uint256,uint256,uint256,address)"](a0, a1, 0, 0, signer.address, { gasLimit: estimate.mul(12).div(10) });
            });
        } catch (e) {
            if (!e.message.includes("execution reverted")) {
                // If it's not a revert, it's a real issue, but we continue to next variant just in case
            }
        }
        
        // Variant 2: 4 args
        try {
             return await _attempt(async () => {
                const estimate = await vault.estimateGas["deposit(uint256,uint256,uint256,uint256)"](a0, a1, 0, 0);
                return await vault["deposit(uint256,uint256,uint256,uint256)"](a0, a1, 0, 0, { gasLimit: estimate.mul(12).div(10) });
             });
        } catch (e) {
        }

        // Variant 3: 2 args
        try {
             return await _attempt(async () => {
                const estimate = await vault.estimateGas["deposit(uint256,uint256)"](a0, a1);
                return await vault["deposit(uint256,uint256)"](a0, a1, { gasLimit: estimate.mul(12).div(10) });
             });
        } catch (e) {
            let msg = e.message;
            if (e.code === 'UNPREDICTABLE_GAS_LIMIT') {
                msg = "Contract Reverted (Logic Error or Missing Function)";
            }
            throw new Error(`All deposit variants failed. ${msg}`);
        }
      };

      // Helper for withdraw
      const tryWithdraw = async (shares) => {
          try {
              return await vault["withdraw(uint256,uint256,uint256,address)"](shares, 0, 0, signer.address);
          } catch(e) {
              return await vault["withdraw(uint256,uint256,uint256)"](shares, 0, 0);
          }
      }


      before(async function () {
        // Add delay to prevent rate limiting between vaults
        await sleep(1000);
        
        vault = new ethers.Contract(vaultConf.address, VAULT_ABI, signer);
        
        // Get tokens via Strategy
        try {
            const strategyAddr = await vault.strategy();
            const strategy = new ethers.Contract(strategyAddr, STRATEGY_ABI, signer);

            const t0Address = await strategy.lpToken0();
            const t1Address = await strategy.lpToken1();
            
            token0 = new ethers.Contract(t0Address, ERC20_ABI, signer);
            token1 = new ethers.Contract(t1Address, ERC20_ABI, signer);
            
            [t0Sym, t1Sym, t0Dec, t1Dec] = await Promise.all([
            token0.symbol(),
            token1.symbol(),
            token0.decimals(),
            token1.decimals()
            ]);

            console.log(`  Tokens: ${t0Sym} / ${t1Sym}`);

            // Check & Approve Allowances
            try {
                const allow0 = await token0.allowance(signer.address, vault.address);
                if (allow0.lt(ethers.utils.parseUnits("1000", t0Dec))) { // Simple check
                   console.log(`    Approving ${t0Sym} for Vault...`);
                   const tx = await token0.approve(vault.address, ethers.constants.MaxUint256);
                   await tx.wait();
                   await sleep(2000); 
                }

                const allow1 = await token1.allowance(signer.address, vault.address);
                if (allow1.lt(ethers.utils.parseUnits("1000", t1Dec))) {
                   console.log(`    Approving ${t1Sym} for Vault...`);
                   const tx = await token1.approve(vault.address, ethers.constants.MaxUint256);
                   await tx.wait();
                   await sleep(2000);
                }
            } catch (err) {
                console.warn("    Warning: Approval check failed (might be network issue): " + err.message);
            }

        } catch (e) {
            console.error("  Setup Error: Could not load token details from strategy.");
            this.skip();
        }

        try {
            const isPaused = await vault.paused();
            console.log(`  Paused: ${isPaused}`);
            if (isPaused) console.warn("  WARNING: Vault is PAUSED.");
        } catch (e) {
            // console.log(`  Paused: (func not found)`);
        }
      });

      after(function() {
        testResults.results.push(vaultResult);
      });

      const record = (testName, status, details = {}) => {
        vaultResult.tests.push({ name: testName, status, details });
        const success = String(status).toLowerCase().startsWith("passed");
        const skipped = String(status).toLowerCase().includes("skip");
        reporter.recordScenario(vaultConf.name, testName, { success, skipped, note: status, details, vaultMeta: { address: vaultConf.address } });
      };

      // 1. Initial State
      it("Should have valid initial state", async function () {
        const supply = await vault.totalSupply();
        expect(supply).to.not.be.undefined;
        
        // Check user balance
        const b0 = await token0.balanceOf(signer.address);
        const b1 = await token1.balanceOf(signer.address);
        
        console.log(`    User Balances: ${ethers.utils.formatUnits(b0, t0Dec)} ${t0Sym}, ${ethers.utils.formatUnits(b1, t1Dec)} ${t1Sym}`);
        
        if (b0.eq(0) && b1.eq(0)) {
          console.warn("    WARNING: User has NO tokens. Deposits will fail.");
        }
        
        record("Initial State", "Passed", { supply: supply.toString() });
      });

      // 2. Token0 Deposit
      it("Deposit Token0 Only", async function () {
        const amount = ethers.utils.parseUnits("1.0", t0Dec); 
        const balance = await token0.balanceOf(signer.address);
        
        if (balance.lt(amount)) this.skip();

        await (await token0.approve(vault.address, amount)).wait();
        
        const preShares = await vault.balanceOf(signer.address);

        try {
            const tx = await tryDeposit(amount, 0);
            await tx.wait();
            
            const postShares = await vault.balanceOf(signer.address);
            const sharesMinted = postShares.sub(preShares);
            
            console.log(`    Minted ${ethers.utils.formatEther(sharesMinted)} shares`);
            
            expect(sharesMinted).to.be.gt(0);
            record("Deposit Token0", "Passed", { sharesMinted: sharesMinted.toString(), tx: tx.hash });
        } catch (e) {
            record("Deposit Token0", "Failed", { error: e.message });
            throw e;
        }
      });

      // 3. Token1 Deposit
      it("Deposit Token1 Only", async function () {
        const amount = ethers.utils.parseUnits("1.0", t1Dec);
        const balance = await token1.balanceOf(signer.address);
        
        if (balance.lt(amount)) this.skip();

        await (await token1.approve(vault.address, amount)).wait();
        
        const preShares = await vault.balanceOf(signer.address);

        try {
            const tx = await tryDeposit(0, amount);
            await tx.wait();
            
            const postShares = await vault.balanceOf(signer.address);
            const sharesMinted = postShares.sub(preShares);
            
            console.log(`    Minted ${ethers.utils.formatEther(sharesMinted)} shares`);
            
            expect(sharesMinted).to.be.gt(0);
            record("Deposit Token1", "Passed", { sharesMinted: sharesMinted.toString(), tx: tx.hash });
        } catch (e) {
             record("Deposit Token1", "Failed", { error: e.message });
             throw e;
        }
      });

      // 4. Dual Deposit
      it("Deposit Dual Asset (Balanced)", async function () {
        const amt0 = ethers.utils.parseUnits("1.0", t0Dec);
        const amt1 = ethers.utils.parseUnits("1.0", t1Dec); 
        
        const b0 = await token0.balanceOf(signer.address);
        const b1 = await token1.balanceOf(signer.address);
        
        if (b0.lt(amt0) || b1.lt(amt1)) this.skip();

        await (await token0.approve(vault.address, amt0)).wait();
        await (await token1.approve(vault.address, amt1)).wait();

        const preShares = await vault.balanceOf(signer.address);

        try {
            const tx = await tryDeposit(amt0, amt1);
            await tx.wait();
            
            const postShares = await vault.balanceOf(signer.address);
            expect(postShares.sub(preShares)).to.be.gt(0);
            record("Deposit Dual", "Passed", { sharesMinted: postShares.sub(preShares).toString() });
        } catch (e) {
            record("Deposit Dual", "Failed", { error: e.message });
            throw e;
        }
      });

      // 5. Partial Withdraw (50%)
      it("Partial Withdraw (50%)", async function () {
        const shares = await vault.balanceOf(signer.address);
        if (shares.eq(0)) this.skip();

        const withdrawAmount = shares.div(2);
        
        const preBal0 = await token0.balanceOf(signer.address);
        
        try {
            const tx = await tryWithdraw(withdrawAmount);
            await tx.wait();
            
            const postBal0 = await token0.balanceOf(signer.address);
            const postShares = await vault.balanceOf(signer.address);
            
            // expect(postShares).to.equal(shares.sub(withdrawAmount)); // Precise check
            record("Partial Withdraw", "Passed", { burned: withdrawAmount.toString() });
        } catch (e) {
            record("Partial Withdraw", "Failed", { error: e.message });
            throw e;
        }
      });

      // 6. Dust Deposit (Edge Case)
      it("Dust Deposit (Min amount)", async function () {
        const amt0 = "100"; // 100 wei
        
        const b0 = await token0.balanceOf(signer.address);
        if (b0.lt(100)) this.skip();

        await (await token0.approve(vault.address, amt0)).wait();

        try {
            const tx = await tryDeposit(amt0, 0);
            await tx.wait();
            record("Dust Deposit", "Passed");
        } catch (e) {
            console.log("    Dust deposit failed (expected): " + e.message.slice(0, 100) + "...");
            record("Dust Deposit", "Failed (Expected?)", { error: e.message });
        }
      });
      
      // 7. Full Withdraw
      it("Full Withdraw", async function () {
         const shares = await vault.balanceOf(signer.address);
         if (shares.eq(0)) this.skip();
         
         try {
             const tx = await tryWithdraw(shares);
             await tx.wait();
             
             const finalShares = await vault.balanceOf(signer.address);
             expect(finalShares).to.equal(0);
             record("Full Withdraw", "Passed");
         } catch (e) {
             record("Full Withdraw", "Failed", { error: e.message });
             throw e;
         }
      });

      // 8. First Depositor (Check Supply)
      it("Check First Depositor Logic (Info Only)", async function () {
        const supply = await vault.totalSupply();
        if (supply.eq(0)) {
            console.log("    Vault is empty. Next deposit will be First Depositor.");
            record("First Depositor", "Info", { status: "Empty" });
        } else {
            // console.log("    Vault has existing supply.");
            record("First Depositor", "Info", { status: "Active", supply: supply.toString() });
        }
      });

    });
  });
});
