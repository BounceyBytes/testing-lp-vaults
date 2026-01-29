const { ethers } = require("ethers");
const { config } = require("./config");

function getRpcUrl() {
  return process.env.TESTNET_RPC_URL || config.network_info?.rpcUrl;
}

function getPrivateKey() {
  return process.env.PRIVATE_KEY;
}

function usingRemoteNetwork() {
  const net = process.env.HARDHAT_NETWORK;
  return net && net !== "hardhat";
}

function getTestnetSigner() {
  const rpcUrl = getRpcUrl();
  const privateKey = getPrivateKey();

  if (!rpcUrl) throw new Error("Missing TESTNET_RPC_URL (or network_info.rpcUrl)");
  if (!privateKey) throw new Error("Missing PRIVATE_KEY in env for remote testnet runs");

  const network = { name: config.network_info?.name || "testnet", chainId: config.network_info?.chainId || 5887 };
  const provider = new ethers.providers.StaticJsonRpcProvider(rpcUrl, network);
  const wallet = new ethers.Wallet(privateKey, provider);
  return { provider, signer: wallet };
}

module.exports = {
  usingRemoteNetwork,
  getTestnetSigner
};
