const config = require("../../testnet-config.json");

function getNetworkName() {
  return config.network || "testnet";
}

function getVaultList() {
  return Object.keys(config.vaults || {})
    .filter((k) => k.startsWith("vault_") && config.vaults[k])
    .filter((k) => config.vaults[k] !== "0x0000000000000000000000000000000000000000")
    .map((k) => ({
      id: k,
      name: k.replace("vault_", "").toUpperCase(),
      address: config.vaults[k]
    }));
}

module.exports = {
  config,
  getNetworkName,
  getVaultList
};
