"use strict";

const { WorkloadModuleBase } = require("@hyperledger/caliper-core");
const { resolveAccounts } = require("./account-utils");

class LamMintWorkload extends WorkloadModuleBase {
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
        `Worker ${this.workerIndex}: expected at least ${totalWorkers} funded accounts, but only ${this.accounts.length} are available for minting.`
      );
    }

    this.selectedAccount = this.accounts[this.workerIndex % this.accounts.length];
  }

  async submitTransaction() {
    this.txIndex++;
    const sender = this.selectedAccount;

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

    const contractName = "SertifikatLam";
    const request = {
      contract: contractName,
      contractId: contractName,
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
