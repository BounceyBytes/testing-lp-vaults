function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isRateLimitError(err) {
  const msg = String(err?.message || err);
  return msg.includes("Too Many Requests") || msg.includes("429") || msg.toLowerCase().includes("rate limit");
}

function isTransientNetworkError(err) {
  const msg = String(err?.message || err).toLowerCase();
  const code = String(err?.code || "").toUpperCase();
  return (
    msg.includes("could not detect network") ||
    msg.includes("nonetwork") ||
    msg.includes("timeout") ||
    msg.includes("socket hang up") ||
    msg.includes("ecconnreset") ||
    code === "NETWORK_ERROR"
  );
}

function isTransientRpcError(err) {
  return isRateLimitError(err) || isTransientNetworkError(err);
}

async function withRetry(fn, opts = {}) {
  const retries = opts.retries ?? 5;
  const minDelayMs = opts.minDelayMs ?? 500;
  const maxDelayMs = opts.maxDelayMs ?? 8000;
  const shouldRetry = opts.shouldRetry || isTransientRpcError;

  let attempt = 0;
  // eslint-disable-next-line no-constant-condition
  while (true) {
    try {
      return await fn(attempt);
    } catch (err) {
      attempt++;
      if (attempt > retries || !shouldRetry(err)) throw err;
      const delay = Math.min(maxDelayMs, minDelayMs * Math.pow(2, attempt - 1));
      await sleep(delay);
    }
  }
}

module.exports = {
  sleep,
  withRetry,
  isRateLimitError,
  isTransientNetworkError,
  isTransientRpcError
};
