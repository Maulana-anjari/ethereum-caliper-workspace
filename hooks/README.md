# Hook Scripts for Caliper Scenarios

The pipeline will automatically execute optional hook scripts before and after a scenario runs.

- Place executable scripts in this directory.
- Name the script after the scenario ID (e.g. `fault-injection.sh`, `stability-soak.sh`).
- Scripts are invoked as `<phase> <variant> <trial>` where `phase` is `pre` or `post`.
- Environment variables from `.env` plus `EXPERIMENT_VARIANT_LABEL` are available inside the script.

## Example: fault injection during scenario `fault-injection`

```
#!/usr/bin/env bash
set -euo pipefail
PHASE=$1
VARIANT=$2
TRIAL=$3

if [ "$PHASE" = "pre" ]; then
  echo "[hook fault-injection] scheduling validator stop in 2 minutes (variant=${VARIANT}, trial=${TRIAL})"
  # Example: stop a validator container after 120s (requires docker CLI availability)
  ( sleep 120 && docker compose -f ../blockchain-poa-geth/docker-compose.poa.yml stop signer1 ) &
elif [ "$PHASE" = "post" ]; then
  echo "[hook fault-injection] restarting validator"
  docker compose -f ../blockchain-poa-geth/docker-compose.poa.yml start signer1
fi
```

Modify the commands to match your environment (container names, delay, etc.) or replace them with API calls to your orchestration platform.
