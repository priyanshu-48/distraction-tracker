#!/usr/bin/env bash
# Clean-checkout test run: clones the current commit, installs from the lockfiles and runs each suite 3 times.
# Raw output goes to docs/evidence/raw/tests-<suite>-run<N>.txt. Server tests need DB_* settings in server/.env,
# which is copied from the working tree (it is never committed).
set -u
REPO="$(cd "$(dirname "$0")/../.." && pwd)"
OUT="$REPO/docs/evidence/raw"
CLONE="$(mktemp -d)/dt"
mkdir -p "$OUT"
git clone -q "$REPO" "$CLONE"
echo "commit: $(git -C "$CLONE" rev-parse HEAD)" | tee "$OUT/tests-meta.txt"
cp "$REPO/server/.env" "$CLONE/server/.env"
(cd "$CLONE/server" && npm ci --silent) ; (cd "$CLONE/client" && npm ci --silent)
for n in 1 2 3; do
  (cd "$CLONE/server" && npx vitest run) > "$OUT/tests-server-run$n.txt" 2>&1
  (cd "$CLONE/client" && npx vitest run) > "$OUT/tests-client-run$n.txt" 2>&1
  (cd "$CLONE/extension" && node --test "test/*.test.mjs") > "$OUT/tests-extension-run$n.txt" 2>&1
done
echo "done" >> "$OUT/tests-meta.txt"
