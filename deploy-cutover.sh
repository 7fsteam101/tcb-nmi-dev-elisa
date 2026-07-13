#!/bin/bash
# TCB pipeline-cutover deploy: pushes the re-pointed KV config and deploys all
# 8 touched Cloudflare Workers across both client repos in one pass.
#
# PRECONDITIONS (in order, per LAUNCH-RUNBOOK.md):
#   1. The WF-03 booking Zap (302729523) is OFF.
#   2. PRs tcb-operations#132 and BDCR-salesmen-dashboard#578 are merged (or
#      run this from the update/new-pipeline-repoint branches, which is what
#      the local clones have checked out).
#
# USAGE:
#   export CLOUDFLARE_API_TOKEN=...    (create at
#     https://dash.cloudflare.com/profile/api-tokens ->
#     "Edit Cloudflare Workers" template + add permission
#     "Workers KV Storage: Edit", scoped to The Credit Brothers account)
#   export CLOUDFLARE_ACCOUNT_ID=...   (only needed if the token can see more
#     than one account; find it on the Cloudflare dashboard right sidebar)
#   bash deploy-cutover.sh
#
# Safe to re-run: wrangler deploys are idempotent, the KV put overwrites the
# same key.

set -euo pipefail
cd "$(dirname "$0")"

if [ -z "${CLOUDFLARE_API_TOKEN:-}" ]; then
  echo "ERROR: CLOUDFLARE_API_TOKEN is not set. See the usage note at the top of this script."
  exit 1
fi

OPS=tcb-operations/workers/operations
KV_NAMESPACE=ce3fbd35d0cc4373906ada4f27f07877   # STAGE_MAP, shared by worker-a + worker-b

echo "=== 1/3 KV config (stage map -> new Sales pipeline) ==="
(cd tcb-operations && node scripts/seed-kv.js "$KV_NAMESPACE")

echo "=== 2/3 tcb-operations workers ==="
for w in worker-a worker-b nafa-audit-sync contract-signed-webhook ghl-optin-close-sync affiliate-partner-sync quiz-email-draft; do
  echo "--- deploying $w ---"
  (cd "$OPS/$w" && npx wrangler deploy)
done

echo "=== 3/3 BDCR salesmen dashboard API ==="
(cd BDCR-salesmen-dashboard/workers/bdcr-sales-dashboard-api && npx wrangler deploy)

echo ""
echo "DONE. Next per LAUNCH-RUNBOOK.md:"
echo "  - Flip Admin > Options > 'Push GHL events to Close' ON"
echo "  - Migrate OPEN cards old -> new pipeline (never historical wons)"
echo "  - Synthetic-lead test: walk one test lead Lead Opt In -> Self Booked -> Won PP;"
echo "    the onboarding chain must fire exactly once and only from the new pipeline."
