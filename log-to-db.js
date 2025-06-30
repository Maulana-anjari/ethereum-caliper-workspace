// File: log-to-db.js
// Tujuan: Mem-parsing laporan HTML Caliper dan menyimpan hasilnya ke database PostgreSQL via Prisma.

const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const cheerio = require("cheerio");
const yaml = require("js-yaml");
const path = require("path");

const prisma = new PrismaClient();

/**
 * Fungsi utama untuk mem-parsing laporan dan menyimpan ke DB.
 * @param {string} reportPath Path ke file report.html.
 * @param {string} benchmarkConfigPath Path ke file benchmark .yaml yang digunakan.
 * @param {string} trialNumber Nomor urut uji coba.
 */
async function main(reportPath, benchmarkConfigPath, trialNumber) {
  // --- 1. Validasi Input ---
  if (!reportPath || !benchmarkConfigPath || !trialNumber) {
    throw new Error(
      "Path laporan, path konfigurasi benchmark, dan nomor uji coba harus disediakan."
    );
  }
  if (!fs.existsSync(reportPath)) {
    throw new Error(`File laporan tidak ditemukan di: ${reportPath}`);
  }
  if (!fs.existsSync(benchmarkConfigPath)) {
    throw new Error(
      `File konfigurasi benchmark tidak ditemukan di: ${benchmarkConfigPath}`
    );
  }

  console.log(`\n--- [DB Logger] Memproses laporan: ${reportPath} ---`);

  // 1. Baca data global dari .env
  const globalMetadata = {
    consensus: process.env.CONSENSUS,
    topology: process.env.TOPOLOGY,
    blockTime: parseInt(process.env.BLOCK_TIME, 10),
    blockGasLimit: BigInt(process.env.BLOCK_GAS_LIMIT),
    trialNumber: parseInt(trialNumber, 10),
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

    const roundConfig = benchmarkConfig.test.rounds.find(
      (r) => r.label === label
    );
    if (!roundConfig) return;

    results.push({
      ...globalMetadata,
      scenarioId: label,
      rateController: roundConfig.rateControl.type,
      targetTPS: roundConfig.rateControl.opts.tps || 0,
      duration: roundConfig.txDuration,
      workload: path.basename(roundConfig.workload.module),
      workers: workers,
      success: parseInt($(columns[succIndex]).text().trim(), 10),
      fail: parseInt($(columns[failIndex]).text().trim(), 10),
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
if (require.main === module) {
  // Ambil argumen dari command line
  const [reportPath, benchmarkConfigPath, trialNumber] = process.argv.slice(2);

  main(reportPath, benchmarkConfigPath, trialNumber)
    .catch((e) => {
      console.error("❌ Terjadi error dalam proses logging ke database:", e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
