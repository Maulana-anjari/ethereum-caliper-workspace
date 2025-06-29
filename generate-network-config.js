// File: generate-network-config.js
// Tujuan: Membuat file network config Caliper secara dinamis dari file .env

require("dotenv").config(); // Memuat semua variabel dari .env
const fs = require("fs");
const path = require("path");

console.log("Generating Caliper network configuration file...");

// Membangun daftar kontrak dari variabel .env
// Pola ini memungkinkan kita menambah kontrak baru hanya dengan mengubah .env
const contracts = {};
// Cari semua variabel .env yang cocok dengan pola CONTRACT_NAME_...
for (const key in process.env) {
  if (key.startsWith("CONTRACT_NAME_")) {
    const contractName = process.env[key];
    const contractSuffix = key.replace("CONTRACT_NAME_", "");
    const contractPathKey = `CONTRACT_DEFINITION_PATH_${contractSuffix}`;

    if (process.env[contractPathKey]) {
      contracts[contractName] = {
        path: process.env[contractPathKey],
      };
      console.log(`- Found and added contract: ${contractName}`);
    }
  }
}

// Struktur dasar dari file konfigurasi jaringan
const networkConfig = {
  caliper: {
    blockchain: "ethereum",
  },
  ethereum: {
    // Menggunakan URL dari .env atau fallback ke default jika tidak ada
    url: process.env.NODE_URL || "ws://localhost:8558",
    // Menggunakan kunci yang diekstrak oleh pipeline
    contractDeployerAddress: process.env.ADDRESS,
    fromAddress: process.env.ADDRESS,
    contractDeployerAddressPrivateKey: process.env.PRIVATE_KEY,
    fromAddressPrivateKey: process.env.PRIVATE_KEY,
    // Atur gas price secara eksplisit. Gunakan nilai yang cukup tinggi.
    // 1 Gwei (1,000,000,000 Wei) adalah nilai yang umum dan aman.
    gasPrice: 1000000000,
    // Jumlah blok konfirmasi sebelum transaksi dianggap final
    transactionConfirmationBlocks: 2,
    // Daftar kontrak yang sudah kita bangun secara dinamis
    contracts: contracts,
  },
};

try {
  // Pastikan direktori 'networks' ada
  if (!fs.existsSync("./networks")) {
    fs.mkdirSync("./networks");
  }
  // Tulis file konfigurasi
  fs.writeFileSync(
    "./networks/ethereum-poa-config.json",
    JSON.stringify(networkConfig, null, 2)
  );
  console.log('\n✅ File "networks/ethereum-poa-config.json" berhasil dibuat.');
} catch (error) {
  console.error("\n❌ Gagal membuat file konfigurasi jaringan:", error);
  process.exit(1);
}
