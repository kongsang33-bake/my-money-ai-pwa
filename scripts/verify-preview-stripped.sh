#!/bin/sh
# Fails if the e2e fixture (lib/preview.ts) survived into a production build.
# The guarantee is that NEXT_PUBLIC_ENABLE_PREVIEW is absent, so PREVIEW_ENABLED
# folds to false and the minifier drops everything behind it -- this checks the
# guarantee instead of trusting it.
set -e
[ -d .next/static ] || { echo "no build found: run 'npm run build' first"; exit 1; }
hits=$(grep -rl "__MONII_PREVIEW__\|preview-user\|เที่ยวญี่ปุ่น" .next/static 2>/dev/null || true)
if [ -n "$hits" ]; then
  echo "FAIL: preview fixture found in the production bundle:"
  echo "$hits"
  exit 1
fi
echo "OK: no preview fixture in the production bundle"
