#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

echo "=== [START] Caliper Automation Pipeline ==="

# --- Step 0: Setup Environment ---
echo ">> [0/7] Setting up environment..."
# Check if .env file exists, if not, copy it from the example
if [ ! -f .env ]; then
    echo ">> .env file not found. Copying from .env.example..."
    cp .env.example .env
    echo ">> Please fill out the .env file with your configuration and run again."
    exit 1
fi
# Load environment variables from .env file
export $(grep -v '^#' .env | xargs)
echo ">> Environment loaded from .env"

# --- Step 1: Copy Keystore ---
echo ">> [1/7] Copying keystore file..."
# The wildcard * handles the unique timestamp in the keystore filename
sudo cp ${KEYSTORE_SRC_PATH}* ./keystore_for_test.json
echo ">> Keystore copied to ./keystore_for_test.json"

# --- Step 2: Change Permissions ---
echo ">> [2/7] Setting file permissions..."
sudo chmod 644 ./keystore_for_test.json
echo ">> Permissions set to 644."

# --- Step 3 & 4: Get Private Key and Update .env ---
echo ">> [3/7] Running getPrivateKey.js to extract keys..."
# Run the script and capture its output
KEY_OUTPUT=$(node getPrivateKey.js ./keystore_for_test.json ${KEYSTORE_PASSWORD})

# Parse the output to get the address and private key
ADDRESS=$(echo "$KEY_OUTPUT" | grep "Address" | cut -d ':' -f 2 | tr -d ' ')
PRIVATE_KEY=$(echo "$KEY_OUTPUT" | grep "Private Key" | cut -d ':' -f 2 | tr -d ' ')

if [ -z "$PRIVATE_KEY" ]; then
    echo ">> [ERROR] Failed to extract private key. Aborting."
    exit 1
fi

echo ">> [4/7] Extracted keys successfully. Updating .env file..."
# Remove old ADDRESS and PRIVATE_KEY lines if they exist
sed -i '/^ADDRESS=/d' .env
sed -i '/^PRIVATE_KEY=/d' .env
# Append new keys to .env
echo "ADDRESS=${ADDRESS}" >> .env
echo "PRIVATE_KEY=${PRIVATE_KEY}" >> .env
echo ">> .env file updated."

# Reload the .env file to include the new variables
export $(grep -v '^#' .env | xargs)

# --- Step 5: Generate Network Config ---
echo ">> [5/7] Generating network configuration file..."
node generate-network-config.js
echo ">> networks/ethereum-poa-config.json has been generated."

# --- Step 6: Generate Benchmark Config ---
echo ">> [6/7] Generating benchmark configuration file..."
node generate-benchmark-config.js
echo ">> benchmarks/benchmark-config.yaml has been generated."

# --- Step 7: Run Caliper ---
echo ">> [7/7] All configurations are set. Launching Caliper..."
npx caliper launch manager \
    --caliper-workspace . \
    --caliper-networkconfig networks/ethereum-poa-config.json \
    --caliper-benchconfig benchmarks/benchmark-config.yaml \
    ${CALIPER_RUN_ARGS}

echo "=== [SUCCESS] Caliper benchmark finished. ==="