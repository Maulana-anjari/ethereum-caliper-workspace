// File: log-to-db.js
// Tujuan: Mem-parsing laporan HTML Caliper dan menyimpan hasilnya ke database PostgreSQL via Prisma.

// Mengimpor library yang diperlukan
const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const cheerio = require("cheerio");
const yaml = require("js-yaml");

// Inisialisasi Prisma Client
const prisma = new PrismaClient();

/**
 * Fungsi utama untuk mem-parsing laporan dan menyimpan ke DB.
 * @param {string} reportPath Path ke file report.html.
 * @param {object} metadata Objek berisi metadata eksperimen (konsensus, topologi, dll.).
 */
async function main(reportPath, metadata) {
  // --- 1. Validasi Input ---
  if (!reportPath || !metadata) {
    throw new Error("Path laporan dan metadata eksperimen harus disediakan.");
  }
  if (!fs.existsSync(reportPath)) {
    throw new Error(`File laporan tidak ditemukan di: ${reportPath}`);
  }

  console.log(`\n--- [DB Logger] Memproses laporan: ${reportPath} ---`);
  // 1. Baca data global dari .env
  const globalMetadata = {
    consensus: process.env.CONSENSUS,
    topology: process.env.TOPOLOGY,
    blockTime: parseInt(process.env.BLOCK_TIME),
    blockGasLimit: BigInt(process.env.BLOCK_GAS_LIMIT),
    trialNumber: parseInt(trialNumber),
  };

  // 2. Baca data benchmark dari file YAML
  const benchmarkConfig = yaml.load(
    fs.readFileSync(benchmarkConfigPath, "utf8")
  );
  const workers = benchmarkConfig.test.workers.number;

  // 3. Baca hasil performa dari file HTML
  const htmlContent = fs.readFileSync(reportPath, "utf8");
  const $ = cheerio.load(htmlContent);
  const results = [];
  const summaryTable = $('h2:contains("All test results")').next("table");
  const tableRows = summaryTable.find("tbody tr");

  // ... (Logika parsing header dan kolom dari versi sebelumnya) ...
  // (Untuk singkatnya, logika parsing diasumsikan sama seperti skrip analyze-report.js sebelumnya)
  const headers = [];
  summaryTable
    .find("thead th")
    .each((i, el) => headers.push($(el).text().trim()));
  const nameIndex = headers.findIndex((h) => h.startsWith("Name"));
  const succIndex = headers.findIndex((h) => h.startsWith("Succ"));
  const failIndex = headers.findIndex((h) => h.startsWith("Fail"));
  const throughputIndex = headers.findIndex((h) => h.startsWith("Throughput"));
  const avgLatencyIndex = headers.findIndex((h) => h.startsWith("Avg Latency"));
  const minLatencyIndex = headers.findIndex((h) => h.startsWith("Min Latency"));
  const maxLatencyIndex = headers.findIndex((h) => h.startsWith("Max Latency"));

  tableRows.each((index, element) => {
    const columns = $(element).find("td");
    const label = $(columns[nameIndex]).text().trim();

    // Cari round yang cocok di file YAML untuk mendapatkan detailnya
    const roundConfig = benchmarkConfig.test.rounds.find(
      (r) => r.label === label
    );
    if (!roundConfig) return;

    results.push({
      ...globalMetadata, // Gabungkan metadata global
      // Parameter dari file YAML
      scenarioId: label,
      rateController: roundConfig.rateControl.type,
      targetTPS: roundConfig.rateControl.opts.tps || 0,
      duration: roundConfig.txDuration,
      workload: path.basename(roundConfig.workload.module),
      workers: workers,
      // Hasil dari laporan HTML
      success: parseInt($(columns[succIndex]).text().trim()),
      fail: parseInt($(columns[failIndex]).text().trim()),
      throughput: parseFloat($(columns[throughputIndex]).text().trim()),
      avgLatency: parseFloat($(columns[avgLatencyIndex]).text().trim()),
      minLatency: parseFloat($(columns[minLatencyIndex]).text().trim()),
      maxLatency: parseFloat($(columns[maxLatencyIndex]).text().trim()),
    });
  });

  // 4. Simpan ke database
  for (const result of results) {
    await prisma.experimentResult.create({ data: result });
  }

  console.log("✅ Semua data dari laporan berhasil dimasukkan ke database.");
}

// --- Logika untuk Menjalankan Skrip dari Command Line ---

// Ambil argumen dari command line
const args = process.argv.slice(2);
// Contoh: node log-to-db.js ./reports/report-A.html PoA 3S-1NS 15 8000000 1
const [, , reportPath, benchmarkConfigPath, trialNumber] = args;

main(reportPath, benchmarkConfigPath, trialNumber)
  .catch((e) => {
    console.error("❌ Terjadi error dalam proses logging ke database:", e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
