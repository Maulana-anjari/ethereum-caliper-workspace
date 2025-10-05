"use strict";

const normalizeAddressFactory = (web3) => {
  if (!web3 || !web3.utils || typeof web3.utils.toChecksumAddress !== "function") {
    return (address) => address;
  }
  return (address) => {
    try {
      return web3.utils.toChecksumAddress(address);
    } catch (err) {
      return address;
    }
  };
};

const parseAccountsFromEnv = () => {
  const raw = process.env.ACCOUNTS_JSON;
  if (!raw) {
    return [];
  }

  try {
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      return [];
    }
    return parsed
      .map((entry) => (entry && typeof entry.address === "string" ? entry.address : null))
      .filter(Boolean);
  } catch (error) {
    console.warn(`[account-utils] Failed to parse ACCOUNTS_JSON: ${error.message}`);
    return [];
  }
};

const dedupeAndNormalize = (addresses, normalizer) => {
  const seen = new Set();
  const result = [];
  for (const address of addresses) {
    if (!address) {
      continue;
    }
    const normalized = normalizer(address);
    if (!seen.has(normalized)) {
      seen.add(normalized);
      result.push(normalized);
    }
  }
  return result;
};

const resolveAccounts = async (web3, totalWorkers) => {
  const normalize = normalizeAddressFactory(web3);

  let accounts = dedupeAndNormalize(parseAccountsFromEnv(), normalize);

  if (accounts.length >= totalWorkers) {
    return accounts;
  }

  try {
    const nodeAccounts = await web3.eth.getAccounts();
    accounts = dedupeAndNormalize(accounts.concat(nodeAccounts || []), normalize);
  } catch (error) {
    console.warn(`[account-utils] Failed to fetch accounts from node: ${error.message}`);
  }

  return accounts;
};

module.exports = { resolveAccounts };
