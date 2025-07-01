#!/bin/bash

# Exit immediately if a command exits with a non-zero status.
set -e

# --- ANSI Color Codes ---
C_BLUE='\033[1;34m'
C_GREEN='\033[1;32m'
C_RED='\033[1;31m'
C_YELLOW='\033[1;33m'
C_CYAN='\033[1;36m'
C_NC='\033[0m' # No Color

# --- Helper Functions ---
log_step() {
    echo -e "\n${C_BLUE}=======================================================${C_NC}"
    echo -e "${C_BLUE}===== PHASE: $1 ${C_NC}"
    echo -e "${C_BLUE}=======================================================${C_NC}"
}
log_action() {
    echo -e "${C_YELLOW}  -> $1...${C_NC}"
}
log_success() {
    echo -e "${C_GREEN}  ✅ $1${C_NC}"
}
log_error() {
    echo -e "${C_RED}  ❌ ERROR: $1${C_NC}"
    exit 1
}
log_info() {
    echo -e "${C_CYAN}  ℹ️  $1${C_NC}"
}

# ==============================================================================
#                                MAIN PIPELINE
# ==============================================================================

echo -e "${C_CYAN}=======================================================${C_NC}"
echo -e "${C_CYAN}      Caliper Benchmark Automation Pipeline        ${C_NC}"
echo -e "${C_GREEN}      By Maulana Anjari Anggorokasih        ${C_NC}"
echo -e "${C_CYAN}=======================================================${C_NC}"

# --- PHASE 0: SETUP & INITIALIZATION ---
log_step "SETUP & INITIALIZATION"

log_action "Checking for .env file"
if [ ! -f .env ]; then
    log_action ".env not found, copying from .env.example"
    cp .env.example .env
    log_error "Please fill out the .env file and run again."
fi
export $(grep -v '^#' .env | xargs)
log_success "Environment loaded from .env"

log_action "Cleaning up old reports and creating directory"
rm -rf reports
mkdir -p reports
log_success "Directory 'reports' is clean and ready."

log_action "Starting PostgreSQL database via Docker Compose"
docker-compose up -d --build > /dev/null 2>&1
log_success "PostgreSQL database is running"

# --- PHASE 1: KEY EXTRACTION & CONFIGURATION ---
log_step "KEY EXTRACTION & CONFIGURATION"

log_action "Finding and preparing keystore for key extraction"
KEYSTORE_SRC_DIR="${KEYSTORE_SRC_PATH}"
TEMP_KEYSTORE_DIR="./temp_keystore"

if [ ! -d "$KEYSTORE_SRC_DIR" ]; then
    log_error "Source keystore directory not found in '${KEYSTORE_SRC_DIR}'"
fi

# Create a temporary directory for keystore files
rm -rf "${TEMP_KEYSTORE_DIR}"
mkdir -p "${TEMP_KEYSTORE_DIR}"

# Copy keystore files using sudo and change permissions
log_action "Copying keystore files to a temporary location"
sudo cp "${KEYSTORE_SRC_DIR}"/UTC--* "${TEMP_KEYSTORE_DIR}/"
sudo chmod 644 "${TEMP_KEYSTORE_DIR}"/UTC--*
log_success "Keystore files are ready in a temporary directory."

log_action "Extracting all addresses & private keys"
ACCOUNTS_JSON=$(node getPrivateKey.js "${TEMP_KEYSTORE_DIR}" "${KEYSTORE_PASSWORD}")
if [ -z "$ACCOUNTS_JSON" ]; then
    # Clean up temp dir before exiting on error
    rm -rf "${TEMP_KEYSTORE_DIR}"
    log_error "Failed to extract private keys"
fi

# Clean up the temporary keystore directory immediately after use
rm -rf "${TEMP_KEYSTORE_DIR}"
log_success "Cleaned up temporary keystore files."

# Ekstrak alamat utama (pertama) untuk deployment
MAIN_ADDRESS=$(echo "$ACCOUNTS_JSON" | jq -r '.[0].address')
MAIN_PRIVATE_KEY=$(echo "$ACCOUNTS_JSON" | jq -r '.[0].privateKey')

sed -i '/^ACCOUNTS_JSON=/d' .env
sed -i '/^ADDRESS=/d' .env
sed -i '/^PRIVATE_KEY=/d' .env
echo "" >> .env
echo "ACCOUNTS_JSON='${ACCOUNTS_JSON}'" >> .env
echo "ADDRESS=${MAIN_ADDRESS}" >> .env
echo "PRIVATE_KEY=${MAIN_PRIVATE_KEY}" >> .env
# Export the new main address and key directly for subsequent script steps
export ACCOUNTS_JSON=${ACCOUNTS_JSON} # Ekspor variabel agar tersedia di sub-shell
export ADDRESS=${MAIN_ADDRESS}
export PRIVATE_KEY=${MAIN_PRIVATE_KEY}

log_success "Extracted all keys and updated .env file"
log_info "Total accounts found: $(echo "$ACCOUNTS_JSON" | jq 'length')"
log_info "Main address for deployment: ${MAIN_ADDRESS}"

log_step "CONTRACT DEPLOYMENT & NETWORK CONFIG"

log_action "Deleting old deployed contracts json"
rm -f ./deployed-contracts.json
log_success "Old deployed contracts json removed."

log_action "Deploying contracts via custom script"
node deploy-contracts.js
log_success "Contracts deployed, addresses saved to deployed-contracts.json."

log_action "Deleting old network config to ensure regeneration"
rm -f ./networks/ethereum-poa-config.json
log_success "Old network config removed."

log_action "Generating new network configuration for pre-deployed contracts"
node generate-network-config.js
log_success "Network config generated."

# --- Generic function to run a benchmark set ---
run_benchmark_set() {
    local SCENARIO_ID=$1
    local BENCHMARK_CONFIG_FILE=$2
    local OPTIMAL_TPS_ARG=$3
    local TRIAL_NUM_ARG=$4
    
    local REPORT_PATH="reports/report-${SCENARIO_ID}-trial-${TRIAL_NUM_ARG}.html"
    
    log_action "Generating benchmark config for ${C_CYAN}${SCENARIO_ID}${C_YELLOW}"
    node generate-benchmark-config.js --scenario=${SCENARIO_ID} --output=${BENCHMARK_CONFIG_FILE} ${OPTIMAL_TPS_ARG}

    log_action "Launching Caliper for ${C_CYAN}${SCENARIO_ID}${C_YELLOW} (Trial ${TRIAL_NUM_ARG}). Report will be at ${C_CYAN}${REPORT_PATH}${C_YELLOW}"
    npx caliper launch manager \
        --caliper-workspace . \
        --caliper-networkconfig networks/ethereum-poa-config.json \
        --caliper-benchconfig ${BENCHMARK_CONFIG_FILE} \
        --caliper-report-path ${REPORT_PATH} \
        --caliper-flow-skip-install \
        ${CALIPER_RUN_ARGS}

    log_action "Logging results from ${C_CYAN}${REPORT_PATH}${C_YELLOW} to database"
    node log-to-db.js "${REPORT_PATH}" "${BENCHMARK_CONFIG_FILE}" "${TRIAL_NUM_ARG}"
}

# --- PHASE 2: EXPLORATORY RUN (SCENARIO A) ---
log_step "EXPLORATORY RUN (SCENARIO A)"
run_benchmark_set "A" "benchmarks/A-benchmark.yaml" "" "1"
log_action "Analyzing Scenario A report to find Optimal TPS"
# Note: The report name is now predictable based on the function above
node analyze-report.js "reports/report-A-trial-1.html"
OPTIMAL_TPS=$(cat optimal_tps.txt)
log_success "Optimal TPS found: ${OPTIMAL_TPS}"


# --- PHASE 3: CORE & SCALABILITY RUNS ---
log_step "CORE & SCALABILITY RUNS"
NUM_TRIALS=${NUM_TRIALS:-3}
log_info "Starting ${NUM_TRIALS} trials for core scenarios..."

for i in $(seq 1 $NUM_TRIALS); do
    log_info "--- Starting Trial #$i of $NUM_TRIALS ---"
    OPTIMAL_TPS_ARG="--optimalTps=${OPTIMAL_TPS}"
    
    run_benchmark_set "B" "benchmarks/B-benchmark.yaml" "${OPTIMAL_TPS_ARG}" "$i"
    run_benchmark_set "C1" "benchmarks/C1-benchmark.yaml" "${OPTIMAL_TPS_ARG}" "$i"
    run_benchmark_set "C2" "benchmarks/C2-benchmark.yaml" "${OPTIMAL_TPS_ARG}" "$i"
    run_benchmark_set "A0" "benchmarks/A0-benchmark.yaml" "" "$i"
done

log_step "PIPELINE FINISHED"
echo -e "${C_GREEN}=======================================================${C_NC}"
echo -e "${C_GREEN}  All benchmark scenarios completed successfully.      ${C_NC}"
echo -e "${C_GREEN}  Reports are available in the 'reports/' directory.   ${C_NC}"
echo -e "${C_GREEN}  Data has been logged to the PostgreSQL database.     ${C_NC}"
echo -e "${C_GREEN}=======================================================${C_NC}"
