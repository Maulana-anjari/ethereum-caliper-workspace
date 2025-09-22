"use strict";

const { WorkloadModuleBase } = require("@hyperledger/caliper-core");

class LamReadWorkload extends WorkloadModuleBase {
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

    if (!this.roundArguments.totalTokens || this.roundArguments.totalTokens <= 0) {
      throw new Error(
        "Lam read workload membutuhkan parameter 'totalTokens' > 0. Jalankan ronde mint terlebih dahulu."
      );
    }
  }

  async submitTransaction() {
    const totalTokens = this.roundArguments.totalTokens;
    const randomTokenId =
      Math.floor(Math.random() * totalTokens) +
      (this.roundArguments.tokenIdOffset || 1);

    const contractName = "SertifikatLam";
    const request = {
      contract: contractName,
      contractId: contractName,
      verb: "getSertifikat",
      args: [randomTokenId],
      readOnly: true,
    };

    await this.sutAdapter.sendRequests(request);
  }
}

function createWorkloadModule() {
  return new LamReadWorkload();
}

module.exports.createWorkloadModule = createWorkloadModule;
