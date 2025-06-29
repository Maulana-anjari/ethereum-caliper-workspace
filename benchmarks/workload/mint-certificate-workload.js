"use strict";

const { WorkloadModuleBase } = require("@hyperledger/caliper-core");

/**
 * Workload module for benchmarking the minting of "Sertifikat" NFTs.
 * Each transaction calls the 'benchmarkMint' function.
 */
class MintSertifikatWorkload extends WorkloadModuleBase {
  constructor() {
    super();
    this.txIndex = 0;
  }

  /**
   * Assemble and submit a transaction for minting a new NFT.
   * @returns {Promise<any>}
   */
  async submitTransaction() {
    this.txIndex++;

    // Get the address of the current worker to use as the recipient.
    const recipientAddress = this.worker.getAddress();

    // Create a unique ID for each new token to ensure each transaction is unique.
    // We combine the worker index with the transaction index for global uniqueness.
    const uniqueId = this.workerIndex * 1000000 + this.txIndex;

    const myArgs = {
      // The contract ID as defined in the benchmark config's 'contracts' section
      contractId: "MintCertificate",
      // The function to call in the smart contract
      verb: "benchmarkMint",
      // Arguments to pass to the function
      args: [recipientAddress, uniqueId],
      // This is a write transaction, so readOnly is false
      readOnly: false,
    };

    // Submit the transaction to the SUT (System Under Test)
    await this.sutAdapter.sendRequests(myArgs);
  }
}

/**
 * Create a new instance of the workload module.
 * @returns {WorkloadModuleBase}
 */
function createWorkloadModule() {
  return new MintSertifikatWorkload();
}

module.exports.createWorkloadModule = createWorkloadModule;
