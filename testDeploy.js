// File: deploy.js (Versi Debugging v2)

const { ethers } = require("ethers");
const fs = require("fs");

const NODE_URL = "ws://localhost:8558";
const PRIVATE_KEY =
  "0x8ed153bcd1bbe25c7464e54cac1e8bee62e80ba32bb80fb5e1b1efdc19411008";
const CONTRACT_JSON_PATH = "./contracts/SimpleStorage.json";

async function main() {
  console.log("--- Memulai Skrip Deployment Mandiri (v2) ---");

  try {
    console.log(`[1/5] Membaca file kontrak dari: ${CONTRACT_JSON_PATH}`);
    const contractJson = JSON.parse(
      fs.readFileSync(CONTRACT_JSON_PATH, "utf8")
    );

    // --- LANGKAH DEBUGGING BARU ---
    console.log(
      ">> Kunci (keys) yang ditemukan dalam file JSON:",
      Object.keys(contractJson)
    );
    // ----------------------------

    // Ambil ABI dan bytecode
    const abi = contractJson.abi;
    // Coba tebak bytecode dari beberapa kemungkinan key yang umum
    const bytecode =
      contractJson.bytecode ||
      (contractJson.evm && contractJson.evm.bytecode
        ? contractJson.evm.bytecode.object
        : undefined) ||
      contractJson.data;

    // --- LANGKAH DEBUGGING BARU ---
    console.log(
      ">> Nilai bytecode yang akan digunakan:",
      bytecode
        ? bytecode.substring(0, 40) + "..."
        : "!!! UNDEFINED/TIDAK DITEMUKAN !!!"
    );
    // ----------------------------

    if (!bytecode || !abi) {
      throw new Error(
        "ABI atau bytecode tidak dapat ditemukan dalam file JSON. Periksa kunci (keys) di atas dan pastikan sudah benar."
      );
    }

    console.log(`[2/5] Menghubungkan ke node di: ${NODE_URL}`);
    const provider = new ethers.WebSocketProvider(NODE_URL);
    await provider.getNetwork();
    console.log(">> Berhasil terhubung ke node.");

    console.log("[3/5] Membuat wallet dari private key...");
    const wallet = new ethers.Wallet(PRIVATE_KEY, provider);
    console.log(">> Wallet berhasil dibuat untuk alamat:", wallet.address);

    console.log("[4/5] Mempersiapkan pabrik kontrak (ContractFactory)...");
    const contractFactory = new ethers.ContractFactory(abi, bytecode, wallet);
    console.log(">> Pabrik kontrak siap.");

    console.log("[5/5] Menerbitkan kontrak...");
    const contract = await contractFactory.deploy();
    await contract.waitForDeployment();

    console.log("\n✅ --- KONTRAK BERHASIL DITERBITKAN! --- ✅");
    console.log("Alamat Kontrak:", await contract.getAddress());
  } catch (error) {
    console.error("\n❌ --- TERJADI ERROR SAAT DEPLOYMENT --- ❌");
    console.error(error);
  } finally {
    process.exit(0);
  }
}

main();
