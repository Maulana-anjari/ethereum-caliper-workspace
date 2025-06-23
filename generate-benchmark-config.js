require("dotenv").config();
const fs = require("fs");
const yaml = require("js-yaml");

let rounds = [];

// Logic to build rounds based on WORKLOAD_NAME from .env
if (process.env.WORKLOAD_NAME === "set-get") {
  rounds = [
    {
      label: "set-value",
      description: "Write a value to the storage contract.",
      txDuration: parseInt(process.env.ROUND_DURATION),
      rateControl: {
        type: "fixed-rate",
        opts: { tps: parseInt(process.env.RATE_CONTROLLER_TPS) },
      },
      workload: {
        module: process.env.WORKLOAD_MODULE_PATH,
        arguments: { operation: "set" },
      },
    },
    {
      label: "get-value",
      description: "Read a value from the storage contract.",
      txDuration: parseInt(process.env.ROUND_DURATION),
      rateControl: {
        type: "fixed-rate",
        opts: { tps: parseInt(process.env.RATE_CONTROLLER_TPS) },
      },
      workload: {
        module: process.env.WORKLOAD_MODULE_PATH,
        arguments: { operation: "get" },
      },
    },
  ];
}
// You can add more 'else if' blocks here for other workload types

const config = {
  test: {
    name: `${process.env.WORKLOAD_NAME}-benchmark`,
    description: `A benchmark for the ${process.env.CONTRACT_NAME} contract.`,
    workers: {
      number: parseInt(process.env.WORKER_COUNT),
    },
    rounds: rounds,
  },
};

fs.writeFileSync("./benchmarks/benchmark-config.yaml", yaml.dump(config));
