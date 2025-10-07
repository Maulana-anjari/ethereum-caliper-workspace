#!/usr/bin/env bash
set -euo pipefail

PHASE=${1:-}
VARIANT=${2:-default}
TRIAL=${3:-0}

normalize_bool() {
  local raw=${1:-}
  if [ -z "$raw" ]; then
    printf 'false'
    return 0;
  fi
  printf '%s' "$raw" | tr '[:upper:]' '[:lower:]'
}

ENABLED=$(normalize_bool "${FAULT_INJECT_ENABLED:-false}")

if [ "$ENABLED" != "true" ]; then
  echo "[hook fault-injection] disabled (FAULT_INJECT_ENABLED=${ENABLED}). Skipping for variant=${VARIANT}, trial=${TRIAL}, phase=${PHASE}."
  exit 0
fi

COMPOSE_FILE=${FAULT_INJECT_COMPOSE_FILE:-../blockchain-poa-geth/docker-compose.poa.yml}
TARGET_SERVICE=${FAULT_INJECT_SERVICE:-signer1}
DELAY=${FAULT_INJECT_DELAY:-120}
LOG_FILE=${FAULT_INJECT_LOG_FILE:-/tmp/fault-${VARIANT}-${TRIAL}.log}

SSH_TARGET=${FAULT_INJECT_SSH_TARGET:-}

when_remote() {
  [ -n "$SSH_TARGET" ]
}

run_remote() {
  ssh "$SSH_TARGET" "$@"
}

run_compose() {
  if when_remote; then
    local quoted_args
    quoted_args=$(printf " %q" "$@")
    run_remote "docker compose -f '$COMPOSE_FILE'$quoted_args"
  else
    docker compose -f "$COMPOSE_FILE" "$@"
  fi
}

if when_remote; then
  if ! run_remote "command -v docker >/dev/null 2>&1"; then
    echo "[hook fault-injection] docker CLI not found on ${SSH_TARGET}; skipping fault injection."
    exit 0
  fi
  if ! run_remote "test -f '$COMPOSE_FILE'"; then
    echo "[hook fault-injection] compose file not found at ${COMPOSE_FILE} on ${SSH_TARGET}; skipping fault injection."
    exit 0
  fi
else
  if ! command -v docker >/dev/null 2>&1; then
    echo "[hook fault-injection] docker CLI not found; skipping fault injection."
    exit 0
  fi
  if [ ! -f "$COMPOSE_FILE" ]; then
    echo "[hook fault-injection] compose file not found at ${COMPOSE_FILE}; skipping fault injection."
    exit 0
  fi
fi

TARGET_SERVICE=${FAULT_INJECT_SERVICE:-signer1}

SERVICE_LIST=$(run_compose config --services 2>/dev/null || true)
if [ -z "$SERVICE_LIST" ]; then
  echo "[hook fault-injection] unable to parse services from ${COMPOSE_FILE}; skipping fault injection."
  exit 0
fi

if ! printf '%s\n' "$SERVICE_LIST" | grep -qx "$TARGET_SERVICE"; then
  echo "[hook fault-injection] service ${TARGET_SERVICE} not defined in ${COMPOSE_FILE}; skipping fault injection."
  exit 0
fi

case "$PHASE" in
  pre)
    echo "[hook fault-injection] scheduling stop of ${TARGET_SERVICE} in ${DELAY}s (variant=${VARIANT}, trial=${TRIAL})"
    if when_remote; then
      stop_cmd="sleep $DELAY && docker compose -f '$COMPOSE_FILE' stop '$TARGET_SERVICE' >'$LOG_FILE' 2>&1"
      ( run_remote "$stop_cmd" ) &
    else
      ( sleep "$DELAY" && docker compose -f "$COMPOSE_FILE" stop "$TARGET_SERVICE" >"$LOG_FILE" 2>&1 ) &
    fi
    ;;
  post)
    echo "[hook fault-injection] ensuring ${TARGET_SERVICE} is running"
    run_compose up -d "$TARGET_SERVICE"
    ;;
  *)
    echo "[hook fault-injection] unknown phase '${PHASE}', nothing to do."
    ;;
esac
