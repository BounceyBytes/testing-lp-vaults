/*
  Debug helper: attempt a deposit() from a fresh small-balance wallet.

  Usage:
    HARDHAT_NETWORK=testnet node scripts/debug-single-deposit.js
*/

const hre = require('hardhat');

async function main() {
  const { ethers } = hre;
  const [funder] = await ethers.getSigners();
  const provider = funder.provider;

  const vaultAddr = '0xe57b332f9FCBCD42fF50035C8c8c65455faa14C0';
  const usdc = '0x49b163c575948F0b95e0c459C301995147f27866';
  const musd = '0x4B545d0758eda6601B051259bD977125fbdA7ba2';

  const user = ethers.Wallet.createRandom().connect(provider);

  console.log('funder', funder.address);
  console.log('user  ', user.address);

  const gasFund = await funder.sendTransaction({ to: user.address, value: ethers.utils.parseEther('0.2') });
  await gasFund.wait();

  const erc20 = [
    'function decimals() view returns(uint8)',
    'function balanceOf(address) view returns(uint256)',
    'function transfer(address,uint256) returns(bool)',
    'function approve(address,uint256) returns(bool)',
    'function allowance(address,address) view returns(uint256)'
  ];

  const t0 = new ethers.Contract(usdc, erc20, funder);
  const t1 = new ethers.Contract(musd, erc20, funder);
  const [d0, d1] = await Promise.all([t0.decimals(), t1.decimals()]);
  const amt0 = ethers.utils.parseUnits('1', d0);
  const amt1 = ethers.utils.parseUnits('1', d1);

  await (await t0.transfer(user.address, amt0)).wait();
  await (await t1.transfer(user.address, amt1)).wait();

  const t0u = t0.connect(user);
  const t1u = t1.connect(user);
  const vault = new ethers.Contract(
    vaultAddr,
    ['function balanceOf(address) view returns(uint256)', 'function deposit() returns (uint256)'],
    user
  );

  console.log('user balances', (await t0u.balanceOf(user.address)).toString(), (await t1u.balanceOf(user.address)).toString());

  await (await t0u.approve(vaultAddr, ethers.constants.MaxUint256)).wait();
  await (await t1u.approve(vaultAddr, ethers.constants.MaxUint256)).wait();

  const pre = await vault.balanceOf(user.address);
  console.log('preShares', pre.toString());

  try {
    await vault.callStatic.deposit();
    console.log('callStatic deposit OK (no pre-transfer)');
  } catch (e) {
    console.log('callStatic deposit failed (no pre-transfer):', String(e.message).slice(0, 200));
  }

  console.log('transferring tokens directly to vault...');
  await (await t0u.transfer(vaultAddr, amt0)).wait();
  await (await t1u.transfer(vaultAddr, amt1)).wait();

  try {
    await vault.callStatic.deposit();
    console.log('callStatic deposit OK (after pre-transfer)');
  } catch (e) {
    console.log('callStatic deposit failed (after pre-transfer):', String(e.message).slice(0, 200));
    return;
  }

  const tx = await vault.deposit({ gasLimit: 2500000 });
  const rec = await tx.wait();
  console.log('deposit tx', rec.transactionHash);

  const post = await vault.balanceOf(user.address);
  console.log('postShares', post.toString(), 'minted', post.sub(pre).toString());
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
