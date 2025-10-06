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

const ENV_REFERENCE_PREFIX = 'ENV:';

const resolveEnvValue = (value, { asNumber = false } = {}) => {
  if (typeof value !== 'string' || !value.startsWith(ENV_REFERENCE_PREFIX)) {
    return value;
  }

  const [, envKey = '', fallback = ''] = value.split(':');
  if (!envKey) {
    throw new Error(`Format ENV reference tidak valid: ${value}`);
  }

  const envValue = process.env[envKey];
  const chosenRaw = envValue !== undefined && envValue !== '' ? envValue : fallback;

  if (chosenRaw === undefined || chosenRaw === '') {
    throw new Error(`ENV ${envKey} tidak diset dan tidak ada nilai default untuk ${value}`);
  }

  if (asNumber) {
    const numeric = Number(chosenRaw);
    if (Number.isNaN(numeric)) {
      throw new Error(`Nilai untuk ${envKey} harus numerik, dapat: ${chosenRaw}`);
    }
    return numeric;
  }

  const numericCandidate = Number(chosenRaw);
  if (!Number.isNaN(numericCandidate)) {
    return numericCandidate;
  }

  return chosenRaw;
};

const resolveEnvNumber = (value) => {
  if (typeof value === 'number') {
    return value;
  }
  return resolveEnvValue(value, { asNumber: true });
};

const resolveArgumentValues = (input) => {
  if (Array.isArray(input)) {
    return input.map((item) => resolveArgumentValues(item));
  }
  if (input && typeof input === 'object') {
    return Object.fromEntries(
      Object.entries(input).map(([key, val]) => [key, resolveArgumentValues(val)])
    );
  }
  return resolveEnvValue(input);
};

const normalizeWorkload = (workloadDefinition, fallbackModule) => {
  let cloned;
  if (workloadDefinition) {
    cloned = JSON.parse(JSON.stringify(workloadDefinition));
  } else {
    cloned = {};
  }

  if (!cloned.module && fallbackModule) {
    cloned.module = fallbackModule;
  }

  if (cloned.arguments) {
    cloned.arguments = resolveArgumentValues(cloned.arguments);
  }

  return cloned;
};

const normalizeRateControl = (rateControl = {}) => {
  const cloned = JSON.parse(JSON.stringify(rateControl));
  if (cloned.opts) {
    if (Object.prototype.hasOwnProperty.call(cloned.opts, 'tps')) {
      cloned.opts.tps = resolveEnvNumber(cloned.opts.tps);
    }
    if (Object.prototype.hasOwnProperty.call(cloned.opts, 'startTps')) {
      cloned.opts.startTps = resolveEnvNumber(cloned.opts.startTps);
    }
    if (Object.prototype.hasOwnProperty.call(cloned.opts, 'transactionLoad')) {
      cloned.opts.transactionLoad = resolveEnvNumber(cloned.opts.transactionLoad);
    }
  }
  return cloned;
};

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
        rateControl: normalizeRateControl({
          type: targetScenario.commonConfig.rateControllerType,
          opts: { tps: resolveEnvNumber(round.tps) },
        }),
        workload: normalizeWorkload(
          { module: targetScenario.commonConfig.workloadModule },
          targetScenario.commonConfig.workloadModule
        ),
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
        if (typeof tps === "string") {
          tps = resolveEnvNumber(tps);
        }

        const rateControl = round.rateControl
          ? normalizeRateControl(round.rateControl)
          : normalizeRateControl({
              type: "fixed-rate",
              opts: { tps: tps },
            });

        return {
          label:
            round.label ||
            `${round.id}-${targetScenario.commonConfig?.labelPrefix || "test"}`,
          description: `Test untuk skenario ${round.id}`,
          txDuration:
            round.txDuration || targetScenario.commonConfig?.txDuration,
          rateControl,
          workload: normalizeWorkload(
            round.workload,
            targetScenario.commonConfig.workloadModule
          ),
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
              rateControl: normalizeRateControl(targetScenario.rateControl),
              workload: normalizeWorkload(
                targetScenario.workload,
                (targetScenario.workload && targetScenario.workload.module) ||
                  (targetScenario.commonConfig && targetScenario.commonConfig.workloadModule)
              ),
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
      if (typeof tps === "string") {
        tps = resolveEnvNumber(tps);
      }

      const round = {
        label: roundData.label || roundData.id,
        description:
          roundData.description || `Round ${roundData.id} dari skenario ${parentKey}`,
        txDuration: roundData.txDuration || common.txDuration,
        rateControl: roundData.rateControl
          ? normalizeRateControl(roundData.rateControl)
          : normalizeRateControl({
              type: common.rateControllerType || "fixed-rate",
              opts: { tps: tps },
            }),
        workload: normalizeWorkload(roundData.workload, common.workloadModule),
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
