#!/bin/sh
set -eu

if ! command -v node >/dev/null 2>&1; then
  echo "Node.js 18+ is required to preview pixelfx." >&2
  exit 1
fi

cd "$(dirname "$0")"
exec node tools/serve.mjs "$@" --open
