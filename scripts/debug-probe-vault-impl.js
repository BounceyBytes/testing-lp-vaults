/*
  Debug helper: detect whether vault addresses are minimal proxies and
  print implementation addresses + function selector presence.

  Usage:
    HARDHAT_NETWORK=testnet node scripts/debug-probe-vault-impl.js
*/

const hre = require('hardhat');
const { getClmVaultConfigs } = require('../test/utils/vault-configs');

function getImplFromEIP1167(code) {
  const normalized = (code || '').toLowerCase();
  const match = normalized.match(
    /^0x363d3d373d3d3d363d73([0-9a-f]{40})5af43d82803e903d91602b57fd5bf3$/
  );
  return match ? `0x${match[1]}` : null;
}

function selectorOf(ethers, signature) {
  return ethers.utils.id(signature).slice(0, 10).toLowerCase();
}

function extractPush4Selectors(bytecode) {
  const code = (bytecode || '').toLowerCase().replace(/^0x/, '');
  const selectors = new Set();

  // Solidity dispatcher commonly uses PUSH4 (0x63) <4 bytes>.
  for (let i = 0; i + 10 <= code.length; i += 2) {
    if (code.slice(i, i + 2) !== '63') continue;
    const selector = `0x${code.slice(i + 2, i + 10)}`;
    selectors.add(selector);
  }

  return Array.from(selectors).sort();
}

async function main() {
  const { ethers } = hre;

  const signaturesToCheck = [
    // common multi-asset vault patterns
    'deposit(uint256,uint256,uint256,uint256,address)',
    'deposit(uint256,uint256,uint256,uint256)',
    'deposit(uint256,uint256,uint256,address)',
    'deposit(uint256,uint256,uint256)',
    'deposit(uint256,uint256,address)',
    'deposit(uint256,uint256)',
    'deposit(uint256,address)',
    'deposit(uint256)',

    // alternative naming used by some LP vaults
    'mint(uint256,uint256,uint256)',
    'mint(uint256,uint256,uint256,address)',
    'mint(uint256,address)',

    // burn/withdraw variants
    'redeem(uint256,address,address)',
    'withdraw(uint256,uint256,uint256,address)',
    'withdraw(uint256,uint256,uint256)',
    'withdraw(uint256,address,address)',
  ];

  const vaults = getClmVaultConfigs();

  for (const v of vaults) {
    const proxyCode = (await ethers.provider.getCode(v.vault)).toLowerCase();
    const impl = getImplFromEIP1167(proxyCode);

    console.log(`\nVault: ${v.name}`);
    console.log(`  vault: ${v.vault}`);
    console.log(`  proxyCodeLen: ${proxyCode.length}`);
    console.log(`  proxyType: ${impl ? 'EIP-1167 minimal proxy' : 'unknown'}`);
    if (!impl) continue;

    const implCode = (await ethers.provider.getCode(impl)).toLowerCase();
    console.log(`  impl: ${impl}`);
    console.log(`  implCodeLen: ${implCode.length}`);

    const push4Selectors = extractPush4Selectors(implCode);
    console.log(`  push4Selectors: ${push4Selectors.length}`);

    for (const sig of signaturesToCheck) {
      const selector = selectorOf(ethers, sig).slice(2); // drop 0x
      if (implCode.includes(selector)) {
        console.log(`    ✅ ${sig} ${selectorOf(ethers, sig)}`);
      }
    }

    // Print the selectors last so it's easy to copy/paste into other tools.
    console.log('  selectors:');
    for (const s of push4Selectors) {
      console.log(`    ${s}`);
    }
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
