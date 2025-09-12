const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

// Usage:
// - Single: node getPrivateKey.js <keystore_dir> <password>
// - Multiple: node getPrivateKey.js <dir1,dir2,dir3> <pass1,pass2,pass3>
//   If a single password is provided for multiple dirs, it will be reused for all.

const inputPaths = process.argv[2];
const inputPasswords = process.argv[3];

if (!inputPaths || !inputPasswords) {
  console.error(
    "Usage: node getPrivateKey.js <keystore_dir|dir1,dir2> <password|pass1,pass2>"
  );
  process.exit(1);
}

function readAccountsFromDir(dirPath, password) {
  const files = fs.readdirSync(dirPath);
  const keystoreFiles = files.filter((file) => file.startsWith("UTC--"));

  if (keystoreFiles.length === 0) {
    throw new Error(`No keystore files found in directory: ${dirPath}`);
  }

  const accounts = [];
  for (const file of keystoreFiles) {
    const filePath = path.join(dirPath, file);
    const keystoreJson = fs.readFileSync(filePath, "utf8");
    const wallet = ethers.Wallet.fromEncryptedJsonSync(keystoreJson, password);
    accounts.push({ address: wallet.address, privateKey: wallet.privateKey });
  }
  return accounts;
}

async function main() {
  try {
    const paths = inputPaths.split(",").map((p) => p.trim()).filter(Boolean);
    const passList = inputPasswords.split(",").map((p) => p.trim()).filter(Boolean);

    const passwords = paths.map((_, i) => passList[i] || passList[0]);

    let allAccounts = [];
    for (let i = 0; i < paths.length; i++) {
      const dirPath = paths[i];
      const pass = passwords[i];
      if (!fs.existsSync(dirPath) || !fs.statSync(dirPath).isDirectory()) {
        throw new Error(`Keystore directory not found: ${dirPath}`);
      }
      const accounts = readAccountsFromDir(dirPath, pass);
      allAccounts = allAccounts.concat(accounts);
    }

    // Deduplicate by address (case-insensitive)
    const seen = new Set();
    const uniqueAccounts = [];
    for (const acc of allAccounts) {
      const key = acc.address.toLowerCase();
      if (!seen.has(key)) {
        seen.add(key);
        uniqueAccounts.push(acc);
      }
    }

    console.log(JSON.stringify(uniqueAccounts, null, 2));
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

main();
