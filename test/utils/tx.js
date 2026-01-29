const { sleep, withRetry } = require("./retry");

async function waitForNoPendingTransactions(signer, opts = {}) {
  const timeoutMs = opts.timeoutMs ?? 60000;
  const pollMs = opts.pollMs ?? 3000;

  const address = await signer.getAddress();
  const start = Date.now();

  while (Date.now() - start < timeoutMs) {
    const [latest, pending] = await Promise.all([
      withRetry(() => signer.provider.getTransactionCount(address, "latest")),
      withRetry(() => signer.provider.getTransactionCount(address, "pending"))
    ]);

    if (pending <= latest) return { latest, pending };
    await sleep(pollMs);
  }

  const [latest, pending] = await Promise.all([
    signer.provider.getTransactionCount(address, "latest"),
    signer.provider.getTransactionCount(address, "pending")
  ]);
  const err = new Error(`Pending transactions detected (latest=${latest}, pending=${pending}). Wait for mempool to clear or use a fresh account.`);
  err.details = { latest, pending, address };
  throw err;
}

module.exports = {
  waitForNoPendingTransactions
};
