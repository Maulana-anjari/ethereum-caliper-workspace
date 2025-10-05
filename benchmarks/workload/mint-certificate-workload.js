"use strict";

const { WorkloadModuleBase } = require("@hyperledger/caliper-core");
const { resolveAccounts } = require("./account-utils");

/**
 * Workload module for benchmarking the minting of "Sertifikat" NFTs.
 * Each transaction calls the 'benchmarkMint' function.
 */
class MintSertifikatWorkload extends WorkloadModuleBase {
  constructor() {
    super();
    this.txIndex = 0;
    this.accounts = [];
    this.selectedAccount = undefined;
  }

  /**
   * Initializes the workload module.
   * @param {number} workerIndex The 0-based index of the worker instance.
   * @param {number} totalWorkers The total number of workers.
   * @param {number} roundIndex The 0-based index of the current round.
   * @param {object} roundArguments The user-provided arguments for the round from the benchmark configuration file.
   * @param {ConnectorBase} sutAdapter The adapter of the underlying SUT.
   * @param {object} sutContext The custom context object provided by the SUT adapter.
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
    this.accounts = await resolveAccounts(this.sutAdapter.web3, totalWorkers);
    if (this.accounts.length < totalWorkers) {
      throw new Error(
        `Worker ${this.workerIndex}: expected at least ${totalWorkers} funded accounts, but only ${this.accounts.length} are available.`
      );
    }

    this.selectedAccount = this.accounts[this.workerIndex % this.accounts.length];
  }

  /**
   * Assemble and submit a transaction for minting a new NFT.
   * @returns {Promise<any>}
   */
  async submitTransaction() {
    this.txIndex++;

    // Use an account from the list based on the worker's index
    const recipientAddress = this.selectedAccount;

    // Create a unique ID for each new token to ensure each transaction is unique.
    const uniqueId = this.workerIndex * 1000000 + this.txIndex;

    const contractName = "MintCertificate";
    const myArgs = {
      contract: contractName,
      contractId: contractName,
      verb: "benchmarkMint",
      args: [recipientAddress, uniqueId],
      readOnly: false,
      from: this.selectedAccount,
    };

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
