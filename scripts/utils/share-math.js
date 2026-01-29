const { ethers } = require("hardhat");

/**
 * Helper to get vault decimals safely
 */
async function getVaultDecimals(vault) {
    try {
        const d = await vault.decimals();
        return Number(d);
    } catch (e) {
        return 18; // Default to 18
    }
}

/**
 * Fetch and format Price Per Full Share (PPFS).
 * Handles potential partial implementations or different naming conventions.
 * Applies heuristic to detect decimal mismatch (e.g. 18-decimal PPFS on 6-decimal vault).
 */
async function getSharePrice(vault, vaultDecimals=null) {
    if (vaultDecimals === null) vaultDecimals = await getVaultDecimals(vault);
    
    // Ensure it is a number
    let decimalsToUse = Number(vaultDecimals);
    
    let ppfs;
    try {
        ppfs = await vault.getPricePerFullShare();
    } catch (e) {
        try {
            ppfs = await vault.pricePerShare();
        } catch {
            return null;
        }
    }
    
    if (!ppfs) return null;

    // Heuristic for Scale Detection:
    // If the vault has low decimals (e.g. 6) but returns a PPFS that looks like 18 decimals,
    // we should use 18 decimals to format it, otherwise we get a massive number.
    // e.g. 1.05 share price = 1_050_000 (6 decimals) OR 1_050_000_000_000_000_000 (18 decimals)
    
    const valString = ppfs.toString();
    const len = valString.length;
    
    console.log(`DEBUG: Checking PPFS ${valString} with start decimals ${decimalsToUse} (length=${len})`);
    
    // If decimals is small (<=8) but length suggests 18 decimals (length > 12)
    // AND the value would be massive (> 10000) if we used the small decimals...
    if (decimalsToUse <= 8 && len > 12) {
         // Check value with small decimals
         const valTemp = ethers.utils.formatUnits(ppfs, decimalsToUse);
         const valSmall = parseFloat(valTemp);
         
         console.log(`DEBUG: Heuristic check valSmall=${valSmall} (>10000?)`);
         
         if (valSmall > 10000) {
             // Likely 18 decimals
             console.log(`DEBUG: Detected 18-decimal PPFS scale on low-decimal vault. RAW=${ppfs.toString()} Decimals=${decimalsToUse} -> 18`);
             decimalsToUse = 18;
         }
    }
    
    return {
        raw: ppfs,
        formatted: ethers.utils.formatUnits(ppfs, decimalsToUse),
        decimalsUsed: decimalsToUse
    };
}

module.exports = {
   getVaultDecimals,
   getSharePrice
};
