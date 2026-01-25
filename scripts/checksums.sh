#!/usr/bin/env bash
set -euo pipefail
DIR=${1:-dist}
if [ ! -d "$DIR" ]; then
  echo "Directory not found: $DIR" >&2
  exit 1
fi
( cd "$DIR" && find . -type f ! -name 'checksums.sha256' -print0 | sort -z | xargs -0 shasum -a 256 ) > "$DIR/checksums.sha256"
echo "Wrote $DIR/checksums.sha256"
