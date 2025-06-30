// File: generate-network-config.js
// Tujuan: Membuat network config untuk kontrak yang SUDAH di-deploy.

require("dotenv").config();
const fs = require("fs");
const path = require("path");

console.log(
  "Generating Caliper network configuration for pre-deployed contracts..."
);

// --- Baca Alamat Kontrak yang Sudah Di-deploy ---
const deployedContractsPath = "./deployed-contracts.json";
if (!fs.existsSync(deployedContractsPath)) {
  console.error(
    `❌ Error: File alamat ${deployedContractsPath} tidak ditemukan. Jalankan skrip deployment terlebih dahulu.`
  );
  process.exit(1);
}
const deployedAddresses = JSON.parse(
  fs.readFileSync(deployedContractsPath, "utf8")
);
console.log(">> Successfully read deployed contract addresses.");

// --- Bangun Konfigurasi Kontrak dengan Alamat dan ABI ---
const contracts = {};
for (const contractName in deployedAddresses) {
  const contractAddress = deployedAddresses[contractName];
  // Asumsi file ABI Anda ada di 'contracts/abi/'. Sesuaikan jika perlu.
  const abiPath = path.join(
    __dirname,
    "contracts",
    "abi",
    `${contractName}.json`
  );

  if (!fs.existsSync(abiPath)) {
    console.error(
      `❌ Error: File ABI untuk ${contractName} tidak ditemukan di ${abiPath}`
    );
    continue; // Lanjut ke kontrak berikutnya
  }

  const abiJson = JSON.parse(fs.readFileSync(abiPath, "utf8"));

  const contractInfo = {
    address: contractAddress,
    abi: abiJson.abi,
  };

  // Sesuaikan gas limit berdasarkan nama kontrak
  if (contractName === "CpuStressTest") {
    contractInfo.gas = {
      calculate: 500000,
    };
  } else if (contractName === "MintCertificate") {
    contractInfo.gas = {
      benchmarkMint: 800000,
    };
  } else {
    // Fallback untuk kontrak lain jika diperlukan
    contractInfo.gas = {
      benchmarkMint: 300000,
      calculate: 500000,
    };
  }

  contracts[contractName] = contractInfo;
  console.log(
    `- Added pre-deployed config for: ${contractName} at ${contractAddress}`
  );
}

// --- Struktur Final Konfigurasi Jaringan ---
const accounts = JSON.parse(process.env.ACCOUNTS_JSON);

// Ambil akun pertama sebagai identitas utama untuk deployment/setup
const mainAccount = accounts[0];

// Siapkan array 'wallets' untuk semua kunci privat yang akan digunakan oleh worker
const wallets = accounts.map(acc => ({
  privateKey: acc.privateKey
}));

const networkConfig = {
  caliper: {
    blockchain: "ethereum",
  },
  ethereum: {
    url: process.env.NODE_URL,
    // fromAddress dan private key utama hanya untuk setup awal jika diperlukan
    fromAddress: mainAccount.address,
    fromAddressPrivateKey: mainAccount.privateKey,
    // 'wallets' digunakan untuk menyediakan identitas unik bagi setiap worker Caliper
    wallets: wallets,
    transactionConfirmationBlocks: parseInt(process.env.TX_CONFIRM_BLOCKS) || 2,
    contracts: contracts,
  },
};

// ... (logika untuk menulis file ke networks/ethereum-poa-config.json tetap sama) ...
try {
  fs.writeFileSync(
    "./networks/ethereum-poa-config.json",
    JSON.stringify(networkConfig, null, 2)
  );
  console.log(
    '\n✅ File "networks/ethereum-poa-config.json" untuk kontrak pre-deployed berhasil dibuat.'
  );
} catch (error) {
  console.error("\n❌ Gagal membuat file konfigurasi jaringan:", error);
  process.exit(1);
}
