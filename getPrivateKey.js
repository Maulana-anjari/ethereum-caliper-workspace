const { ethers } = require("ethers");
const fs = require("fs");

// This script now accepts the keystore path and password as command-line arguments.
const keystoreFilePath = process.argv[2];
const password = process.argv[3];

if (!keystoreFilePath || !password) {
  console.error(
    "Usage: node getPrivateKey.js <path_to_keystore_file> <password>"
  );
  process.exit(1);
}

async function main() {
  try {
    const keystoreJson = fs.readFileSync(keystoreFilePath, "utf8");
    const wallet = ethers.Wallet.fromEncryptedJsonSync(keystoreJson, password);
    // Output in a machine-readable format for the shell script
    console.log("Address:", wallet.address);
    console.log("Private Key:", wallet.privateKey);
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

main();
