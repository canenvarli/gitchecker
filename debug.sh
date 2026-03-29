#!/bin/bash
set -e
cd "$(dirname "$0")"
mkdir -p logs
: > logs/app.log
echo "================================================="
echo "  GitChecker — DEBUG mode"
echo "  DevTools panel opens automatically."
echo "  Logs: $(pwd)/logs/app.log"
echo "================================================="
GITCHECKER_DEBUG=1 npm run dev 2>&1 | tee -a logs/app.log
