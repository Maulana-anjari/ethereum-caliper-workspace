"use strict";

const { WorkloadModuleBase } = require("@hyperledger/caliper-core");

class LamMintWorkload extends WorkloadModuleBase {
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
        `Worker ${this.workerIndex}: tidak menemukan akun untuk mengirim transaksi.`
      );
    }
  }

  async submitTransaction() {
    this.txIndex++;
    const sender = this.accounts[this.workerIndex % this.accounts.length];

    const batchId = this.roundArguments.batchId || "BATCH";
    const uniqueId = `${batchId}-${this.workerIndex}-${this.txIndex}`;

    const metadata = {
      codeUniv: this.roundArguments.codeUniv || "UNIV",
      codeProdi: `PRD-${this.workerIndex}-${this.txIndex}`,
      akreditasi: this.roundArguments.akreditasi || "A",
      mulaiBerlaku: this.roundArguments.mulaiBerlaku || "2024-01-01",
      akhirBerlaku: this.roundArguments.akhirBerlaku || "2029-12-31",
      skNumber: `SK-${uniqueId}`,
    };

    const uri = this.roundArguments.baseUri
      ? `${this.roundArguments.baseUri}/${uniqueId}`
      : `ipfs://metadata/${uniqueId}`;

    const args = [
      uri,
      metadata,
      sender,
    ];

    const request = {
      contractId: "SertifikatLam",
      verb: "mint",
      args,
      readOnly: false,
      from: sender,
    };

    await this.sutAdapter.sendRequests(request);
  }
}

function createWorkloadModule() {
  return new LamMintWorkload();
}

module.exports.createWorkloadModule = createWorkloadModule;
