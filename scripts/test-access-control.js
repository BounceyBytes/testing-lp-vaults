const { ethers } = require("hardhat");
const config = require("../testnet-config.json");
const fs = require('fs');

const STRATEGY_ABI = [
  "function rebalance() external",
  "function harvest() external",
  "function owner() external view returns (address)",
  "function keeper() external view returns (address)",
  "function setKeeper(address _keeper) external",
  // Common Custom Errors
  "error NotKeeper()",
  "error NotOwner()",
  "error Unauthorized()",
  "error OnlyKeeper()",
  "error OnlyOwner()",
  "error AccessDenied()"
];

async function main() {
  const [signer] = await ethers.getSigners();
  console.log(`Running access control tests with signer: ${signer.address}`);

  const strategies = [
    { name: "Lotus USDC-mUSD", address: config.strategies.strategy_usdc_musd },
    { name: "Lotus USDT-USDC", address: config.strategies.strategy_usdt_usdc },
    { name: "Lotus wOM-mUSD", address: config.strategies.strategy_wom_musd },
    { name: "QuickSwap USDT-mUSD", address: config.strategies.strategy_usdt_musd },
    { name: "QuickSwap wOM-USDC", address: config.strategies.strategy_wom_usdc }
  ];

  const results = [];

  for (const strat of strategies) {
    if (!strat.address) {
       console.log(`Skipping ${strat.name} (no address configured)`);
       continue;
    }
    console.log(`\nTesting ${strat.name} (${strat.address})...`);
    
    const contract = new ethers.Contract(strat.address, STRATEGY_ABI, signer);
    
    // 1. Get Roles
    let owner = "Unknown";
    let keeper = "Unknown";
    try { owner = await contract.owner(); } catch(e) {}
    try { keeper = await contract.keeper(); } catch(e) {}
    
    const result = {
      strategy: strat.name,
      owner,
      keeper,
      signerIsOwner: (owner === signer.address),
      signerIsKeeper: (keeper === signer.address),
      rebalance: await checkCall(contract, 'rebalance'),
      harvest: await checkCall(contract, 'harvest')
    };

    // 2. Role Setter Test (if owner)
    if (result.signerIsOwner) {
        console.log("  >>> Signer is Owner! Attempting to set keeper to self...");
        const originalKeeper = keeper;
        try {
            const tx = await contract.setKeeper(signer.address);
            await tx.wait();
            console.log("  >>> Keeper set to self. Retrying permissions...");
            
            result.rebalanceAsKeeper = await checkCall(contract, 'rebalance');
            result.harvestAsKeeper = await checkCall(contract, 'harvest');
            
            // Restore
            if (originalKeeper && originalKeeper !== "Unknown") {
                console.log(`  >>> Restoring original keeper: ${originalKeeper}`);
                const tx2 = await contract.setKeeper(originalKeeper);
                await tx2.wait();
            }
        } catch (e) {
            console.error("  >>> Failed to set keeper:", e.message);
        }
    } else {
        console.log(`  (Signer is not owner. Skipping setKeeper test. Owner: ${owner})`);
    }
    
    results.push(result);
  }

  // Output Matrix
  const tableData = results.map(r => {
      let row = {
          Strategy: r.strategy,
          "My Role": r.signerIsOwner ? "Owner" : (r.signerIsKeeper ? "Keeper" : "None"),
          "Rebalance": formatStatus(r.rebalance),
          "Harvest": formatStatus(r.harvest)
      };
      if (r.rebalanceAsKeeper) {
          row["Rebalance (As Keeper)"] = formatStatus(r.rebalanceAsKeeper);
          row["Harvest (As Keeper)"] = formatStatus(r.harvestAsKeeper);
      }
      return row;
  });

  console.table(tableData);
  
  // Save full JSON
  const outDir = path.join(__dirname, '../test-results');
  if (!fs.existsSync(outDir)) fs.mkdirSync(outDir);
  
  const outFile = path.join(outDir, `access-control-${new Date().toISOString().replace(/:/g, '-')}.json`);
  fs.writeFileSync(outFile, JSON.stringify(results, null, 2));
  console.log(`\nDetailed results calling saved to ${outFile}`);
}

function formatStatus(callResult) {
    if (callResult.status === "Authorized") return "✅ Authorized";
    return `❌ ${callResult.status} (${shortError(callResult.error)})`;
}

function shortError(err) {
    if (!err) return "";
    if (err.length > 50) return err.substring(0, 47) + "...";
    return err;
}

const path = require('path');

async function checkCall(contract, methodName) {
    try {
        await contract.callStatic[methodName]();
        return { status: "Authorized", error: null };
    } catch (e) {
        // Try estimateGas to see if we get a better error
        let errorReason = null;
        try {
            await contract.estimateGas[methodName]();
        } catch (gasError) {
             // Often gas estimation errors have better messages
             if (gasError.error && gasError.error.message) {
                 errorReason = gasError.error.message;
             } else if (gasError.reason) {
                 errorReason = gasError.reason;
             } else if (gasError.message) {
                 errorReason = gasError.message;
             }
        }

        if (!errorReason) {
            // Fallback to original error
            if (e.reason) errorReason = e.reason;
            else if (e.error && e.error.reason) errorReason = e.error.reason;
            else if (e.data && e.data.message) errorReason = e.data.message;
            else if (e.message) {
                const match = e.message.match(/reason string '(.*?)'/);
                if (match) errorReason = match[1];
                else errorReason = e.message;
            }
        }

        // Clean up common prefixes
        if (typeof errorReason === 'string') {
            errorReason = errorReason.replace("execution reverted: ", "")
                                     .replace("VM Exception while processing transaction: reverted with reason string ", "")
                                     .replace("VM Exception while processing transaction: reverted with custom error ", "")
                                     .replace(/'/g, ""); // remove quotes around reason
        } else {
            errorReason = "Unknown Revert (No data)";
        }

        // Heuristics for classification
        let status = "Reverted";
        const lowerReason = errorReason.toLowerCase();
        
        if (lowerReason.includes("ownable") || 
            lowerReason.includes("keeper") ||
            lowerReason.includes("only") ||
            lowerReason.includes("auth") ||
            lowerReason.includes("access") ||
            lowerReason.includes("forbidden")) {
            status = "Permission Denied";
        } else if (lowerReason.includes("missing revert data")) {
             // In Ethers v5, this often means the call reverted without a return value or reason string.
             // Could be a custom error that the client doesn't have the ABI for (e.g. NotKeeper()).
             // Since we have a partial ABI, custom errors won't be decoded.
             status = "Reverted (Unknown/Custom Error)";
        }
        
        return { status: status, error: errorReason.trim() };
    }
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
