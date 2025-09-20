#!/usr/bin/env bash
set -euo pipefail
PHASE=${1:-}
VARIANT=${2:-default}
TRIAL=${3:-0}

# Example fault injection: stop and restart a validator container in PoA setup.
# Adjust COMPOSE_FILE and TARGET_SERVICE to match your environment.
COMPOSE_FILE=${FAULT_INJECT_COMPOSE_FILE:-../blockchain-poa-geth/docker-compose.poa.yml}
TARGET_SERVICE=${FAULT_INJECT_SERVICE:-signer1}
DELAY=${FAULT_INJECT_DELAY:-120}

if [ "$PHASE" = "pre" ]; then
  echo "[hook fault-injection] scheduling stop of ${TARGET_SERVICE} in ${DELAY}s (variant=${VARIANT}, trial=${TRIAL})"
  ( sleep "$DELAY" && docker compose -f "$COMPOSE_FILE" stop "$TARGET_SERVICE" >/tmp/fault-${VARIANT}-${TRIAL}.log 2>&1 ) &
elif [ "$PHASE" = "post" ]; then
  echo "[hook fault-injection] ensuring ${TARGET_SERVICE} is running"
  docker compose -f "$COMPOSE_FILE" up -d "$TARGET_SERVICE"
fi
