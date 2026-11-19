#!/usr/bin/env bash
# QUORUM standalone deploy to the owner's Cloudflare account. Idempotent.
# Required env: CLOUDFLARE_API_TOKEN, CLOUDFLARE_ACCOUNT_ID, QUORUM_ADMIN_EMAIL
# Optional env: QUORUM_ALLOWED_EMAILS (comma list), CF_ACCESS_TEAM_DOMAIN, CF_ACCESS_AUD, OPENAI_MODEL
# Never echoes secret values.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${CLOUDFLARE_API_TOKEN:?missing}"; : "${CLOUDFLARE_ACCOUNT_ID:?missing}"; : "${QUORUM_ADMIN_EMAIL:?missing}"
WRANGLER="node node_modules/wrangler/bin/wrangler.js"
export QUORUM_WORKER_NAME="${QUORUM_WORKER_NAME:-quorum-football-lab}"
export QUORUM_D1_NAME="${QUORUM_D1_NAME:-quorum-football-lab-db}"
TMP="$(mktemp -d)"; trap 'rm -rf "$TMP"' EXIT

echo "== 1. Database D1 =="
find_d1() { $WRANGLER d1 list --json 2>/dev/null | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{const l=JSON.parse(s);const x=l.find(d=>d.name===process.argv[1]);process.stdout.write(x?x.uuid:"")})' "$QUORUM_D1_NAME"; }
QUORUM_D1_ID="$(find_d1)"
if [ -z "$QUORUM_D1_ID" ]; then
  $WRANGLER d1 create "$QUORUM_D1_NAME" --location weur >/dev/null
  QUORUM_D1_ID="$(find_d1)"
fi
[ -n "$QUORUM_D1_ID" ] || { echo "D1 non creato"; exit 1; }
export QUORUM_D1_ID
echo "D1 $QUORUM_D1_NAME pronto"

echo "== 2. Migrazioni =="
cat > "$TMP/migrations.json" <<JSON
{"name":"$QUORUM_WORKER_NAME","compatibility_date":"2026-05-15","d1_databases":[{"binding":"DB","database_name":"$QUORUM_D1_NAME","database_id":"$QUORUM_D1_ID","migrations_dir":"$(pwd)/drizzle"}]}
JSON
$WRANGLER d1 migrations apply DB --remote --config "$TMP/migrations.json"

echo "== 3. Build e deploy =="
npm run build
$WRANGLER deploy --config dist/server/wrangler.json

echo "== 4. Segreti =="
EXISTING="$($WRANGLER secret list --name "$QUORUM_WORKER_NAME" --format json 2>/dev/null || echo '[]')"
has() { echo "$EXISTING" | grep -q "\"$1\""; }
if ! has QUORUM_KEY_PRIVATE_JWK; then
  # First run only. Never regenerate while encrypted credentials exist in D1.
  node scripts/quorum-generate-vault.mjs "$TMP/vault.json"
  $WRANGLER secret bulk "$TMP/vault.json" --name "$QUORUM_WORKER_NAME" >/dev/null
fi
node -e '
const o={QUORUM_ADMIN_EMAIL:process.env.QUORUM_ADMIN_EMAIL,OPENAI_MODEL:process.env.OPENAI_MODEL||"gpt-6.1-sol"};
for(const k of ["QUORUM_ALLOWED_EMAILS","CF_ACCESS_TEAM_DOMAIN","CF_ACCESS_AUD"]) if(process.env[k]) o[k]=process.env[k];
require("fs").writeFileSync(process.argv[1],JSON.stringify(o),{mode:0o600});' "$TMP/settings.json"
$WRANGLER secret bulk "$TMP/settings.json" --name "$QUORUM_WORKER_NAME" >/dev/null
echo "Segreti aggiornati (valori non mostrati)."

if [ -z "${CF_ACCESS_TEAM_DOMAIN:-}" ] || [ -z "${CF_ACCESS_AUD:-}" ]; then
  echo "ATTENZIONE: Cloudflare Access non configurato. L'app resta chiusa a tutti finché non lo è (fail-closed)."
fi
echo "Deploy completato."
