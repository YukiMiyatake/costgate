#!/usr/bin/env bash
# Run commands in the CostGate Docker toolchain (Node 22 + Go 1.25).
# No host Node/Go required — only Docker.
#
#   ./docker.sh npm install
#   ./docker.sh npm run build
#   ./docker.sh npm run build:gate
#   ./docker.sh bash
set -euo pipefail
cd "$(dirname "$0")"
exec docker compose -f docker-compose.dev.yml run --rm toolchain "$@"
