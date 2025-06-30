const { ethers } = require("ethers");
const fs = require("fs");
const path = require("path");

// This script now accepts the keystore directory path and password as command-line arguments.
const keystoreDirPath = process.argv[2];
const password = process.argv[3];

if (!keystoreDirPath || !password) {
  console.error(
    "Usage: node getPrivateKey.js <path_to_keystore_directory> <password>"
  );
  process.exit(1);
}

async function main() {
  try {
    const files = fs.readdirSync(keystoreDirPath);
    const keystoreFiles = files.filter((file) =>
      file.startsWith("UTC--")
    );

    if (keystoreFiles.length === 0) {
      console.error("No keystore files found in the directory.");
      process.exit(1);
    }

    const accounts = [];
    for (const file of keystoreFiles) {
      const filePath = path.join(keystoreDirPath, file);
      const keystoreJson = fs.readFileSync(filePath, "utf8");
      const wallet = ethers.Wallet.fromEncryptedJsonSync(keystoreJson, password);
      accounts.push({
        address: wallet.address,
        privateKey: wallet.privateKey,
      });
    }

    // Output in a machine-readable JSON format for the shell script
    console.log(JSON.stringify(accounts, null, 2));
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
}

main();
