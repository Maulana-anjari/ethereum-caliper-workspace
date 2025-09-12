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
CORE_SCENARIOS=("A0")

# ==============================================================================
#                                MAIN PIPELINE
# ==============================================================================

echo -e "${C_CYAN}=======================================================${C_NC}"
echo -e "${C_CYAN}      Caliper Benchmark Automation Pipeline (Swarm Mode) ${C_NC}"
echo -e "${C_GREEN}      By Maulana Anjari Anggorokasih        ${C_NC}"
echo -e "${C_CYAN}=======================================================${C_NC}"

# --- PHASE 0: SETUP & INITIALIZATION ---
log_step "SETUP & INITIALIZATION"

log_action "Loading environment variables"
# .env file is passed via docker-compose environment section, no need to source
if [ -z "$CONSENSUS" ]; then
    log_error "Environment variables not loaded. Ensure they are passed to the container."
fi
log_success "Environment variables loaded."

# --- Define Network Config Path ---
CONSENSUS_LOWER=$(echo "$CONSENSUS" | tr '[:upper:]' '[:lower:]')
NETWORK_CONFIG_FILE="ethereum-${CONSENSUS_LOWER}-config.json"
NETWORK_CONFIG_PATH="./networks/${NETWORK_CONFIG_FILE}"
log_info "Network config path set to: ${NETWORK_CONFIG_PATH}"

log_action "Cleaning up old reports and creating directory"
rm -rf reports
mkdir -p reports
log_success "Directory 'reports' is clean and ready."

# --- PHASE 1: KEY EXTRACTION & CONFIGURATION ---
log_step "KEY EXTRACTION & CONFIGURATION"

log_action "Preparing keystore for key extraction"
# Support multiple keystore directories via KEYSTORE_SRC_PATHS (comma-separated)
if [ -n "${KEYSTORE_SRC_PATHS}" ]; then
    IFS=',' read -r -a KS_PATHS_ARR <<< "${KEYSTORE_SRC_PATHS}"
    for p in "${KS_PATHS_ARR[@]}"; do
        p_trimmed="${p//\n/}"
        if [ ! -d "$p_trimmed" ] || [ -z "$(ls -A "$p_trimmed")" ]; then
            log_error "Keystore directory not found or empty: '$p_trimmed'"
        fi
    done
    log_success "All keystore paths verified: ${KEYSTORE_SRC_PATHS}"

    log_action "Extracting all addresses & private keys (multi-keystore)"
    ACCOUNTS_JSON=$(node getPrivateKey.js "${KEYSTORE_SRC_PATHS}" "${KEYSTORE_PASSWORDS:-$KEYSTORE_PASSWORD}")
else
    KEYSTORE_SRC_DIR="${KEYSTORE_SRC_PATH}"
    if [ ! -d "$KEYSTORE_SRC_DIR" ] || [ -z "$(ls -A "$KEYSTORE_SRC_DIR")" ]; then
        log_error "Source keystore directory not found or is empty in '${KEYSTORE_SRC_DIR}'"
    fi
    log_success "Keystore found at mounted path: ${KEYSTORE_SRC_DIR}"

    log_action "Extracting all addresses & private keys"
    ACCOUNTS_JSON=$(node getPrivateKey.js "${KEYSTORE_SRC_DIR}" "${KEYSTORE_PASSWORD}")
fi

if [ -z "$ACCOUNTS_JSON" ]; then
    log_error "Failed to extract private keys"
fi

MAIN_ADDRESS=$(echo "$ACCOUNTS_JSON" | jq -r '.[0].address')
export ACCOUNTS_JSON ADDRESS=${MAIN_ADDRESS}
log_success "Extracted keys. Main address: ${MAIN_ADDRESS} | Total accounts: $(echo "$ACCOUNTS_JSON" | jq -r 'length')"

log_step "CONTRACT DEPLOYMENT & NETWORK CONFIG"

log_action "Deploying contracts via custom script"
node deploy-contracts.js
log_success "Contracts deployed, addresses saved to deployed-contracts.json."

log_action "Generating new network configuration"
node generate-network-config.js
log_success "Network config generated."

# --- Function to run a benchmark set ---
run_benchmark_set() {
    local SCENARIO_ID=$1
    local BENCHMARK_CONFIG_FILE="benchmarks/${SCENARIO_ID}-benchmark.yaml"
    local TRIAL_NUM_ARG=$2

    local REPORT_PATH="reports/report-${SCENARIO_ID}-trial-${TRIAL_NUM_ARG}.html"
    local LOG_PATH="reports/report-${SCENARIO_ID}-trial-${TRIAL_NUM_ARG}.log"

    log_action "Generating benchmark config for ${C_CYAN}${SCENARIO_ID}${C_NC}"
    node generate-benchmark-config.js --scenario=${SCENARIO_ID} --output=${BENCHMARK_CONFIG_FILE}

    log_action "Launching Caliper for ${C_CYAN}${SCENARIO_ID}${C_NC} (Trial ${C_CYAN}${TRIAL_NUM_ARG}${C_NC})"
    log_info "Report will be at: ${C_CYAN}${REPORT_PATH}${C_NC}"

    npx caliper launch manager \
        --caliper-workspace . \
        --caliper-networkconfig ${NETWORK_CONFIG_PATH} \
        --caliper-benchconfig ${BENCHMARK_CONFIG_FILE} \
        --caliper-report-path ${REPORT_PATH} \
        --caliper-flow-skip-install \
        ${CALIPER_RUN_ARGS} > "${LOG_PATH}" 2>&1

    log_success "Benchmark ${SCENARIO_ID} (Trial ${TRIAL_NUM_ARG}) completed."

    log_action "Logging results from ${C_CYAN}${REPORT_PATH}${C_NC} to database"
    node log-to-db.js "${REPORT_PATH}" "${BENCHMARK_CONFIG_FILE}" "${TRIAL_NUM_ARG}"
}

# --- PHASE 2: CORE BENCHMARK RUNS ---
log_step "CORE BENCHMARK RUNS"
NUM_TRIALS=${NUM_TRIALS:-1}
log_info "Starting ${NUM_TRIALS} trials for core scenarios: ${CORE_SCENARIOS[*]}"

for i in $(seq 1 $NUM_TRIALS); do
    log_step "STARTING TRIAL $i of $NUM_TRIALS"
    for SCENARIO in "${CORE_SCENARIOS[@]}"; do
        run_benchmark_set "${SCENARIO}" "$i"
    done
    log_success "TRIAL $i of $NUM_TRIALS COMPLETED"
done

log_step "PIPELINE FINISHED"
echo -e "${C_GREEN}=======================================================${C_NC}"
echo -e "${C_GREEN}  All benchmark scenarios completed successfully.      ${C_NC}"
echo -e "${C_GREEN}=======================================================${C_NC}"
