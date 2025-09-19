"use strict";

const { WorkloadModuleBase } = require("@hyperledger/caliper-core");

class SimpleStorageWorkload extends WorkloadModuleBase {
  constructor() {
    super();
    this.txIndex = 0;
  }

  async submitTransaction() {
    this.txIndex++;
    const operation = this.roundArguments.operation;
    let request;

    if (operation === "set") {
      // Operasi tulis: menyimpan angka berdasarkan indeks transaksi
      const valueToSet = this.txIndex;
      request = {
        contractId: "SimpleStorage",
        verb: "set",
        args: [valueToSet],
        readOnly: false,
      };
    } else if (operation === "get") {
      // Operasi baca
      request = {
        contractId: "SimpleStorage",
        verb: "get",
        args: [],
        readOnly: true,
      };
    } else {
      throw new Error(`Unsupported operation: ${operation}`);
    }

    await this.sutAdapter.sendRequests(request);
  }
}

function createWorkloadModule() {
  return new SimpleStorageWorkload();
}

module.exports.createWorkloadModule = createWorkloadModule;
