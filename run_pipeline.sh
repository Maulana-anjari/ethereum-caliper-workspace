#!/bin/bash

set -e

C_BLUE='\033[1;34m'
C_GREEN='\033[1;32m'
C_RED='\033[1;31m'
C_YELLOW='\033[1;33m'
C_CYAN='\033[1;36m'
C_NC='\033[0m'

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

CORE_SCENARIOS_ENV="${CORE_SCENARIOS:-}"
if [ -n "$CORE_SCENARIOS_ENV" ]; then
    IFS=',' read -r -a CORE_SCENARIOS <<< "$CORE_SCENARIOS_ENV"
else
    CORE_SCENARIOS=("A0")
fi

EXPERIMENT_VARIANTS_ENV="${EXPERIMENT_VARIANTS:-}"
if [ -n "$EXPERIMENT_VARIANTS_ENV" ]; then
    IFS=',' read -r -a EXPERIMENT_VARIANTS <<< "$EXPERIMENT_VARIANTS_ENV"
else
    EXPERIMENT_VARIANTS=("default")
fi

OPTIMAL_TPS_VALUE="${OPTIMAL_TPS_OVERRIDE:-}"
NUM_TRIALS=${NUM_TRIALS:-1}

log_step "PIPELINE BOOT"
log_info "Core scenarios : ${CORE_SCENARIOS[*]}"
log_info "Variants       : ${EXPERIMENT_VARIANTS[*]}"
log_info "Trials         : ${NUM_TRIALS}"

if [ -z "$CONSENSUS" ]; then
    log_error "Environment variables not loaded. Ensure .env has been sourced."
fi

log_action "Cleaning up reports directory"
rm -rf reports
mkdir -p reports
log_success "Directory 'reports' is clean and ready."

log_step "KEY EXTRACTION & CONFIGURATION"
log_action "Preparing keystore for key extraction"
if [ -n "${KEYSTORE_SRC_PATHS}" ]; then
    IFS=',' read -r -a KS_PATHS_ARR <<< "${KEYSTORE_SRC_PATHS}"
    for p in "${KS_PATHS_ARR[@]}"; do
        p_trimmed="${p//$'\n'/}"
        p_trimmed="${p_trimmed//$'\r'/}"
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

run_benchmark_set() {
    local SCENARIO_ID=$1
    local TRIAL_NUM_ARG=$2
    local VARIANT_ID=$3

    local VARIANT_SAFE=${VARIANT_ID//[^A-Za-z0-9_\-]/_}
    if [ -z "$VARIANT_SAFE" ]; then
        VARIANT_SAFE="default"
    fi

    local SCENARIO_TAG="$SCENARIO_ID"
    if [ "$VARIANT_SAFE" != "default" ]; then
        SCENARIO_TAG="${SCENARIO_ID}-${VARIANT_SAFE}"
    fi

    local BENCHMARK_CONFIG_FILE="benchmarks/${SCENARIO_TAG}-benchmark.yaml"
    local REPORT_PATH="reports/report-${SCENARIO_TAG}-trial-${TRIAL_NUM_ARG}.html"
    local LOG_PATH="reports/report-${SCENARIO_TAG}-trial-${TRIAL_NUM_ARG}.log"

    local GENERATOR_ARGS=(--scenario=${SCENARIO_ID} --output=${BENCHMARK_CONFIG_FILE})
    local requires_optimal="false"
    case "$SCENARIO_ID" in
        mixed-workload|worker-scale|stability-soak|fault-injection)
            requires_optimal="true"
            ;;
    esac

    if [ "$requires_optimal" = "true" ]; then
        if [ -z "$OPTIMAL_TPS_VALUE" ] && [ -f optimal_tps.txt ]; then
            OPTIMAL_TPS_VALUE=$(cat optimal_tps.txt)
        fi
        if [ -z "$OPTIMAL_TPS_VALUE" ]; then
            log_error "Scenario ${SCENARIO_ID} membutuhkan nilai optimal TPS. Jalankan skenario 'A' terlebih dahulu atau set OPTIMAL_TPS_OVERRIDE."
        fi
        GENERATOR_ARGS+=(--optimalTps="${OPTIMAL_TPS_VALUE}")
    fi

    local HOOK_SCRIPT="./hooks/${SCENARIO_ID}.sh"
    if [ -x "$HOOK_SCRIPT" ]; then
        log_action "Running pre-hook for ${C_CYAN}${SCENARIO_ID}${C_NC}"
        EXPERIMENT_VARIANT_LABEL=${VARIANT_SAFE} "$HOOK_SCRIPT" pre "${VARIANT_SAFE}" "${TRIAL_NUM_ARG}" || log_error "Pre-hook for ${SCENARIO_ID} failed"
    fi

    log_action "Generating benchmark config for ${C_CYAN}${SCENARIO_ID}${C_NC} (variant ${VARIANT_SAFE})"
    EXPERIMENT_VARIANT_LABEL=${VARIANT_SAFE} node generate-benchmark-config.js "${GENERATOR_ARGS[@]}"

    log_action "Launching Caliper for ${C_CYAN}${SCENARIO_ID}${C_NC} (variant ${VARIANT_SAFE}, trial ${C_CYAN}${TRIAL_NUM_ARG}${C_NC})"
    log_info "Report will be at: ${C_CYAN}${REPORT_PATH}${C_NC}"

    EXPERIMENT_VARIANT_LABEL=${VARIANT_SAFE} npx caliper launch manager \
        --caliper-workspace . \
        --caliper-networkconfig ${NETWORK_CONFIG_PATH} \
        --caliper-benchconfig ${BENCHMARK_CONFIG_FILE} \
        --caliper-report-path ${REPORT_PATH} \
        --caliper-flow-skip-install \
        ${CALIPER_RUN_ARGS} > "${LOG_PATH}" 2>&1

    log_success "Benchmark ${SCENARIO_ID} (variant ${VARIANT_SAFE}, trial ${TRIAL_NUM_ARG}) completed."

    log_action "Logging results from ${C_CYAN}${REPORT_PATH}${C_NC} to database"
    EXPERIMENT_VARIANT_LABEL=${VARIANT_SAFE} node log-to-db.js "${REPORT_PATH}" "${BENCHMARK_CONFIG_FILE}" "${TRIAL_NUM_ARG}"

    if [ -x "$HOOK_SCRIPT" ]; then
        log_action "Running post-hook for ${C_CYAN}${SCENARIO_ID}${C_NC}"
        EXPERIMENT_VARIANT_LABEL=${VARIANT_SAFE} "$HOOK_SCRIPT" post "${VARIANT_SAFE}" "${TRIAL_NUM_ARG}" || log_error "Post-hook for ${SCENARIO_ID} failed"
    fi

    if [ "$SCENARIO_ID" = "A" ]; then
        log_action "Analyzing scenario A results to determine optimal TPS"
        if EXPERIMENT_VARIANT_LABEL=${VARIANT_SAFE} node analyze-report.js "${REPORT_PATH}"; then
            if [ -f optimal_tps.txt ]; then
                OPTIMAL_TPS_VALUE=$(cat optimal_tps.txt)
                log_info "Optimal TPS diperbarui ke ${OPTIMAL_TPS_VALUE}"
                cp optimal_tps.txt "reports/optimal_tps-${SCENARIO_TAG}-trial-${TRIAL_NUM_ARG}.txt"
            fi
        else
            log_error "Analisis skenario A gagal. Periksa laporan ${REPORT_PATH}."
        fi
    fi
}

log_step "CORE BENCHMARK RUNS"
for VARIANT in "${EXPERIMENT_VARIANTS[@]}"; do
    VARIANT_SAFE=${VARIANT//[^A-Za-z0-9_\-]/_}
    if [ -z "$VARIANT_SAFE" ]; then
        VARIANT_SAFE="default"
    fi

    log_step "VARIANT ${VARIANT_SAFE}"

    export EXPERIMENT_VARIANT_LABEL=${VARIANT_SAFE}

    VARIANT_ENV_FILE="./variants/${VARIANT_SAFE}.env"
    if [ -f "$VARIANT_ENV_FILE" ]; then
        log_action "Loading variant-specific environment from ${VARIANT_ENV_FILE}"
        set -a
        # shellcheck source=/dev/null
        source "$VARIANT_ENV_FILE"
        set +a
    else
        log_info "Variant env file ${VARIANT_ENV_FILE} not found. Using current environment."
    fi

    CONSENSUS_LOWER=$(echo "$CONSENSUS" | tr '[:upper:]' '[:lower:]')
    NETWORK_CONFIG_FILE="ethereum-${CONSENSUS_LOWER}-config.json"
    NETWORK_CONFIG_PATH="./networks/${NETWORK_CONFIG_FILE}"
    log_info "Network config path set to: ${NETWORK_CONFIG_PATH}"

    log_action "Deploying contracts for variant ${VARIANT_SAFE}"
    node deploy-contracts.js
    log_success "Contracts deployed, addresses saved to deployed-contracts.json."

    log_action "Generating new network configuration for variant ${VARIANT_SAFE}"
    node generate-network-config.js
    log_success "Network config generated."

    for TRIAL_INDEX in $(seq 1 $NUM_TRIALS); do
        log_step "VARIANT ${VARIANT_SAFE}: TRIAL ${TRIAL_INDEX}"
        OPTIMAL_TPS_VALUE="${OPTIMAL_TPS_OVERRIDE:-}"
        rm -f optimal_tps.txt

        for SCENARIO in "${CORE_SCENARIOS[@]}"; do
            log_info "Variant ${VARIANT_SAFE}: running scenario ${SCENARIO} (trial ${TRIAL_INDEX})"
            run_benchmark_set "${SCENARIO}" "$TRIAL_INDEX" "$VARIANT_SAFE"
        done

        log_success "Variant ${VARIANT_SAFE}: trial ${TRIAL_INDEX} completed"
    done

done

log_step "PIPELINE FINISHED"
echo -e "${C_GREEN}=======================================================${C_NC}"
echo -e "${C_GREEN}  All benchmark scenarios completed successfully.      ${C_NC}"
echo -e "${C_GREEN}=======================================================${C_NC}"
