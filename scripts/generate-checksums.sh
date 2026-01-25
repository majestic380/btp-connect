#!/usr/bin/env bash
set -euo pipefail
DIR="${1:-.}"
OUT="${DIR%/}/CHECKSUMS.sha256"
rm -f "$OUT"
if command -v sha256sum >/dev/null 2>&1; then
  find "$DIR" -maxdepth 1 -type f -print0 | sort -z | xargs -0 sha256sum > "$OUT"
elif command -v shasum >/dev/null 2>&1; then
  find "$DIR" -maxdepth 1 -type f -print0 | sort -z | xargs -0 shasum -a 256 > "$OUT"
else
  echo "No sha256 tool found" >&2; exit 1
fi
echo "Wrote $OUT"
