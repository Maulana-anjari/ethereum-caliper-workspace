#!/usr/bin/env node
/*
 * Skrip untuk mengekstrak daftar akun prefunded dari log Kurtosis
 * dan mengubahnya menjadi array objek { address, privateKey } yang siap
 * dipakai sebagai ACCOUNTS_JSON untuk Caliper.
 */

const fs = require('fs');
const path = require('path');

// Muat konfigurasi dari .env (jika ada) supaya jalur log dapat dikendalikan via environment.
try {
  const dotenv = require('dotenv');
  const envPath = path.resolve(__dirname, '..', '.env');
  if (fs.existsSync(envPath)) {
    dotenv.config({ path: envPath });
  } else {
    dotenv.config();
  }
} catch (error) {
  // dotenv optional; lanjut saja bila tidak tersedia.
}

const FALLBACK_LOG_PATH = path.resolve(__dirname, '..', '..', 'blockchain-pos-geth', 'kurtosis-running.log');

const [, , inputPathArg, limitArg] = process.argv;

const envLogPath = process.env.KURTOSIS_LOG_PATH
  ? path.resolve(process.cwd(), process.env.KURTOSIS_LOG_PATH)
  : undefined;

const logPath = inputPathArg
  ? path.resolve(process.cwd(), inputPathArg)
  : envLogPath || FALLBACK_LOG_PATH;

if (!fs.existsSync(logPath)) {
  console.error(`❌ File log tidak ditemukan: ${logPath}`);
  process.exit(1);
}

const rawLog = fs.readFileSync(logPath, 'utf8');

const preFundedMatch =
  rawLog.match(/"pre_funded_accounts"\s*:\s*\[(.*?)\]/s) ||
  rawLog.match(/\"pre_funded_accounts\"\s*:\s*\[(.*?)\]/s);

if (!preFundedMatch) {
  console.error('❌ Tidak menemukan blok "pre_funded_accounts" pada log.');
  process.exit(1);
}

const preFundedBlock = preFundedMatch[1];
const accountRegex = /"address"\s*:\s*"(0x[0-9a-fA-F]+)"[\s\S]*?"private_key"\s*:\s*"([0-9a-fA-Fx]+)"/g;

const accounts = [];
let match;

while ((match = accountRegex.exec(preFundedBlock)) !== null) {
  const [, address, privateKeyRaw] = match;
  const privateKey = privateKeyRaw.startsWith('0x') ? privateKeyRaw : `0x${privateKeyRaw}`;
  accounts.push({ address, privateKey });
}

if (accounts.length === 0) {
  console.error('❌ Tidak ada akun yang berhasil diekstrak dari blok pre_funded_accounts.');
  process.exit(1);
}

const parsedArgLimit = limitArg ? Number(limitArg) : undefined;
const envLimit = process.env.KURTOSIS_ACCOUNT_LIMIT ? Number(process.env.KURTOSIS_ACCOUNT_LIMIT) : undefined;

const limit = parsedArgLimit !== undefined && !Number.isNaN(parsedArgLimit)
  ? parsedArgLimit
  : envLimit !== undefined && !Number.isNaN(envLimit)
    ? envLimit
    : 3; // default agar setara dengan konfigurasi PoA

if (limit !== undefined && (!Number.isFinite(limit) || limit <= 0)) {
  console.error('❌ Parameter limit harus berupa angka > 0 (opsional).');
  process.exit(1);
}

const finalAccounts = limit ? accounts.slice(0, limit) : accounts;

console.log(JSON.stringify(finalAccounts, null, 2));
