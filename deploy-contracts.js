
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

// Prefer the first account from ACCOUNTS_JSON (exported by run_pipeline.sh),
// fall back to PRIVATE_KEY from .env if ACCOUNTS_JSON is not provided.
let selectedPrivateKey = process.env.PRIVATE_KEY;
try {
  if (process.env.ACCOUNTS_JSON) {
    const accounts = JSON.parse(process.env.ACCOUNTS_JSON);
    if (Array.isArray(accounts) && accounts.length > 0 && accounts[0].privateKey) {
      selectedPrivateKey = accounts[0].privateKey;
    }
  }
} catch (e) {
  // If parsing fails, keep selectedPrivateKey as is.
}

if (!selectedPrivateKey) {
  throw new Error('No private key available. Set ACCOUNTS_JSON or PRIVATE_KEY in env.');
}

const wallet = new ethers.Wallet(selectedPrivateKey, provider);
const deployerAddress = wallet.address;
let workerAddresses = [];
try {
  if (process.env.ACCOUNTS_JSON) {
    const parsed = JSON.parse(process.env.ACCOUNTS_JSON);
    if (Array.isArray(parsed)) {
      workerAddresses = parsed
        .map((acc) => acc.address)
        .filter((addr) => typeof addr === 'string');
    }
  }
} catch (err) {
  console.warn('Warning: failed to parse ACCOUNTS_JSON. Continuing with deployer only.');
}
if (workerAddresses.length === 0) {
  workerAddresses = [deployerAddress];
}

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
  const SertifikatLam = JSON.parse(fs.readFileSync(path.join(__dirname, 'contracts/abi/SertifikatLam.json'), 'utf8'));
  const SertifikatLam = JSON.parse(fs.readFileSync(path.join(__dirname, 'contracts/abi/SertifikatLam.json'), 'utf8'));

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

  const feeData3 = await provider.getFeeData();
  const txOverrides3 = {};
  if (feeData3.gasPrice) {
      txOverrides3.gasPrice = feeData3.gasPrice;
  } else {
      txOverrides3.maxFeePerGas = feeData3.maxFeePerGas;
      txOverrides3.maxPriorityFeePerGas = feeData3.maxPriorityFeePerGas;
  }

  console.log('Deploying SertifikatLam...');
  const lamFactory = new ethers.ContractFactory(SertifikatLam.abi, SertifikatLam.bytecode, wallet);
  const lamContract = await lamFactory.deploy(txOverrides3);
  await lamContract.waitForDeployment();
  const lamAddress = await lamContract.getAddress();
  console.log('SertifikatLam deployed to:', lamAddress);

  // Ensure deployer and worker addresses are authorized as minters
  const lamContractInstance = lamContract.connect(wallet);
  const uniqueMinters = [...new Set(workerAddresses.map((addr) => addr.toLowerCase()))];
  console.log('Configuring SertifikatLam minters:', uniqueMinters);
  for (const minterLower of uniqueMinters) {
    const minter = ethers.getAddress(minterLower);
    const tx = await lamContractInstance.addMinter(minter, txOverrides3);
    await tx.wait();
  }

  console.log('SertifikatLam minter setup complete.');

  // Save the address to a file
  fs.writeFileSync(path.join(__dirname, 'deployed-contracts.json'), JSON.stringify({
    MintCertificate: mintAddress,
    CpuStressTest: cpuAddress,
    SertifikatLam: lamAddress
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
