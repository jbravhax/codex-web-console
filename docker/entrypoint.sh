#!/usr/bin/env bash
set -euo pipefail

cd /workspace

if [ ! -d node_modules ] || [ ! -x node_modules/.bin/concurrently ]; then
  echo "[docker] Installing npm dependencies..."
  npm install
fi

exec "$@"
