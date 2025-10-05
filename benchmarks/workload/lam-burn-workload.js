"use strict";

const { WorkloadModuleBase } = require("@hyperledger/caliper-core");
const { resolveAccounts } = require("./account-utils");

class LamBurnWorkload extends WorkloadModuleBase {
  constructor() {
    super();
    this.txIndex = 0;
    this.accounts = [];
    this.selectedAccount = undefined;
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

    this.accounts = await resolveAccounts(this.sutAdapter.web3, totalWorkers);
    if (this.accounts.length < totalWorkers) {
      throw new Error(
        `Worker ${this.workerIndex}: expected at least ${totalWorkers} funded accounts, but only ${this.accounts.length} are available for burning.`
      );
    }

    if (!this.roundArguments.tokensPerWorker || this.roundArguments.tokensPerWorker <= 0) {
      throw new Error(
        "Lam burn workload requires a 'tokensPerWorker' argument greater than 0."
      );
    }

    this.selectedAccount = this.accounts[this.workerIndex % this.accounts.length];
  }

  async submitTransaction() {
    this.txIndex++;
    const sender = this.selectedAccount;

    const startTokenId = this.roundArguments.startTokenId || 1;
    const tokensPerWorker = this.roundArguments.tokensPerWorker;
    const tokenId =
      startTokenId + tokensPerWorker * this.workerIndex + (this.txIndex - 1);

    const contractName = "SertifikatLam";
    const request = {
      contract: contractName,
      contractId: contractName,
      verb: "burn",
      args: [tokenId],
      readOnly: false,
      from: sender,
    };

    await this.sutAdapter.sendRequests(request);
  }
}

function createWorkloadModule() {
  return new LamBurnWorkload();
}

module.exports.createWorkloadModule = createWorkloadModule;
