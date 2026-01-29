const { expect } = require("chai");

function expectAddress(address) {
  expect(address).to.be.a("string");
  expect(address).to.match(/^0x[0-9a-fA-F]{40}$/);
}

function expectBnGte(a, b, message) {
  expect(a.gte(b), message || "expected a >= b").to.equal(true);
}

module.exports = {
  expectAddress,
  expectBnGte
};
