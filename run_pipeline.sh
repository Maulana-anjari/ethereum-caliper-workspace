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
rm -f ./keystore_for_test.json

KEYSTORE_FILES=($(find "${KEYSTORE_SRC_PATH}" -maxdepth 1 -type f))
NUM_KEYSTORE_FILES=${#KEYSTORE_FILES[@]}

if [ "$NUM_KEYSTORE_FILES" -eq 0 ]; then
    log_error "No keystore file found in '${KEYSTORE_SRC_PATH}'"
elif [ "$NUM_KEYSTORE_FILES" -gt 1 ]; then
    log_error "Multiple keystore files found in '${KEYSTORE_SRC_PATH}'. Please ensure only one is present."
fi

sudo cp "${KEYSTORE_FILES[0]}" ./keystore_for_test.json
sudo chmod 644 ./keystore_for_test.json
log_success "Temporary keystore is ready from '${KEYSTORE_FILES[0]}'"

log_action "Extracting address & private key"
KEY_OUTPUT=$(node getPrivateKey.js ./keystore_for_test.json ${KEYSTORE_PASSWORD})
ADDRESS=$(echo "$KEY_OUTPUT" | grep "Address" | cut -d ':' -f 2 | tr -d ' ')
PRIVATE_KEY=$(echo "$KEY_OUTPUT" | grep "Private Key" | cut -d ':' -f 2 | tr -d ' ')
if [ -z "$PRIVATE_KEY" ]; then
    log_error "Failed to extract private key"
fi
sed -i '/^ADDRESS=/d' .env
sed -i '/^PRIVATE_KEY=/d' .env
echo "" >> .env
echo "ADDRESS=${ADDRESS}" >> .env
echo "PRIVATE_KEY=${PRIVATE_KEY}" >> .env
export $(grep -v '^#' .env | xargs) # Reload .env
log_success "Extracted keys and updated .env file"
log_info "Address: ${ADDRESS}"

log_action "Generating Caliper network configuration"
node generate-network-config.js
log_success "Network configuration generated"

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
