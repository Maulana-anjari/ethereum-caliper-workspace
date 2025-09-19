// File: log-to-db.js
// Tujuan: Mem-parsing laporan HTML Caliper dan menyimpan hasilnya ke database PostgreSQL via Prisma.

const { PrismaClient } = require("@prisma/client");
const fs = require("fs");
const cheerio = require("cheerio");
const yaml = require("js-yaml");
const path = require("path");

const prisma = new PrismaClient();

/**
 * Helper to parse a string to a float, returning 0 if the result is NaN.
 * @param {string} str The string to parse.
 * @returns {number} The parsed float or 0.
 */
const parseFloatOrZero = (str) => {
  const value = parseFloat(str);
  return isNaN(value) ? 0 : value;
};

const roundNumber = (value, decimals = 4) => {
  if (value === null || value === undefined) return null;
  const factor = Math.pow(10, decimals);
  return Math.round(value * factor) / factor;
};

/**
 * Parse percentage values (e.g. "12.34%") into floats.
 * @param {string} raw Raw text from the table cell.
 * @returns {number|null} Percentage value without the percent sign.
 */
const parsePercentageValue = (raw) => {
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, "").trim();
  if (!cleaned || cleaned.toUpperCase() === "N/A") return null;
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  const numeric = parseFloat(match[0]);
  return isNaN(numeric) ? null : numeric;
};

/**
 * Convert memory/IO strings (e.g. "94.4MB", "6KB", "0B") into MB.
 * @param {string} raw Raw text from the table cell.
 * @returns {number|null} Value expressed in megabytes.
 */
const parseSizeToMB = (raw) => {
  if (!raw) return null;
  const cleaned = raw.replace(/,/g, "").trim();
  if (!cleaned || cleaned.toUpperCase() === "N/A") return null;
  const match = cleaned.match(/-?\d+(?:\.\d+)?/);
  if (!match) return null;
  let value = parseFloat(match[0]);
  if (isNaN(value)) return null;
  const lower = cleaned.toLowerCase();
  if (lower.includes("tb")) {
    value *= 1024 * 1024;
  } else if (lower.includes("gb")) {
    value *= 1024;
  } else if (lower.includes("mb")) {
    // already in MB
  } else if (lower.includes("kb")) {
    value /= 1024;
  } else if (lower.endsWith("b")) {
    value /= 1024 * 1024;
  }
  return value;
};

/**
 * Extract aggregated resource metrics (CPU, memory, disk IO) from the Caliper report.
 * @param {CheerioAPI} $ Cheerio instance for the report HTML.
 * @returns {{avgCpu: number|null, avgMemory: number|null, maxMemory: number|null, totalDiskReadMB: number|null, totalDiskWriteMB: number|null}}
 */
const extractResourceMetrics = ($) => {
  let cpuSum = 0;
  let cpuCount = 0;
  let avgMemSum = 0;
  let avgMemCount = 0;
  let maxMemory = 0;
  let diskReadTotal = 0;
  let diskWriteTotal = 0;

  $("table").each((_, table) => {
    const $table = $(table);
    const headers = $table
      .find("tr")
      .first()
      .find("th")
      .map((__, el) => $(el).text().trim())
      .get();

    if (headers.length === 0) return;
    const avgCpuIdx = headers.findIndex((h) => /cpu%\(avg\)/i.test(h));
    const maxMemIdx = headers.findIndex((h) => /memory\(max\)/i.test(h));
    const avgMemIdx = headers.findIndex((h) => /memory\(avg\)/i.test(h));
    const diskReadIdx = headers.findIndex((h) => /disc\s*read/i.test(h));
    const diskWriteIdx = headers.findIndex((h) => /disc\s*write/i.test(h));

    if (avgCpuIdx === -1 || maxMemIdx === -1) return; // Not a Docker resource table

    const rows = $table.find("tr").slice(1);
    rows.each((__, row) => {
      const cells = $(row).find("td");

      if (avgCpuIdx !== -1) {
        const cpu = parsePercentageValue($(cells[avgCpuIdx]).text());
        if (cpu !== null) {
          cpuSum += cpu;
          cpuCount += 1;
        }
      }

      if (avgMemIdx !== -1) {
        const memAvg = parseSizeToMB($(cells[avgMemIdx]).text());
        if (memAvg !== null) {
          avgMemSum += memAvg;
          avgMemCount += 1;
        }
      }

      if (maxMemIdx !== -1) {
        const memMax = parseSizeToMB($(cells[maxMemIdx]).text());
        if (memMax !== null && memMax > maxMemory) {
          maxMemory = memMax;
        }
      }

      if (diskReadIdx !== -1) {
        const diskRead = parseSizeToMB($(cells[diskReadIdx]).text());
        if (diskRead !== null) {
          diskReadTotal += diskRead;
        }
      }

      if (diskWriteIdx !== -1) {
        const diskWrite = parseSizeToMB($(cells[diskWriteIdx]).text());
        if (diskWrite !== null) {
          diskWriteTotal += diskWrite;
        }
      }
    });
  });

  return {
    avgCpu: cpuCount > 0 ? cpuSum / cpuCount : null,
    avgMemory: avgMemCount > 0 ? avgMemSum / avgMemCount : null,
    maxMemory: maxMemory > 0 ? maxMemory : null,
    totalDiskReadMB: diskReadTotal > 0 ? diskReadTotal : null,
    totalDiskWriteMB: diskWriteTotal > 0 ? diskWriteTotal : null,
  };
};

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
  const parsedBlockTime = parseInt(process.env.BLOCK_TIME, 10);
  const blockGasLimitEnv = process.env.BLOCK_GAS_LIMIT;

  const globalMetadata = {
    consensus: process.env.CONSENSUS,
    topology: process.env.TOPOLOGY,
    blockTime: Number.isNaN(parsedBlockTime) ? 0 : parsedBlockTime,
    blockGasLimit: blockGasLimitEnv ? BigInt(blockGasLimitEnv) : BigInt(0),
    trialNumber: parseInt(trialNumber, 10),
    variant: process.env.EXPERIMENT_VARIANT_LABEL || "default",
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
  const summaryTable = $("#benchmarksummary table");
  const tableRows = summaryTable.find("tr").slice(1);

  const headers = [];
  summaryTable
    .find("tr")
    .first()
    .find("th")
    .each((i, el) => headers.push($(el).text().trim()));
  const nameIndex = headers.findIndex((h) => h.startsWith("Name"));
  const succIndex = headers.findIndex((h) => h.startsWith("Succ"));
  const failIndex = headers.findIndex((h) => h.startsWith("Fail"));
  const throughputIndex = headers.findIndex((h) => h.startsWith("Throughput"));
  const avgLatencyIndex = headers.findIndex((h) => h.startsWith("Avg Latency"));
  const minLatencyIndex = headers.findIndex((h) => h.startsWith("Min Latency"));
  const maxLatencyIndex = headers.findIndex((h) => h.startsWith("Max Latency"));
  const durationIndex = headers.findIndex((h) => h.startsWith("Duration"));

  tableRows.each((index, element) => {
    const columns = $(element).find("td");
    const label = $(columns[nameIndex]).text().trim();

    const roundConfig = benchmarkConfig.test.rounds.find(
      (r) => r.label === label
    );
    if (!roundConfig) return;

    let duration = 0;
    if (durationIndex !== -1) {
      const durationStr = $(columns[durationIndex]).text().trim();
      duration = parseInt(durationStr.replace("s", ""), 10);
    } else if (roundConfig.txDuration) {
      duration = roundConfig.txDuration;
    }

    results.push({
      ...globalMetadata,
      scenarioId: label,
      rateController: roundConfig.rateControl.type,
      targetTPS: roundConfig.rateControl.opts.tps || 0,
      duration: duration,
      workload: path.basename(roundConfig.workload.module),
      workers: workers,
      success: parseInt($(columns[succIndex]).text().trim(), 10),
      fail: parseInt($(columns[failIndex]).text().trim(), 10),
      throughput: parseFloatOrZero($(columns[throughputIndex]).text().trim()),
      avgLatency: parseFloatOrZero($(columns[avgLatencyIndex]).text().trim()),
      minLatency: parseFloatOrZero($(columns[minLatencyIndex]).text().trim()),
      maxLatency: parseFloatOrZero($(columns[maxLatencyIndex]).text().trim()),
    });
  });

  const resourceMetrics = extractResourceMetrics($);

  const avgCpuValue = resourceMetrics.avgCpu ?? 0;
  const avgMemoryValue = resourceMetrics.avgMemory ?? null;
  const maxMemoryValue = resourceMetrics.maxMemory ?? 0;
  const diskReadValue = resourceMetrics.totalDiskReadMB ?? null;
  const diskWriteValue = resourceMetrics.totalDiskWriteMB ?? null;

  results.forEach((result) => {
    result.avgCPU = roundNumber(avgCpuValue, 4) ?? 0;
    result.avgMemory = roundNumber(avgMemoryValue, 4);
    result.maxMemory = roundNumber(maxMemoryValue, 4) ?? 0;
    result.totalDiskReadMB = roundNumber(diskReadValue, 4);
    result.totalDiskWriteMB = roundNumber(diskWriteValue, 4);
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
