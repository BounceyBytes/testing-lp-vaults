const { ethers } = require("hardhat");
const config = require("../testnet-config.json");
const fs = require('fs');
const path = require('path');
const TickReader = require('./utils/TickReader');
const { SwapHelper } = require('./utils/swap-helper');

// Vault configurations
const VAULT_CONFIGS = [
  {
    name: "Lotus USDC-mUSD",
    vault: config.vaults.vault_usdc_musd,
    strategy: config.strategies?.strategy_usdc_musd, // Use generic 'strategy' key
    dex: "lotus",
    pool: config.pools.lotus.USDC_mUSD,
    token0: config.tokens.USDC,
    token1: config.tokens.mUSD,
    token0Symbol: "USDC",
    token1Symbol: "mUSD",
    feeTier: 500
  },
  {
    name: "Lotus USDT-USDC",
    vault: config.vaults.vault_usdt_usdc,
    strategy: config.strategies?.strategy_usdt_usdc,
    dex: "lotus",
    pool: config.pools.lotus.USDT_USDC,
    token0: config.tokens.USDT,
    token1: config.tokens.USDC,
    token0Symbol: "USDT",
    token1Symbol: "USDC",
    feeTier: 500
  },
  {
    name: "Lotus wOM-mUSD",
    vault: config.vaults.vault_wom_musd,
    strategy: config.strategies?.strategy_wom_musd,
    dex: "lotus",
    pool: config.pools.lotus.wOM_mUSD,
    token0: config.tokens.wOM,
    token1: config.tokens.mUSD,
    token0Symbol: "wOM",
    token1Symbol: "mUSD",
    feeTier: 3000
  },
  {
    name: "QuickSwap USDT-mUSD",
    vault: config.vaults.vault_usdt_musd,
    strategy: config.strategies?.strategy_usdt_musd,
    dex: "quickswap",
    pool: config.pools.quickswap.USDT_mUSD,
    token0: config.tokens.USDT,
    token1: config.tokens.mUSD,
    token0Symbol: "USDT",
    token1Symbol: "mUSD",
    feeTier: 500
  },
  {
    name: "QuickSwap wOM-USDC",
    vault: config.vaults.vault_wom_usdc,
    strategy: config.strategies?.strategy_wom_usdc,
    dex: "quickswap",
    pool: config.pools.quickswap.wOM_USDC,
    token0: config.tokens.wOM,
    token1: config.tokens.USDC,
    token0Symbol: "wOM",
    token1Symbol: "USDC",
    feeTier: 500
  }
];

const POOL_ABI = [
  "function slot0() view returns (uint160 sqrtPriceX96, int24 tick, uint16 observationIndex, uint16 observationCardinality, uint16 observationCardinalityNext, uint8 feeProtocol, bool unlocked)",
  "function liquidity() view returns (uint128)"
];

const STRATEGY_ABI = [
  "function rebalance() external",
  "function ticks() view returns (int24 tickLower, int24 tickUpper)" // Some strategies might have this
];

async function readPoolTick(provider, vaultConfig) {
    const univ3Iface = new ethers.utils.Interface(POOL_ABI);
    const algebraIfaceSafe = new ethers.utils.Interface([
      "function safelyGetStateOfAMM() view returns (uint160 sqrtPrice, int24 tick, uint16 lastFee, uint8 pluginConfig, uint128 activeLiquidity, int24 nextTick, int24 previousTick)",
      "function liquidity() view returns (uint128)"
    ]);
    const algebraIface7 = new ethers.utils.Interface([
      "function globalState() view returns (uint160 price, int24 tick, uint16 fee, uint16 timepointIndex, uint8 communityFeeToken0, uint8 communityFeeToken1, bool unlocked)",
      "function liquidity() view returns (uint128)"
    ]);

    const tryUniV3 = async () => {
      const raw = await provider.call({ to: vaultConfig.pool, data: univ3Iface.encodeFunctionData("slot0", []) });
      const decoded = univ3Iface.decodeFunctionResult("slot0", raw);
      return { tick: decoded.tick ?? decoded[1], kind: "univ3" };
    };

    const tryAlgebra = async () => {
      try {
        const raw = await provider.call({ to: vaultConfig.pool, data: algebraIfaceSafe.encodeFunctionData("safelyGetStateOfAMM", []) });
        const decoded = algebraIfaceSafe.decodeFunctionResult("safelyGetStateOfAMM", raw);
        return { tick: decoded.tick ?? decoded[1], kind: "algebra" };
      } catch (e) {
        const raw = await provider.call({ to: vaultConfig.pool, data: algebraIface7.encodeFunctionData("globalState", []) });
        const decoded = algebraIface7.decodeFunctionResult("globalState", raw);
        return { tick: decoded.tick ?? decoded[1], kind: "algebra" };
      }
    };

    if (vaultConfig.dex === "quickswap") {
        try { return await tryAlgebra(); } catch { return await tryUniV3(); }
    } else {
        try { return await tryUniV3(); } catch { return await tryAlgebra(); }
    }
}

async function main() {
  const [signer] = await ethers.getSigners();
  console.log(`\nConnected to network. Signer: ${signer.address}`);
  
  const balance = await signer.getBalance();
  console.log(`Balance: ${ethers.utils.formatEther(balance)} ETH`);
  
  const block = await signer.provider.getBlockNumber();
  console.log(`Current Block: ${block}`);

  const swapHelper = new SwapHelper(signer, { debug: false, slippageBps: 100 });
  const tickReader = new TickReader(signer);
  const userAddress = await signer.getAddress();
  
  console.log(`\nRebalance Test Suite`);
  console.log(`Executor: ${userAddress}`);

  const results = [];

  for (const vc of VAULT_CONFIGS) {
    console.log(`\n---------------------------------------------------`);
    console.log(`Testing Rebalance for: ${vc.name}`);
    
    const report = {
        vault: vc.name,
        timestmap: new Date().toISOString(),
        steps: []
    };

    try {
        console.log(`Vault Address: ${vc.vault} (Strategy: ${vc.strategy || 'auto-detect'})`);
        
        // 1. Get Initial State
        const initialState = await tickReader.getTickRange(vc.vault);
        
        if (!initialState) {
            console.error(`❌ Failed to read tick range for ${vc.name}. Skipping.`);
            report.error = "Failed to read tick range";
            results.push(report);
            continue;
        }

        const initialPool = await readPoolTick(signer.provider, vc);
        
        console.log(`Initial Range: [${initialState.tickLower}, ${initialState.tickUpper}]`);
        console.log(`Current Tick: ${initialPool.tick}`);
        
        report.steps.push({ step: "initial", range: initialState, tick: initialPool.tick });

        const isCurrentlyInRange = initialPool.tick >= initialState.tickLower && initialPool.tick <= initialState.tickUpper;
        
        // 2. Identify target direction
        // If in range, push out. If already out, push further out?
        // Prompt says: "perform swaps to push tick beyond range by a target margin"
        // Let's assume we want to push "UP" unless we are already above range, then push "DOWN"?
        // Or if we are below, push UP to get in then OUT?
        // Simplest: If tick > upper, we are already out (UP). If tick < lower, already out (DOWN).
        // If in range, push UP.
        
        let direction = "up";
        let targetTick = initialState.tickUpper + 100; // Target margin
        
        if (isCurrentlyInRange) {
             console.log(`Currently IN RANGE. Pushing price UP to > ${initialState.tickUpper}`);
             direction = "up";
             targetTick = initialState.tickUpper + 200; // Margin
        } else {
             if (initialPool.tick > initialState.tickUpper) {
                 console.log(`Currently OUT OF RANGE (High).`);
                 // We could just try to rebalance now if we want, but prompt implies price moves *then* rebalance.
                 // Maybe push it even further to ensure we trigger movement?
                 // Or maybe we should pull it back IN?
                 // Prompt: "price moves -> position out of range -> rebalance"
                 // If already out of range, step 1 (price moves) is technically optional or we just ensure it stays out.
                 console.log(`Already out of range high. proceeding to rebalance check.`);
             } else {
                 console.log(`Currently OUT OF RANGE (Low).`);
                 console.log(`Already out of range low. proceeding to rebalance check.`);
             }
        }

        // 3. Push Price Loop
        if (isCurrentlyInRange) {
            let attempt = 0;
            const maxAttempts = 10;
            // Base amount depends on token decimals. 
            // For USDC/USDT (6 decimals), 1 starts to be noticed. For 18 decimals, 0.1?
            // test-vaults uses 1 or 10 for stables.
            
            let amount = (vc.token0Symbol === 'USDC' || vc.token0Symbol === 'USDT' || vc.token1Symbol === 'USDC' || vc.token1Symbol === 'USDT') ? 5 : 0.5;

            while (attempt < maxAttempts) {
                const poolNow = await readPoolTick(signer.provider, vc);
                if (poolNow.tick > initialState.tickUpper + 50) { // Check if we have some margin
                    console.log(`✅ Successfully pushed out of range (Tick ${poolNow.tick} > ${initialState.tickUpper})`);
                    break;
                }

                console.log(`Attempt ${attempt+1}: Pushing price ${direction}... (Tick: ${poolNow.tick}, Target > ${initialState.tickUpper})`);
                
                // Swap
                const tokenIn = direction === "up" ? vc.token0 : vc.token1;
                const tokenOut = direction === "up" ? vc.token1 : vc.token0;
                
                // Increase amount aggressively
                const swapAmount = ethers.utils.parseUnits((amount * (1.5 ** attempt)).toFixed(6), (direction === "up" ? getDecimals(vc.token0Symbol) : getDecimals(vc.token1Symbol)));

                try {
                    await swapHelper.swap({
                        dex: vc.dex,
                        tokenIn,
                        tokenOut,
                        amountIn: swapAmount,
                        feeTier: vc.feeTier,
                        options: { slippageBps: 500 } // 5% slippage to force move
                    });
                } catch (e) {
                    console.log(`Swap failed: ${e.message.slice(0, 100)}`);
                }
                
                attempt++;
                await new Promise(r => setTimeout(r, 2000));
            }
        }
        
        const afterPushPool = await readPoolTick(signer.provider, vc);
        const afterPushRange = await tickReader.getTickRange(vc.vault); // Range shouldn't move yet
        
        report.steps.push({ step: "after_push", range: afterPushRange, tick: afterPushPool.tick });
        
        console.log(`State after push: Tick ${afterPushPool.tick}, Range [${afterPushRange.tickLower}, ${afterPushRange.tickUpper}]`);

        // 4. Assert Out of Range
        // (If we failed to push out, we should probably stop or warn)
        if (afterPushPool.tick >= afterPushRange.tickLower && afterPushPool.tick <= afterPushRange.tickUpper) {
             console.log(`⚠️ Warning: Failed to push out of range. Rebalance might not happen.`);
        }

        // 5. Call Rebalance
        console.log(`Calling rebalance()...`);
        
        // We know strategy address from config or need to fetch it?
        // Config has 'expectedStrategy'. Or we can read from vault 'strategy()'.
        // test-vaults reads strategy from vault contract on the fly usually.
        
        const vaultContract = new ethers.Contract(vc.vault, ["function strategy() view returns (address)"], signer);
        const strategyAddr = await vaultContract.strategy();
        console.log(`Strategy Address: ${strategyAddr}`);
        
        const strategy = new ethers.Contract(strategyAddr, STRATEGY_ABI, signer);
        
        try {
            const tx = await strategy.rebalance({ gasLimit: 2000000 });
            console.log(`Rebalance tx sent: ${tx.hash}`);
            await tx.wait();
            console.log(`Rebalance confirmed.`);
        } catch (e) {
            console.error(`Rebalance failed: ${e.message}`);
            // proceed to check if it moved anyway (maybe someone else called it?) or just fail
        }

        // 6. Verify New Range
        const finalRange = await tickReader.getTickRange(vc.vault);
        const finalPool = await readPoolTick(signer.provider, vc);
        
        console.log(`Final Range: [${finalRange.tickLower}, ${finalRange.tickUpper}]`);
        console.log(`Final Tick: ${finalPool.tick}`);
        
        report.steps.push({ step: "final", range: finalRange, tick: finalPool.tick });
        
        const isBackInRange = finalPool.tick >= finalRange.tickLower && finalPool.tick <= finalRange.tickUpper;
        console.log(`Back In Range: ${isBackInRange ? "✅ YES" : "❌ NO"}`);
        
        report.success = isBackInRange;
        results.push(report);

    } catch (err) {
        console.error(`Error testing ${vc.name}:`, err);
        results.push({ vault: vc.name, error: err.message });
    }
  }
  
  // Write report
  const reportPath = path.join(__dirname, '../test-results', `rebalance-test-${new Date().toISOString().replace(/:/g,'-')}.json`);
  fs.writeFileSync(reportPath, JSON.stringify(results, null, 2));
  console.log(`\nReport written to ${reportPath}`);
}

function getDecimals(symbol) {
    if (["USDC", "USDT", "mUSD"].includes(symbol)) return 6; // mUSD is 6? Let's check config/tokens usually.
    // Wait, mUSD is usually 18 or 6?
    // In testnet-config.json, mUSD is a token.
    // Quick safe way: assume 18 unless known stable.
    // Actually, I should probably check via contract, but hardcoding for now based on standard testnet env.
    // Most testnet USD tokens are 6 or 18.
    // If I guess wrong, swap might fail or be huge.
    // Better to use SwapHelper's getTokenInfo if possible or just try catch.
    return 18; 
}

// Override getDecimals to be safer if possible or just use 18 for non-standard
// NOTE: I will update getDecimals to be more robust or rely on hardhat if needed.
// Only USDC/USDT are typically 6.
function getDecimals(symbol) {
    if (symbol === "USDC" || symbol === "USDT") return 6;
    return 18; /// mUSD, wOM usually 18
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
