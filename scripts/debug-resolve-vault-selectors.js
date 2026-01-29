/*
  Debug helper: resolve unknown method selectors on the deployed CLM vault
  implementation using 4byte.directory.

  Usage:
    HARDHAT_NETWORK=testnet node scripts/debug-resolve-vault-selectors.js
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

function extractPush4Selectors(bytecode) {
  const code = (bytecode || '').toLowerCase().replace(/^0x/, '');
  const selectors = new Set();
  for (let i = 0; i + 10 <= code.length; i += 2) {
    if (code.slice(i, i + 2) !== '63') continue;
    selectors.add(`0x${code.slice(i + 2, i + 10)}`);
  }
  return Array.from(selectors).sort();
}

async function resolveSelector(selector) {
  const url = `https://www.4byte.directory/api/v1/signatures/?hex_signature=${selector}`;
  const res = await fetch(url, { headers: { Accept: 'application/json' } });
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${selector}`);
  const json = await res.json();
  const results = Array.isArray(json.results) ? json.results : [];
  return results.map((r) => r.text_signature).filter(Boolean);
}

async function main() {
  const { ethers } = hre;

  const printAll = String(process.env.ALL || '').toLowerCase() === '1';

  const vaults = getClmVaultConfigs();
  if (!vaults.length) throw new Error('No vault configs found');

  const proxy = vaults[0].vault;
  const proxyCode = await ethers.provider.getCode(proxy);
  const impl = getImplFromEIP1167(proxyCode);
  if (!impl) throw new Error(`Vault ${proxy} is not an EIP-1167 proxy (codeLen=${proxyCode.length})`);

  const implCode = await ethers.provider.getCode(impl);
  const selectors = extractPush4Selectors(implCode);

  const known = new Set([
    // ERC20
    '0x06fdde03', // name()
    '0x95d89b41', // symbol()
    '0x313ce567', // decimals()
    '0x18160ddd', // totalSupply()
    '0x70a08231', // balanceOf(address)
    '0xa9059cbb', // transfer(address,uint256)
    '0x23b872dd', // transferFrom(address,address,uint256)
    '0x095ea7b3', // approve(address,uint256)
    '0xdd62ed3e', // allowance(address,address)

    // ownable
    '0x8da5cb5b', // owner()
    '0xf2fde38b', // transferOwnership(address)
    '0x715018a6', // renounceOwnership()
  ]);

  const interestingKeywords = [
    'deposit',
    'withdraw',
    'mint',
    'redeem',
    'rebalance',
    'harvest',
    'pause',
    'unpause',
    'whitelist',
    'allow',
    'permit',
    'strategy',
    'balances',
    'totalassets',
    'range',
    'position',
    'tick',
    'token',
  ];

  console.log(`Proxy: ${proxy}`);
  console.log(`Impl:  ${impl}`);
  console.log(`Selectors (PUSH4): ${selectors.length}`);

  for (const selector of selectors) {
    if (known.has(selector)) continue;

    let sigs;
    try {
      sigs = await resolveSelector(selector);
    } catch (e) {
      // network flake; skip
      continue;
    }

    if (printAll) {
      console.log(`${selector} ${sigs[0] || ''}`);
    } else {
      const hit = sigs.find((s) => interestingKeywords.some((k) => s.toLowerCase().includes(k)));
      if (hit) {
        console.log(`\n${selector}`);
        for (const s of sigs.slice(0, 8)) {
          console.log(`  - ${s}`);
        }
      }
    }

    // small pacing to be nice to the API
    await new Promise((r) => setTimeout(r, 150));
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
