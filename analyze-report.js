// File: analyze-report.js
// Tujuan: Membaca report.html Caliper, mengekstrak data, dan menentukan TPS Optimal.

const fs = require("fs");
const path = require("path");
const cheerio = require("cheerio");

// --- PENGATURAN AMBANG BATAS (Bisa disesuaikan) ---
const THROUGHPUT_GAIN_THRESHOLD = 0.05; // Kenaikan throughput di bawah 5% dianggap stagnan
const LATENCY_PENALTY_THRESHOLD = 1.5; // Kenaikan latensi di atas 1.5x lipat dianggap signifikan
const OUTPUT_FILE = "optimal_tps.txt"; // Nama file output

// --- Logika Utama ---
function main() {
  const reportPath = process.argv[2];
  if (!reportPath) {
    console.error("\n❌ Error: Harap berikan path ke file report.html");
    console.error("Penggunaan: node analyze-report.js <path_ke_report.html>");
    process.exit(1);
  }

  if (!fs.existsSync(reportPath)) {
    console.error(`\n❌ Error: File tidak ditemukan di '${reportPath}'`);
    process.exit(1);
  }

  try {
    const htmlContent = fs.readFileSync(reportPath, "utf8");
    const $ = cheerio.load(htmlContent);
    const results = [];

    console.log(`\n--- Membaca dan Mem-parsing ${reportPath} ---`);

    const summaryTable = $('h2:contains("All test results")').next("table");
    if (summaryTable.length === 0) {
      throw new Error(
        'Tabel "All test results" tidak ditemukan di dalam laporan HTML.'
      );
    }

    const tableRows = summaryTable.find("tbody tr");

    const headers = [];
    summaryTable
      .find("thead th")
      .each((i, el) => headers.push($(el).text().trim()));

    const nameIndex = headers.findIndex((h) => h.startsWith("Name"));
    const throughputIndex = headers.findIndex((h) =>
      h.startsWith("Throughput")
    );
    const avgLatencyIndex = headers.findIndex((h) =>
      h.startsWith("Avg Latency")
    );

    tableRows.each((index, element) => {
      const columns = $(element).find("td");
      const label = $(columns[nameIndex]).text().trim();
      const tpsMatch = label.match(/(\d+)-tps/);

      if (label.startsWith("A") && tpsMatch) {
        results.push({
          Label: label,
          TargetTPS: parseFloat(tpsMatch[1]),
          Throughput: parseFloat($(columns[throughputIndex]).text().trim()),
          AvgLatency: parseFloat($(columns[avgLatencyIndex]).text().trim()),
        });
      }
    });

    if (results.length < 2) {
      throw new Error(
        "Data untuk Skenario A tidak cukup untuk dianalisis (perlu > 1 putaran)."
      );
    }

    results.sort((a, b) => a.TargetTPS - b.TargetTPS);

    console.log("\n--- Menganalisis Hasil Benchmark Skenario A ---");
    console.table(results);

    let optimalRun = results[results.length - 1];
    let reason =
      "Jaringan tidak pernah mencapai titik jenuh. Performa tertinggi ada di akhir.";

    for (let i = 0; i < results.length - 1; i++) {
      const currentRun = results[i];
      const nextRun = results[i + 1];

      if (currentRun.Throughput === 0) continue; // Hindari pembagian dengan nol

      const throughputGain =
        (nextRun.Throughput - currentRun.Throughput) / currentRun.Throughput;
      const latencyPenalty = nextRun.AvgLatency / currentRun.AvgLatency;

      console.log(
        `\nAnalisis: Dari ${currentRun.TargetTPS} TPS ke ${nextRun.TargetTPS} TPS`
      );
      console.log(
        `- Kenaikan Throughput: ${(throughputGain * 100).toFixed(2)}%`
      );
      console.log(`- Kenaikan Latensi: ${latencyPenalty.toFixed(2)}x lipat`);

      if (
        throughputGain < THROUGHPUT_GAIN_THRESHOLD ||
        latencyPenalty > LATENCY_PENALTY_THRESHOLD
      ) {
        optimalRun = currentRun;
        let reasons = [];
        if (throughputGain < THROUGHPUT_GAIN_THRESHOLD)
          reasons.push(
            `kenaikan throughput minimal (<${THROUGHPUT_GAIN_THRESHOLD * 100}%)`
          );
        if (latencyPenalty > LATENCY_PENALTY_THRESHOLD)
          reasons.push(
            `lonjakan latensi signifikan (>${LATENCY_PENALTY_THRESHOLD}x)`
          );
        reason = `Titik jenuh terdeteksi saat beralih ke ${
          nextRun.TargetTPS
        } TPS. Alasannya: ${reasons.join(" dan ")}.`;
        break;
      }
    }

    console.log("\n--- 🏁 Hasil Analisis Otomatis ---");
    console.log(
      `✅ TPS Optimal yang direkomendasikan adalah: ${optimalRun.TargetTPS}`
    );
    console.log(
      `   - Throughput yang Dicapai: ${optimalRun.Throughput.toFixed(2)} TPS`
    );
    console.log(
      `   - Latensi Rata-rata: ${optimalRun.AvgLatency.toFixed(2)} detik`
    );
    console.log(`\nAlasan: ${reason}`);

    fs.writeFileSync(OUTPUT_FILE, optimalRun.TargetTPS.toString());
    console.log(
      `\n📝 TPS Optimal (${optimalRun.TargetTPS}) berhasil disimpan di ${OUTPUT_FILE}`
    );
    console.log("------------------------------------");
  } catch (error) {
    console.error(
      "\n❌ Terjadi error saat memproses file laporan:",
      error.message
    );
    process.exit(1);
  }
}

main();
