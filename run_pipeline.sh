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
#                           PIPELINE CONFIGURATION
# ==============================================================================
# Add or remove scenarios from this list to control which benchmarks are run
# during the main trials.
#   - A:  Exploratory run to find optimal TPS. Always runs first.
#   - B:  Measures different workload types (read, write, etc.).
#   - C1: Measures scalability with 1 worker.
#   - C2: Measures scalability with 5 workers.
#   - A0: Baseline with a fixed, low-load rate.
CORE_SCENARIOS=("A0")


# ==============================================================================
#                                MAIN PIPELINE
# ==============================================================================

echo -e "${C_CYAN}=======================================================${C_NC}"
echo -e "${C_CYAN}      Caliper Benchmark Automation Pipeline        ${C_NC}"
echo -e "${C_GREEN}      By Maulana Anjari Anggorokasih        ${C_NC}"
echo -e "${C_CYan}=======================================================${C_NC}"

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

# --- Define Network Config Path ---
# Convert CONSENSUS to lowercase for filename consistency.
CONSENSUS_LOWER=$(echo "$CONSENSUS" | tr '[:upper:]' '[:lower:]')
if [ -z "$CONSENSUS_LOWER" ]; then
    NETWORK_CONFIG_FILE="ethereum-config.json"
else
    NETWORK_CONFIG_FILE="ethereum-${CONSENSUS_LOWER}-config.json"
fi
NETWORK_CONFIG_PATH="./networks/${NETWORK_CONFIG_FILE}"
log_info "Network config path set to: ${NETWORK_CONFIG_PATH}"

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

# The keystore directory is often protected, so we use sudo to copy the
# files to a temporary, accessible location. We then change permissions
# to ensure the 'getPrivateKey.js' script can read them.
log_action "Copying keystore files to a temporary location (requires sudo)"
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

# Extract the main address (the first one) for contract deployment.
MAIN_ADDRESS=$(echo "$ACCOUNTS_JSON" | jq -r '.[0].address')
MAIN_PRIVATE_KEY=$(echo "$ACCOUNTS_JSON" | jq -r '.[0].privateKey')

log_action "Updating .env file with extracted account information"
# Remove old entries and append new ones to avoid duplicates.
# The entire ACCOUNTS_JSON is stored for use in network configuration.
sed -i -e '/^ACCOUNTS_JSON=/d' -e '/^ADDRESS=/d' -e '/^PRIVATE_KEY=/d' .env
{
    echo ""
    echo "ACCOUNTS_JSON='${ACCOUNTS_JSON}'"
    echo "ADDRESS=${MAIN_ADDRESS}"
    echo "PRIVATE_KEY=${MAIN_PRIVATE_KEY}"
} >> .env

# Export these variables to make them available to subsequent commands in this script.
export ACCOUNTS_JSON
export ADDRESS
export PRIVATE_KEY

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
rm -f ${NETWORK_CONFIG_PATH}
log_success "Old network config removed."

log_action "Generating new network configuration for pre-deployed contracts"
node generate-network-config.js
log_success "Network config generated."

# --- Function to run a benchmark set ---
# ARGS:
#   $1: SCENARIO_ID (e.g., "A", "B")
#   $2: BENCHMARK_CONFIG_FILE (e.g., "benchmarks/A-benchmark.yaml")
#   $3: OPTIMAL_TPS_ARG (e.g., "--optimalTps=100", or "")
#   $4: TRIAL_NUM_ARG (e.g., "1", "2")
run_benchmark_set() {
    local SCENARIO_ID=$1
    local BENCHMARK_CONFIG_FILE=$2
    local OPTIMAL_TPS_ARG=$3
    local TRIAL_NUM_ARG=$4

    local REPORT_PATH="reports/report-${SCENARIO_ID}-trial-${TRIAL_NUM_ARG}.html"
    local LOG_PATH="reports/report-${SCENARIO_ID}-trial-${TRIAL_NUM_ARG}.log"

    log_action "Generating benchmark config for ${C_CYAN}${SCENARIO_ID}${C_NC}"
    node generate-benchmark-config.js --scenario=${SCENARIO_ID} --output=${BENCHMARK_CONFIG_FILE} ${OPTIMAL_TPS_ARG}

    log_action "Launching Caliper for ${C_CYAN}${SCENARIO_ID}${C_NC} (Trial ${C_CYAN}${TRIAL_NUM_ARG}${C_NC})"
    log_info "Report will be at: ${C_CYAN}${REPORT_PATH}${C_NC}"
    log_info "Logs will be saved to: ${C_CYAN}${LOG_PATH}${C_NC}"

    # --- Progress Indicator ---
    local progress_chars="/-\\\""
    local i=0
    (
        npx caliper launch manager \
            --caliper-workspace . \
            --caliper-networkconfig ${NETWORK_CONFIG_PATH} \
            --caliper-benchconfig ${BENCHMARK_CONFIG_FILE} \
            --caliper-report-path ${REPORT_PATH} \
            --caliper-flow-skip-install \
            ${CALIPER_RUN_ARGS} > "${LOG_PATH}" 2>&1
    ) &
    local caliper_pid=$!

    local start_time=$SECONDS
    echo -n "  "
    while ps -p $caliper_pid > /dev/null; do
        i=$(( (i+1) %4 ))
        local elapsed_time=$(( SECONDS - start_time ))
        echo -ne "\r  ${C_YELLOW}⏳ Benchmarking in progress... ${progress_chars:$i:1} (${elapsed_time}s)${C_NC}"
        sleep 1
    done
    echo -ne "\r\033[K"

    # Wait for the Caliper process to finish and check its exit code
    if ! wait $caliper_pid; then
        log_error "Caliper benchmark FAILED for ${SCENARIO_ID} (Trial ${TRIAL_NUM_ARG})."
        echo -e "${C_RED}Dumping logs from ${LOG_PATH}:${C_NC}\n"
        cat "${LOG_PATH}"
        exit 1
    fi

    log_success "Benchmark ${SCENARIO_ID} (Trial ${TRIAL_NUM_ARG}) completed."

    log_action "Logging results from ${C_CYAN}${REPORT_PATH}${C_NC} to database"
    node log-to-db.js "${REPORT_PATH}" "${BENCHMARK_CONFIG_FILE}" "${TRIAL_NUM_ARG}"
}


# --- PHASE 2: EXPLORATORY RUN (SCENARIO A) ---
log_step "EXPLORATORY RUN (SCENARIO A)"
# run_benchmark_set "A" "benchmarks/A-benchmark.yaml" "" "1"
log_action "Analyzing Scenario A report to find Optimal TPS"
# Note: The report name is now predictable based on the function above
# node analyze-report.js "reports/report-A-trial-1.html"
OPTIMAL_TPS=$(cat optimal_tps.txt)
log_success "Optimal TPS found: ${OPTIMAL_TPS}"


# --- PHASE 3: CORE & SCALABILITY RUNS ---
log_step "CORE & SCALABILITY RUNS"
NUM_TRIALS=${NUM_TRIALS:-3}
log_info "Starting ${NUM_TRIALS} trials for core scenarios: ${CORE_SCENARIOS[*]}"

for i in $(seq 1 $NUM_TRIALS); do
    log_step "STARTING TRIAL $i of $NUM_TRIALS"
    OPTIMAL_TPS_ARG="--optimalTps=${OPTIMAL_TPS}"

    for SCENARIO in "${CORE_SCENARIOS[@]}"; do
        # Scenario A0 (fixed load) does not use the optimal TPS argument.
        TPS_ARG=""
        if [ "$SCENARIO" != "A0" ]; then
            TPS_ARG="${OPTIMAL_TPS_ARG}"
        fi

        run_benchmark_set "${SCENARIO}" "benchmarks/${SCENARIO}-benchmark.yaml" "${TPS_ARG}" "$i"
    done
    log_success "TRIAL $i of $NUM_TRIALS COMPLETED"
done

log_step "PIPELINE FINISHED"
echo -e "${C_GREEN}=======================================================${C_NC}"
echo -e "${C_GREEN}  All benchmark scenarios completed successfully.      ${C_NC}"
echo -e "${C_GREEN}  Reports are available in the 'reports/' directory.   ${C_NC}"
echo -e "${C_GREEN}  Data has been logged to the PostgreSQL database.     ${C_NC}"
echo -e "${C_GREEN}=======================================================${C_NC}"
