"use strict";

const { WorkloadModuleBase } = require("@hyperledger/caliper-core");

/**
 * Workload module for benchmarking read operations on the "Sertifikat" contract.
 * Each transaction calls the 'certificateNumbers' getter function.
 */
class ReadSertifikatWorkload extends WorkloadModuleBase {
  constructor() {
    super();
  }

  /**
   * Called once before the round begins.
   * Used here to check for necessary arguments.
   */
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

    if (
      !this.roundArguments.totalTokens ||
      this.roundArguments.totalTokens === 0
    ) {
      throw new Error(
        `Read workload requires 'totalTokens' argument > 0. Please run a minting round first.`
      );
    }
  }

  /**
   * Assemble and submit a read-only request.
   * @returns {Promise<any>}
   */
  async submitTransaction() {
    // Generate a random token ID to read, from 1 up to the total number of existing tokens.
    const randomTokenId =
      Math.floor(Math.random() * this.roundArguments.totalTokens) + 1;

    const myArgs = {
      contractId: "mint-certificate",
      verb: "certificateNumbers", // The auto-generated getter for the public mapping
      args: [randomTokenId],
      // This is a read-only operation
      readOnly: true,
    };

    await this.sutAdapter.sendRequests(myArgs);
  }
}

function createWorkloadModule() {
  return new ReadSertifikatWorkload();
}

module.exports.createWorkloadModule = createWorkloadModule;
