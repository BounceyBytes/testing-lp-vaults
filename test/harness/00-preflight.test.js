const { expect } = require("chai");
const { ethers } = require("hardhat");
const { config, getNetworkName } = require("../utils/config");
const { createRunReporter } = require("../utils/reporting");
const { withRetry } = require("../utils/retry");
const { usingRemoteNetwork, getTestnetSigner } = require("../utils/testnet-signer");

describe("Preflight (network + balances)", function () {
  this.timeout(120000);

  const reporter = createRunReporter({ suite: "preflight", network: getNetworkName() });
  let provider;
  let signer;

  before(async function () {
    if (usingRemoteNetwork()) {
      const res = getTestnetSigner();
      provider = res.provider;
      signer = res.signer;
    } else {
      provider = ethers.provider;
      [signer] = await withRetry(() => ethers.getSigners(), { retries: 6, minDelayMs: 750, maxDelayMs: 15000 });
    }
  });

  after(function () {
    reporter.finalize({ filePrefix: "preflight" });
  });

  it("connects to the configured chainId", async function () {
    const net = await withRetry(() => provider.getNetwork(), { retries: 6, minDelayMs: 750, maxDelayMs: 15000 });
    expect(net.chainId).to.equal(config.network_info.chainId);

    reporter.recordScenario("preflight", "chainId", { success: true, note: `chainId=${net.chainId}` });
  });

  it("signer has gas", async function () {
    const bal = await withRetry(() => signer.getBalance(), { retries: 6, minDelayMs: 750, maxDelayMs: 15000 });
    // We don't hard-fail if low, but it's a strong signal.
    expect(bal.gt(0)).to.equal(true);

    reporter.recordScenario("preflight", "gas", { success: true, note: `balanceWei=${bal.toString()}` });
  });
});
