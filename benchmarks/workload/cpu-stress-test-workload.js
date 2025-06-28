"use strict";

const { WorkloadModuleBase } = require("@hyperledger/caliper-core");

class CpuStressWorkload extends WorkloadModuleBase {
  constructor() {
    super();
  }

  async initializeWorkloadModule(
    workerIndex,
    totalWorkers,
    roundIndex,
    roundArguments,
    sutAdapter,
    sutContext
  ) {
    await super.initializeWorkloadModule(
      workerIndex,
      totalWorkers,
      roundIndex,
      roundArguments,
      sutAdapter,
      sutContext
    );
    if (!this.roundArguments.iterations) {
      throw new Error(`CPU Stress workload requires an 'iterations' argument.`);
    }
  }

  async submitTransaction() {
    const myArgs = {
      contractId: "cpu-stress-test",
      verb: "calculate",
      // Pass the number of iterations from the benchmark config file
      args: [this.roundArguments.iterations],
      readOnly: false,
    };

    await this.sutAdapter.sendRequests(myArgs);
  }
}

function createWorkloadModule() {
  return new CpuStressWorkload();
}

module.exports.createWorkloadModule = createWorkloadModule;
