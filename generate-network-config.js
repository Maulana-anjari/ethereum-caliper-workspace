require("dotenv").config(); // Load variables from .env file
const fs = require("fs");

const config = {
  caliper: {
    blockchain: "ethereum",
  },
  ethereum: {
    url: "ws://localhost:8558", // Assuming this is constant for now
    contractDeployerAddress: process.env.ADDRESS,
    fromAddress: process.env.ADDRESS,
    contractDeployerAddressPrivateKey: process.env.PRIVATE_KEY,
    fromAddressPrivateKey: process.env.PRIVATE_KEY,
    transactionConfirmationBlocks: 2,
    contracts: {
      [process.env.CONTRACT_NAME]: {
        // Use contract name from .env
        path: process.env.CONTRACT_DEFINITION_PATH,
        gas: {
          // You might want to make these configurable in .env as well
          set: 80000,
          get: 50000,
        },
      },
    },
  },
};

fs.writeFileSync(
  "./networks/ethereum-poa-config.json",
  JSON.stringify(config, null, 2)
);
