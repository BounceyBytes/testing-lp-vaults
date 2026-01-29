const { ethers } = require("hardhat");

function fmtUnits(value, decimals) {
  try {
    return ethers.utils.formatUnits(value, decimals);
  } catch {
    return String(value);
  }
}

function shortAddr(addr) {
  if (!addr || typeof addr !== "string") return String(addr);
  return `${addr.slice(0, 6)}…${addr.slice(-4)}`;
}

module.exports = {
  fmtUnits,
  shortAddr
};
