"use strict";

const { WorkloadModuleBase } = require("@hyperledger/caliper-core");

class LamBurnWorkload extends WorkloadModuleBase {
  constructor() {
    super();
    this.txIndex = 0;
    this.accounts = [];
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

    this.accounts = await this.sutAdapter.web3.eth.getAccounts();
    if (this.accounts.length === 0) {
      throw new Error(
        `Worker ${this.workerIndex}: tidak menemukan akun untuk burn.`
      );
    }

    if (!this.roundArguments.tokensPerWorker || this.roundArguments.tokensPerWorker <= 0) {
      throw new Error(
        "Lam burn workload membutuhkan parameter 'tokensPerWorker' > 0."
      );
    }
  }

  async submitTransaction() {
    this.txIndex++;
    const sender = this.accounts[this.workerIndex % this.accounts.length];

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
