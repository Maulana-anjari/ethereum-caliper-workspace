// File: generate-benchmark-config.js
// Tujuan: Membuat file benchmark .yaml secara dinamis berdasarkan skenario yang dipilih.

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

// --- Helper untuk mem-parsing argumen command line ---
const args = process.argv.slice(2).reduce((acc, arg) => {
  const [key, value] = arg.split("=");
  acc[key.replace("--", "")] = value;
  return acc;
}, {});

// --- Validasi Argumen ---
if (!args.scenario || !args.output) {
  console.error("❌ Error: Argumen --scenario dan --output wajib diisi.");
  console.error(
    "Contoh: node generate-benchmark-config.js --scenario=A --output=benchmarks/A.yaml"
  );
  process.exit(1);
}

// --- Logika Utama ---
try {
  // Baca file konfigurasi skenario utama
  const allScenarios = JSON.parse(fs.readFileSync("./scenarios.json", "utf8"));
  const targetScenario = allScenarios.scenarios[args.scenario];

  if (!targetScenario) {
    throw new Error(
      `Skenario "${args.scenario}" tidak ditemukan di scenarios.json`
    );
  }

  let finalConfig;

  // Logika untuk membangun konfigurasi berdasarkan tipe skenario
  if (args.scenario.startsWith("A") && args.scenario !== "A0") {
    // Untuk Grup A (A1-A4)
    const rounds = targetScenario.rounds.map((round) => ({
      label: round.id,
      description: `Test minting NFT dengan beban ${round.tps} TPS.`,
      txDuration: targetScenario.commonConfig.txDuration,
      rateControl: {
        type: targetScenario.commonConfig.rateControllerType,
        opts: { tps: round.tps },
      },
      workload: { module: targetScenario.commonConfig.workloadModule },
    }));
    finalConfig = {
      test: {
        name: `Scenario-A-Saturation-Test`,
        description: targetScenario.description,
        workers: { number: 3 }, // Asumsi 3 worker untuk tes ini
        rounds: rounds,
      },
    };
  } else {
    // Untuk Skenario B, C, dan A0
    const rounds = targetScenario.rounds.map((round) => {
      let tps = round.rateTps;
      // Ganti placeholder "OPTIMAL" dengan nilai yang diberikan
      if (tps === "OPTIMAL") {
        if (!args.optimalTps)
          throw new Error(`Skenario ${round.id} memerlukan --optimalTps.`);
        tps = parseInt(args.optimalTps);
      }

      return {
        label:
          round.label ||
          `${round.id}-${targetScenario.commonConfig.labelPrefix}`,
        description: `Test untuk skenario ${round.id}`,
        txDuration: round.txDuration || targetScenario.commonConfig.txDuration,
        rateControl: {
          type: round.rateController?.type || "fixed-rate",
          opts: round.rateController?.opts || { tps: tps },
        },
        workload: round.workload || {
          module: targetScenario.commonConfig.workloadModule,
        },
      };
    });

    const workerCount = targetScenario.rounds[0].workers || 3; // Ambil worker dari round pertama atau default 3

    finalConfig = {
      test: {
        name: `Scenario-${args.scenario}-Test`,
        description: targetScenario.description,
        workers: { number: workerCount },
        rounds: rounds,
      },
    };
  }

  // Tambahkan monitor ke semua konfigurasi
  finalConfig.monitors = {
    resource: [
      {
        module: "docker",
        options: { interval: 1, containers: ["all"] },
        charting: { bar: { metrics: ["all"] } },
      },
    ],
  };

  // Tulis ke file YAML
  fs.writeFileSync(args.output, yaml.dump(finalConfig));
  console.log(
    `✅ File benchmark "${args.output}" berhasil dibuat untuk skenario ${args.scenario}.`
  );
} catch (error) {
  console.error("❌ Gagal membuat file konfigurasi benchmark:", error);
  process.exit(1);
}
