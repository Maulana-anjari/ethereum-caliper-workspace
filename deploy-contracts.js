
const ethers = require('ethers');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const nodeUrl = process.env.NODE_URL || 'http://localhost:8545';
let provider;

if (nodeUrl.startsWith('ws')) {
  provider = new ethers.WebSocketProvider(nodeUrl);
} else {
  provider = new ethers.JsonRpcProvider(nodeUrl);
}
const wallet = new ethers.Wallet(process.env.PRIVATE_KEY, provider);

async function main() {
  console.log('Deploying contracts...');

  const feeData = await provider.getFeeData();
  const txOverrides = {};
  // Use legacy gasPrice if available, otherwise use EIP-1559 fees
  if (feeData.gasPrice) {
      txOverrides.gasPrice = feeData.gasPrice;
  } else {
      txOverrides.maxFeePerGas = feeData.maxFeePerGas;
      txOverrides.maxPriorityFeePerGas = feeData.maxPriorityFeePerGas;
  }

  const MintCertificate = JSON.parse(fs.readFileSync(path.join(__dirname, 'contracts/abi/MintCertificate.json'), 'utf8'));
  const CpuStressTest = JSON.parse(fs.readFileSync(path.join(__dirname, 'contracts/abi/CpuStressTest.json'), 'utf8'));

  console.log('Deploying MintCertificate...');
  const mintFactory = new ethers.ContractFactory(MintCertificate.abi, MintCertificate.bytecode, wallet);
  const mintContract = await mintFactory.deploy(txOverrides);
  await mintContract.waitForDeployment();
  const mintAddress = await mintContract.getAddress();
  console.log('MintCertificate deployed to:', mintAddress);

  // Re-fetch fee data for the second transaction to ensure it's current
  const feeData2 = await provider.getFeeData();
  const txOverrides2 = {};
  if (feeData2.gasPrice) {
      txOverrides2.gasPrice = feeData2.gasPrice;
  } else {
      txOverrides2.maxFeePerGas = feeData2.maxFeePerGas;
      txOverrides2.maxPriorityFeePerGas = feeData2.maxPriorityFeePerGas;
  }

  console.log('Deploying CpuStressTest...');
  const cpuFactory = new ethers.ContractFactory(CpuStressTest.abi, CpuStressTest.bytecode, wallet);
  const cpuContract = await cpuFactory.deploy(txOverrides2);
  await cpuContract.waitForDeployment();
  const cpuAddress = await cpuContract.getAddress();
  console.log('CpuStressTest deployed to:', cpuAddress);

  // Save the address to a file
  fs.writeFileSync(path.join(__dirname, 'deployed-contracts.json'), JSON.stringify({
    MintCertificate: mintAddress,
    CpuStressTest: cpuAddress
  }, null, 2));
}

main()
  .then(() => {
    if (provider.destroy) {
        provider.destroy();
    }
    process.exit(0);
  })
  .catch(error => {
    console.error(error);
    if (provider.destroy) {
        provider.destroy();
    }
    process.exit(1);
  });
