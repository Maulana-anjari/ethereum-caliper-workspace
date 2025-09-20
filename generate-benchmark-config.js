// File: generate-benchmark-config.js
// Tujuan: Membuat file benchmark .yaml secara dinamis berdasarkan skenario yang dipilih.

const fs = require("fs");
const path = require("path");
const yaml = require("js-yaml");

const PROM_PUSH_URL = process.env.PROMETHEUS_PUSH_URL || "http://caliper_pushgateway:9091";
const PROM_PUSH_JOB = process.env.PROMETHEUS_PUSH_JOB || "caliper-benchmark";

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
  let targetScenario = allScenarios.scenarios[args.scenario];
  let finalConfig;

  if (targetScenario) {
    if (args.scenario === "throughput-step") {
      const rounds = targetScenario.rounds.map((round) => ({
        label: round.id,
        description: `Minting NFT pada ${round.tps} TPS.`,
        txDuration: targetScenario.commonConfig.txDuration,
        rateControl: {
          type: targetScenario.commonConfig.rateControllerType,
          opts: { tps: round.tps },
        },
        workload: { module: targetScenario.commonConfig.workloadModule },
      }));
      finalConfig = {
        test: {
          name: `Scenario-${args.scenario}-Test`,
          description: targetScenario.description,
          workers: { number: targetScenario.commonConfig?.workers || 3 },
          rounds: rounds,
        },
      };
    } else if (targetScenario.rounds) {
      // Skenario dengan beberapa rounds terdefinisi (mixed-workload, worker-scale, certificate-lifecycle, dsb)
      const rounds = targetScenario.rounds.map((round) => {
        let tps = round.rateTps;
        if (tps === "OPTIMAL") {
          if (!args.optimalTps)
            throw new Error(`Skenario ${round.id} memerlukan --optimalTps.`);
          tps = parseInt(args.optimalTps);
        }

        return {
          label:
            round.label ||
            `${round.id}-${targetScenario.commonConfig?.labelPrefix || "test"}`,
          description: `Test untuk skenario ${round.id}`,
          txDuration:
            round.txDuration || targetScenario.commonConfig?.txDuration,
          rateControl: round.rateControl || {
            type: "fixed-rate",
            opts: { tps: tps },
          },
          workload: round.workload || {
            module: targetScenario.commonConfig.workloadModule,
          },
        };
      });

      const workerCount = targetScenario.rounds[0].workers || targetScenario.commonConfig?.workers || 3;

      finalConfig = {
        test: {
          name: `Scenario-${args.scenario}-Test`,
          description: targetScenario.description,
          workers: { number: workerCount },
          rounds: rounds,
        },
      };
    } else {
      // Logika untuk skenario single-round seperti A0
      finalConfig = {
        test: {
          name: `Scenario-${args.scenario}-Test`,
          description: targetScenario.description,
          workers: { number: targetScenario.workers || 3 },
          rounds: [
            {
              label: targetScenario.label,
              description: targetScenario.description,
              txDuration: targetScenario.txDuration,
              rateControl: targetScenario.rateControl,
              workload: targetScenario.workload,
            },
          ],
        },
      };
    }
  } else {
    // Mencari round tertentu dengan mencocokkan id pada setiap skenario
    let parentKey = null;
    let roundData = null;
    let parentScenario = null;

    for (const [key, scenario] of Object.entries(allScenarios.scenarios)) {
      if (!scenario.rounds) {
        continue;
      }
      const found = scenario.rounds.find((r) => r.id === args.scenario);
      if (found) {
        parentKey = key;
        parentScenario = scenario;
        roundData = found;
        break;
      }
    }

    if (parentScenario && roundData) {
      const common = parentScenario.commonConfig || {};
      let tps = roundData.rateTps || common.rateTps;
      if (tps === "OPTIMAL") {
        if (!args.optimalTps) {
          throw new Error(`Skenario ${args.scenario} memerlukan --optimalTps.`);
        }
        tps = parseInt(args.optimalTps);
      }

      const round = {
        label: roundData.label || roundData.id,
        description:
          roundData.description || `Round ${roundData.id} dari skenario ${parentKey}`,
        txDuration: roundData.txDuration || common.txDuration,
        rateControl:
          roundData.rateControl || {
            type: common.rateControllerType || "fixed-rate",
            opts: { tps: tps },
          },
        workload: roundData.workload || { module: common.workloadModule },
      };

      const workerCount =
        roundData.workers || common.workers || parentScenario.workers || 3;

      finalConfig = {
        test: {
          name: `Scenario-${parentKey}-${roundData.id}`,
          description:
            parentScenario.description || `Skema turunan dari ${parentKey}`,
          workers: { number: workerCount },
          rounds: [round],
        },
      };
    } else {
      throw new Error(
        `Skenario atau round "${args.scenario}" tidak ditemukan di scenarios.json`
      );
    }
  }

  // Tambahkan monitor ke semua konfigurasi
  const scenarioLabel = args.scenario || "unknown";
  const variantLabel = process.env.EXPERIMENT_VARIANT_LABEL || "default";
  const defaultMetricLabels = {
    job: PROM_PUSH_JOB,
    scenario: scenarioLabel,
    variant: variantLabel,
  };

  finalConfig.monitors = {
    transaction: [
      {
        module: "prometheus-push",
        options: {
          pushUrl: PROM_PUSH_URL,
          pushInterval: 5000,
          defaultLabels: defaultMetricLabels,
        },
      },
    ],
    resource: [
      {
        module: "docker",
        options: {
          interval: 1,
          containers: ["all"],
        },
        charting: {
          line: {
            metrics: ["CPU%(avg)", "Memory(avg)", "Disc Read", "Disc Write"],
          },
        },
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
