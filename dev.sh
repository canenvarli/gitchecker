#!/bin/bash
set -e
cd "$(dirname "$0")"
mkdir -p logs
: > logs/app.log
echo "================================================="
echo "  GitChecker — DEV mode"
echo "  No DevTools. Use ./debug.sh to open DevTools."
echo "  Logs: $(pwd)/logs/app.log"
echo "================================================="
npm run dev 2>&1 | tee -a logs/app.log
