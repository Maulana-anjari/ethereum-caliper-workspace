"use strict";

const { WorkloadModuleBase } = require("@hyperledger/caliper-core");
const { resolveAccounts } = require("./account-utils");

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

class LamBurnWorkload extends WorkloadModuleBase {
  constructor() {
    super();
    this.txIndex = 0;
    this.accounts = [];
    this.selectedAccount = undefined;
    this.contractInfo = undefined;
    this.nextTokenId = 0;
    this.maxTokenId = 0;
    this.tokenStride = 1;
    this.tokensExhausted = false;
    this.perWorkerLimit = null;
    this.tokensBurnedByWorker = 0;
    this.startTokenId = 1;
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

    this.selectedAccount = this.accounts[this.workerIndex % this.accounts.length];

    const perWorkerArg = Number(this.roundArguments.tokensPerWorker || 0);
    if (!Number.isNaN(perWorkerArg) && perWorkerArg > 0) {
      this.perWorkerLimit = perWorkerArg;
    }

    this.contractInfo = this.sutContext?.contracts?.SertifikatLam;
    if (!this.contractInfo || !this.contractInfo.contract) {
      throw new Error(
        "SertifikatLam contract metadata tidak ditemukan di context. Pastikan generate-network-config.js sudah dijalankan sebelum benchmark."
      );
    }

    this.startTokenId = Number(this.roundArguments.startTokenId || 1);
    if (!Number.isFinite(this.startTokenId) || this.startTokenId < 1) {
      this.startTokenId = 1;
    }

    const totalTokensRaw = await this.contractInfo.contract.methods
      .getTotalSertifikat()
      .call({ from: this.selectedAccount });
    const totalTokens = Number(totalTokensRaw);

    this.tokenStride = this.totalWorkers > 0 ? this.totalWorkers : 1;
    this.maxTokenId = totalTokens > 0 ? this.startTokenId + totalTokens - 1 : this.startTokenId - 1;
    this.nextTokenId = this.startTokenId + this.workerIndex;

    if (this.nextTokenId > this.maxTokenId) {
      this.tokensExhausted = true;
    }
  }

  async submitTransaction() {
    if (this.tokensExhausted || this.nextTokenId > this.maxTokenId) {
      this.tokensExhausted = true;
      await sleep(50);
      return;
    }

    if (this.perWorkerLimit && this.tokensBurnedByWorker >= this.perWorkerLimit) {
      this.tokensExhausted = true;
      await sleep(50);
      return;
    }

    const tokenId = this.nextTokenId;
    this.nextTokenId += this.tokenStride;
    this.tokensBurnedByWorker += 1;

    if (this.nextTokenId > this.maxTokenId || (this.perWorkerLimit && this.tokensBurnedByWorker >= this.perWorkerLimit)) {
      this.tokensExhausted = true;
    }

    const contractName = "SertifikatLam";
    const request = {
      contract: contractName,
      contractId: contractName,
      verb: "burn",
      args: [tokenId],
      readOnly: false,
      from: this.selectedAccount,
    };

    await this.sutAdapter.sendRequests(request);
  }
}

function createWorkloadModule() {
  return new LamBurnWorkload();
}

module.exports.createWorkloadModule = createWorkloadModule;
