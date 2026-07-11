# TCB Automation Audit: Pre-Migration (Old "BDCR Sales" Pipeline to New "Sales" Pipeline)

Date: 2026-07-11 (line-level verification pass). Original doc-based audit: 2026-07-10. Auditor: 8FS (Katie's Claude Code). Read-only audit, nothing modified, nothing pushed, no network calls.

## Scope and evidence base (read this first)

This version is verified against the LIVE repo: `/Users/katiebani/Documents/7FS/clients/the-credit-brothers/tcb-operations`, a fresh shallow clone of `The-Credit-Brothers/tcb-operations` pulled 2026-07-10 (single commit; latest visible: "v1.007 careers-intake: Personalized Context"). The 2026-07-10 draft was built from the ARCHIVED `bdcr-operations` repo's docs; every finding below is now marked:

- **VERIFIED** confirmed in live code, with file:line.
- **CORRECTED** the live code differs from what the archived docs claimed; the correction is stated.
- **GONE** no longer exists in the live repo.
- **NEW** did not exist in the archived docs at all (see Section 5).

Unless prefixed, file paths are relative to `tcb-operations/`. `dashboard/` = our repo. Repo layout: `workers/operations/` (20 worker dirs), `packages/` (shared-types, crm-clients, idiq-parser, ghl-client), `apps/` (bdcr, client-reports, mission-control, salesmen-dashboard: **all four are doc-only scaffolds; the app code still lives in standalone repos**, per each `apps/*/CLAUDE.md`), `services/`, `mcp-servers/`, `config/`, `scripts/`, `docs/`, `briefs/`.

**Headline finding: a repo-wide grep for `pipe_5ZtGJ7zT6RjguZ6KPEebkC`, "Won PIF", "Setter Booked", "Self Booked", "DQ On Call" returns ZERO hits. As of the 2026-07-10 clone, nothing in the live automation layer has been re-pointed to the new Sales pipeline. Every stage-touching automation still targets the old BDCR Sales pipeline.**

Key identifiers (all re-verified against the live repo):

| Thing | Value | Evidence (live repo) |
|---|---|---|
| OLD pipeline "BDCR Sales" | `pipe_7QGKHLVYed30khcc1R8PyN` | `config/kv-mappings.json:3`; `workers/operations/nafa-audit-sync/src/index.js:539`; `workers/operations/ghl-optin-close-sync/wrangler.toml:44`; `workers/operations/affiliate-partner-sync/wrangler.toml:35` |
| NEW pipeline "Sales" (live 2026-07-07) | `pipe_5ZtGJ7zT6RjguZ6KPEebkC` | our `CONNECTIONS-TRIGGERS.md:22`; **zero references in tcb-operations** |
| Affiliate Partners pipeline (separate) | `pipe_7UJeYk7cELKYOZQ61wJ5vx` | `workers/operations/close-partner-ghl-sync/README.md` (membership condition) |
| Close webhook -> Worker B (`opportunity.updated`) | `whsub_62FTMcyRA9vz73x00AZryT` | VERIFIED `workers/operations/worker-b/README.md:22`; health check ref `docs/bdcr-e2e-testing-plan.md:232` |
| Close webhook -> close-call-workflow-exit (`activity.call.created/updated`) | `whsub_1gd5KK93D7Y1gwKguzzMTn` | NEW-to-audit, `workers/operations/close-call-workflow-exit/README.md:84` (registered 2026-05-08) |
| Close webhook -> close-partner-ghl-sync (`lead.updated`, `lead.deleted`, `opportunity.created/updated/deleted`) | `whsub_3fjk7jYAk7cV9XkbBZHgFw` | NEW, `workers/operations/close-partner-ghl-sync/README.md:116` (registered 2026-07-05, signature-verified) |
| Shared Cloudflare KV (`STAGE_MAP`) | `ce3fbd35d0cc4373906ada4f27f07877` | VERIFIED `workers/operations/worker-b/CLAUDE.md` (bindings); seeded from `config/kv-mappings.json` via `scripts/seed-kv.js` |
| Old Closed Won stage id (hardcoded in code) | `stat_5H0LFdifIUVPfma3Cy38yaIMj2AZIZVQN1icedhUr2E` | `workers/operations/worker-b/src/index.js:252` |
| Onboarding email template + connected account | `tmpl_hy4HTgxsASTHeXe9EIrnagBraAgSKJYEYMKROYRqLu3` / `emailacct_KFmgFSDKG857C25Q8gQt3F1yVfpk6CHM8ZOuw3HHecw` | VERIFIED `worker-b/src/index.js:279-280`; sender hardcoded `support@thecreditbrothers.com` at `:1265` |
| GHL Marketing location | `Lyg7gTtXo2aqlKCVkJgg` | VERIFIED `ghl-optin-close-sync/wrangler.toml:35` |
| GHL Repair Fulfillment location | `3cJtKFFu7gvKSXaSjBWI` | VERIFIED `worker-b/src/index.js:283` |
| GHL Repair Closed Won iMessage webhook (fires workflow `a4077faf`) | trigger URL ending `9aef746a-ecf2-4043-abd8-e3e1c10785b7` | VERIFIED `worker-b/src/index.js:601` |
| Monday: Repair Clients Source board | `7002021408` | VERIFIED `worker-b/src/index.js:311` |
| Monday: In-House Payment Schedule board | `7117839824` | VERIFIED `worker-b/src/index.js:332` |
| Monday: Repair Leads Source board (NEW in the Closed Won chain) | `7620745327` | `worker-b/src/index.js:362`; also `date-booked-normalizer/wrangler.toml` |
| Monday: Credit Audits board | `7625349540` | VERIFIED `nafa-audit-sync/wrangler.toml` (`NAFA_BOARD_ID`); the Monday webhook id `537223197` from the archived docs is configured on Monday's side and does not appear in the live clone |
| GHL Repair contact CFs (Monday ids) | Full Service `KtMqDn2tNVN9Lm52YTqV`, Payment Schedule `X6aVkafijpdITTfyCAqw` | VERIFIED `worker-b/src/index.js:284-285` |
| Workflow catalog | `config/workflows.json`, **61 workflows**, catalog v14, last updated 2026-07-07 | `config/workflows.json` `_meta` |

---

## 1) Inventory: every automation in the live repo

The fleet is now **20 worker directories** (was 16 in the archived docs), two Mac Studio services, one MCP server, config, scripts. Deployed names frozen (e.g. `bdcr-worker-b` for `worker-b`, per its CLAUDE.md). "Old-stage exposure" = references old-pipeline stage/status ids; details in Section 2.

### Cloudflare Workers (`workers/operations/`)

| # | Worker (WF) | Verdict vs 7/10 audit | Trigger | Writes | Old-stage exposure |
|---|---|---|---|---|---|
| 1 | `worker-b` (WF-05..10, 14, 15, 43) | VERIFIED + chain grew | Close webhook `whsub_62FT...` -> `POST /stage-change` (`src/index.js:1444`); plus NEW `POST /lead-status-changed` Monday webhook (`:1446`, board close stamp) | Close lead status; Slack win alert; onboarding email; Monday records on 3 boards; commission-rate stamp; signed-agreement PDF attach; GHL Repair CFs; GHL iMessage webhook. Full chain in 2.1 | **YES, critical**: KV map (8 stages) + hardcoded Closed Won id (`:252`) |
| 2 | `worker-a` (WF-04, 37, 04B) | VERIFIED + cron | GHL webhooks -> `/intake-submitted` (`src/index.js:500`), `/repair-contact-linked` (`:502`); NEW cron `*/2 * * * *` draining `PENDING_LINKS` KV (retry Repair-contact links, `wrangler.toml:34`, `src/index.js:521`) | Close opp stage (Intake Submitted) + lead status (Audit Needed) + credit-monitoring CFs (IDIQ/MSIQ creds, SSN last 4, account type); Close task; GHL relay | **YES**: hardcoded stage id `:244` (see 2.3) |
| 3 | `nafa-audit-sync` (WF-30) | VERIFIED + new route | Monday webhook on NAFA PDF column -> `POST /` (`src/index.js:5-17`); NEW `POST /direct-upload` (`:30`), salesman-initiated from the sales dashboard via service binding, bearer-gated | PDF to R2 (`nafa-audit-pdfs`) + Close note + NAFA URL field; **moves opp to Audit Complete** with a forward-only guard (only from Call Booked / Intake Submitted, `:567-572`). `/direct-upload` skips note + stage move + violation parsing. `VIOLATION_COUNT_ENABLED = "true"` in `wrangler.toml` | **YES**: `:539-540, 568-569` (see 2.4) |
| 4 | `contract-signed-webhook` (WF-11, WF-26 note leg) | VERIFIED + richer than docs | GHL Marketing "Document & Contract Signed" -> `POST /contract-signed` (`src/index.js:611`); `POST /contract-sent` (`:613`) called by the dashboard's Send Agreement worker | Agreement URL CF on lead; **stores the original signed PDF on the Close lead as a note attachment** (`:88-111`, marker "Signed agreement", new to audit); signed note (`:353`); **moves opp to Contract Signed** (`:296-300`, called `:517`); Slack signed-agreements post. `/contract-sent` = sent-note ONLY, no stage move (`:536-584`), VERIFIED | **YES**: `:144` (see 2.5) |
| 5 | `ghl-optin-close-sync` (WF-39, WF-41) | CORRECTED, much bigger than the audit presumed | `POST /optin/submitted` (`src/index.js:698`), `POST /booking/submitted` (`:701`); cron every minute retrying pending bookings (`wrangler.toml:12`) | Opt-ins: find-or-create Close lead (source-mapped lead status, Paid Media/Organic) + Q&A note; **Paid Media opt-ins get an opp at Lead Opt-In, value $2,500** (`wrangler.toml:44-52`). Bookings: Close note + Monday Repair Leads find-or-create + subitems; **eligibility bookings create/advance the opp to Eligibility Call Booked, forward-only** (guard: `src/pipeline.js:37-44` over `BDCR_PIPELINE_STAGE_ORDER`, all 8 old stage ids, `wrangler.toml:87`). Strategy bookings are note-only (opp stays with WF-03/WF-38) | **YES**: entirely via `wrangler.toml` vars `:37-38, 44-45, 83-84, 87` (see 2.7) |
| 6 | `payment-schedule-sync` (WF-29, 33, 34, 42) | CORRECTED, now writes Close | GHL Repair invoice webhooks -> `POST /webhook` (`src/index.ts:233`), event types InvoiceCreate / InvoicePartiallyPaid / InvoicePaid / InvoiceUpdate / InvoiceVoid / Refund (`:122-146`); cron 13:00 UTC mark-past-due (`wrangler.toml:17`) | Monday Payment Schedule parents + subitems, D1 dedupe, Slack payment alerts; **NEW (2026-07-07): Close mirror on InvoiceCreate writes the invoice URL to Close lead CF "Invoice" `cf_ImIdEUBO...` + a lead note** (`src/lib/close-mirror.ts:40`), skipping dashboard-created invoices to avoid double-mirror | No stage refs (still true); degrades indirectly if Worker B stops (2.1) |
| 7 | `close-call-workflow-exit` (WF-27) | VERIFIED, no stage filter | Close webhook `whsub_1gd5...` on `activity.call.created/updated` (README:84) | GHL Marketing workflow membership (exit WF-02, enter WF-28 cooldown). Qualifying filter = outbound AND (>= 60s or answered), `src/index.js:149-158`; **no pipeline or stage filter, confirmed. No re-point needed** | None (VERIFIED) |
| 8 | `ghl-inbound-sms-workflow-exit` (WF-31) | VERIFIED via catalog | GHL inbound SMS workflow webhook | Same WF-02 exit / WF-28 enter | None |
| 9 | `idiq-login-checker` worker (WF-23 front door) | VERIFIED + new routes | GHL form webhook; NEW dashboard-facing `/manual-check` + `/api/manual-check` (`worker.js:101`), `/api/whoami` (`:115`), `/api/run-status` (`:138`) | Forwards to the Mac Studio checker with `INTERNAL_SECRET` | None |
| 10 | `idiq-canary` (WF-16) | VERIFIED | Cron daily 13:00 UTC (`wrangler.toml:10`) | POST /run-canary; Slack alert on failure | None |
| 11 | `nafa-r2-cleanup` | VERIFIED | Cron Sundays 00:00 UTC (`wrangler.toml:8`) | R2 deletes (90-day retention) | None |
| 12 | `date-booked-normalizer` | **RESOLVED (was UNCLEAR): Monday-only, no Close exposure** | Cron `*/15 * * * *` (`wrangler.toml:11`); optional `GET /run?key=` | Fixes Date Booked (`date4`) rows on Repair Leads board `7620745327` stamped one day early by the WF-03 Zapier timezone bug (`src/index.js:1-31`); Slack notice to payment-alerts. **Never touches Close. Drop it from the re-point list** | None (VERIFIED) |
| 13 | `tcb-client-reports-monday-sync` | VERIFIED + routes named | `GET /match-clients`, `GET /get-client-state`, `POST /sync-scores` (`src/index.js:35-41`), called by the tcb-client-reports browser tool ("Sync to Monday" panel, used by Kay) | Monday Repair Clients Source board scores + capture status | None |
| 14 | `affiliate-partner-sync` (WF-22) | CORRECTED on two counts | GHL Marketing partner-booking webhook -> `POST /affiliate-booked` (`src/index.js:220`) | Close lead/opp on the Affiliate Partners pipeline at **"Interested Partner"** (`wrangler.toml:28`), NOT "Call Booked" (that stage was deleted in Close, per README:5). **Uses `BDCR_PIPELINE_ID` (old id, `wrangler.toml:35`, read at `src/index.js:113`) to detect an ACTIVE BDCR opp and split the booking onto a sibling "(Affiliate)" lead** (`src/dedup.js:26`) | **YES (indirect)**: the dedup check targets the old pipeline (see 2.9) |
| 15 | `fireflies-meeting-logger` (WF-35) | VERIFIED (now TypeScript) | Fireflies "Transcription completed" webhook | Google Sheet append (Randi CSM transition) | None |
| 16 | `quiz-email-draft` (WF-54) | **NEW** | `tcb-website` `/api/quiz` forwards to `POST /intake` (`src/index.js:313`); `POST /draft` (`:314`) | Close lead find-or-create + quiz note + **opp at Lead Opt-In** (`src/sync.js:144-148`, status var `wrangler.toml:49`, no pipeline_id in the POST, Close derives it); GHL Marketing contact + tag; Slack; Anthropic (claude-sonnet-4-6) drafts the follow-up email | **YES**: `wrangler.toml:49` (see 2.8) |
| 17 | `careers-intake` (WF-55) | **NEW** | `tcb-website` `/api/careers` forwards to `POST /intake` (`src/index.js:187`) | Close lead (own applicant lead-status bucket, `wrangler.toml:12`; **no opportunity, no pipeline**) + note; Monday Hiring board; AI-personalized context paragraph | None |
| 18 | `close-partner-ghl-sync` (WF-58) | **NEW** | Close webhook `whsub_3fjk...` -> `POST /close-webhook` (`src/index.js:166`), signature-verified; `POST /reconcile`; cron daily 10:30 UTC self-healing reconcile (`wrangler.toml:21`) | GHL Marketing TAGS only (4 managed partner tags) + contact create + Close CF link write-back. Event gate: opportunity events are dropped unless `pipeline_id === AFFILIATE_PIPELINE_ID` (`src/index.js:65-73`); lead events only for Partner-* status transitions | None (Sales-pipeline events skipped by design) |
| 19 | `onboarding-form-close-sync` (WF-59) | **NEW** | GHL Repair "3 - OB Form Submitted + S.P.A.D.E. Request" webhook -> `POST /onboarding/submitted` (`src/index.js:288`) | Close lead note "On-Boarding Form Submitted" + mirrors the S.P.A.D.E. email into the lead's email feed (log-only). Marker-deduped. Never creates leads | None |
| 20 | `hkd-ach-sync` (WF-56) | **NEW as a worker; CORRECTED: no longer paused, LIVE** | Cron daily 21:00 UTC (`wrangler.toml:22`) + `POST /run`, `/backfill`, `GET /status` (`src/index.ts:93-123`) | Parses HKD Law biweekly ACH PDFs from Gmail (domain-wide-delegation impersonation of help@/chris@/josh@), archives to R2, fuzzy-matches clients, files "HKD Payment" subitems on the Payment Schedule board. Migrated out of tcb-mission-control | None |
| GONE | `monday-true-offboarding-autofill` (WF-21) | **GONE** | Directory deleted from the live repo; catalog status DEPRECATED | n/a | None |

### Mac Studio services, MCP, config, scripts

| Asset | Verdict | Notes |
|---|---|---|
| `services/idiq-login-checker` (WF-17, 23, 24, 25) | VERIFIED + one audit question RESOLVED | Express + Playwright; writes check results (Verified / Needs Attention / Failed), notes, and follow-up tasks to Close leads; MyScoreIQ supported alongside IdentityIQ. **The service itself writes NO opportunity stages** (grep of `services/idiq-login-checker/*.js` finds no stage writes): the WF-24 NAFA auto-generation path ends by attaching the PDF to Monday (`playwright-nafa.js` flow, gated by `NAFA_AUTOGEN_ENABLED`, `server.js:2065,2228`), which fires nafa-audit-sync's Monday webhook, and **the Audit Complete stage move lives only in nafa-audit-sync**. WF-24 catalog status: LIVE. The flag's runtime value is PM2 env on the Mac Studio, not in the repo |
| `services/bdcr-tech-ops-chat` | VERIFIED | Diagnostic agent for Mission Control Tech Ops Chat; investigator only. Its knowledge of the pipeline comes from `config/workflows.json`; keep the catalog updated in the re-point PR and its answers stay correct |
| `mcp-servers/gmail-attachments` | VERIFIED | Present with full source; MCP for Claude sessions, no pipeline exposure |
| `config/kv-mappings.json` | VERIFIED, the primary re-point artifact | Old pipeline id (`:3`) + **8-stage** stage_to_lead_status map (`:4-45`), CORRECTED from the audit's doc-derived 5 stages: adds Eligibility Call Booked -> Eligibility Call Booked, Strategy Call Booked -> Intake Form Needed, Intake Submitted -> Audit Needed, before the known Audit Complete -> Ready For Call, Call Completed, Closing, Closed Won -> Closed Client, Lost. Also holds SendBlue templates + per-salesman phone map |
| `config/workflows.json` | VERIFIED | Canonical 61-workflow catalog (v14, 2026-07-07), consumed by Mission Control's Workflow Map + Tech Ops Chat. Repo rule: any workflow change MUST update the catalog in the same PR, enforced in CI (`CLAUDE.md:24`, `.github/workflows/validate-workflows.yml`) |
| `config/salesmen.json` | NEW-to-audit | SendBlue routing roster (name, email, sendblue_number/identity, GHL Repair user id) used by Worker A; currently one entry (Anthony Gilchrist) |
| `scripts/seed-kv.js` | VERIFIED | The mapping-only re-point deploy step: edit `kv-mappings.json`, re-seed KV `ce3fbd35...`, no worker redeploy needed for KV-driven matches (worker-a lead-status derivation, worker-b non-won stages) |

### Referenced but NOT in this repo (out-of-repo consumers)

- **`BDCR-salesmen-dashboard` GitHub repo** (the `bdcr-sales-dashboard-api` worker + frontend at sales.thecreditbrothers.com). Owns WF-26 Send Agreement, WF-32 Clients tab, WF-38 setter booking, WF-40 lead health check, WF-57 setter form. Only `apps/salesmen-dashboard/data-map.md` + CLAUDE.md are staged in the monorepo; code migration is a future wave (`apps/salesmen-dashboard/CLAUDE.md:13`). **WF-38 writes old-pipeline stages** (see 2.10). **WF-32 CORRECTED: the Clients tab reads the MONDAY Payment Schedule board (board 7117839824 via 60s KV cache), NOT Close won-stage queries** (`config/workflows.json` WF-32 actions), so it survives the pipeline swap as long as Worker B keeps creating/promoting Monday parents at the new won stages.
- **`bdcr-call-transcriber`** (WF-18/19/20/20B): still standalone; planned to land as a sibling under `workers/` in a later wave (root README:35-37). No stage exposure documented.
- **`mission-control` repo** (Mac Studio, admin.thecreditbrothers.com), **`tcb-client-reports` repo** (browser tool calling worker #13), **`tcb-website` repo** (thin validate-and-forward shims to quiz/careers workers; no direct CRM calls as of 2026-06-25 per root `CLAUDE.md:47-49`).
- **GHL-native workflows**: WF-01 reminders, WF-02 SendBlue intro, WF-28 cooldown, WF-33/34/42 invoice triggers, WF-36 Repair-contact creation at booking, the Repair Fulfillment onboarding workflows fired by Worker B's WF-15 webhook POST.
- **Zapier, now fully catalogued** (resolves open question 5 of the 7/10 audit): WF-03 booking Zap LIVE (see 2.2); WF-43 intake -> Monday board updates (complementary to WF-04, verified not double-processing); WF-44 mailed-docs -> Slack; WF-45 Stripe charge -> ClickMagick attribution; WF-46 affiliate referral -> Close lead, toggled OFF 2026-06-13; WF-47 support-email ping; WF-48 Skool sign-up -> Slack + GHL (not Close) opportunity; WF-49 POA update -> Slack; WF-50 legacy "New In-House Client" (zap `251224074`) **toggled OFF in Zapier 2026-06-13, CORRECTED: the 7/10 audit's "pending manual disable" is resolved, and the zap id ambiguity is resolved too: `302729523` is the LIVE WF-03 booking Zap, not the legacy one**; WF-51 funding-pipeline call -> Close lead (lead only, no Sales-pipeline opp); WF-52/53 access-code email relays -> Slack.

---

## 2) The re-point list (priority-ordered, line-verified)

Old-pipeline statuses are per-pipeline objects in Close: writing an old `stat_` id onto a new-pipeline opportunity yanks the card back to the old pipeline; matching on old ids against new-pipeline events silently no-ops. Verified failure shapes per item below.

**Mechanism summary (what kind of change each re-point is):**

| Where the ids live | Assets | Change type |
|---|---|---|
| KV config (`config/kv-mappings.json` + `scripts/seed-kv.js`) | worker-b stage table, worker-a pipeline id + lead-status derivation | Config edit + re-seed, no redeploy |
| Hardcoded in worker source | worker-b `:252`, worker-a `:244`, nafa-audit-sync `:539-540,568-569`, contract-signed-webhook `:144` | CODE change + redeploy |
| `wrangler.toml` [vars] | ghl-optin-close-sync (6 vars), quiz-email-draft (1 var), affiliate-partner-sync (1 var) | Var edit + redeploy |
| Out of repo | WF-03 Zap steps, BDCR-salesmen-dashboard WF-38 stage constants + WF-40 stage-aware spec | Zapier editor / dashboard repo |
| Catalog + docs | `config/workflows.json` (e.g. `:1914`, `:2004`), `docs/manual-lead-backfill-runbook.md:118`, `docs/bdcr-e2e-testing-plan.md:22,38` | Same-PR doc updates (CI-enforced for the catalog) |

### 2.1 PRIORITY 0: Worker B Closed Won handler (the onboarding trigger). VERIFIED, now with exact mechanics

**Route and matching:** Close webhook `whsub_62FTMcyRA9vz73x00AZryT` on `opportunity.updated` -> `POST /stage-change` (`worker-b/src/index.js:1444` -> `handleStageChange` `:1375`). The handler reads the KV `config` key (`:1393`), looks up `stage_to_lead_status[newStatusId]` **by status id, not label** (`:1398`), and returns `{skipped}` for unmapped stages (`:1399-1405`): the silent-stop shape is confirmed in code. **There is NO pipeline_id guard**: the `pipeline_id` field in kv-mappings.json is documentation only, nothing reads it. Closed Won is special-cased by comparing against the **hardcoded** `CLOSED_WON_STAGE_ID` (`:252`, compared `:1411`), so the won re-point is a code change, not just KV.

**Idempotency:** VERIFIED. Key `closed_won:<lead_id>` (`:1193`), checked before any side effect (`:1194-1198`), written after the chain with 90-day TTL (`:1316`). Manual retry: delete the KV key (comment `:1189-1190`). Known accepted race: two webhooks within ~1s can both pass (KV eventual consistency, `:1191-1192`).

**The Closed Won chain, in verified order** (`handleClosedWon` `:1185-1329`):
1. Lead status -> "Closed Client" (`:1201`, id from the KV map).
2. Slack win alert via `SLACK_WEBHOOK_URL` webhook (`:1221-1250`; the channel `C069L4NFGSZ` sits behind the webhook, not in code).
3. Onboarding email WF-10: Close template `tmpl_hy4HTg...` from `support@thecreditbrothers.com` via connected account `emailacct_KFmg...` (`:1258-1267`).
4. Monday client records WF-14 (`:1278`): create-or-REUSE Repair Clients Source item (idempotent via GHL CF `KtMqDn2t...`, with a terminal-row guard so returning clients get a fresh row, `:663-703`); create-or-PROMOTE Payment Schedule parent (moves the sync-worker-created parent from "New Invoices" to the group keyed off Invoice Type, patches salesman + board relation, `:809-915`); **NEW: locks the closer's commission rate at close** (10%/15% from prior half-month close rate computed off the Repair Leads board, cached in KV `comm_rate:*`, `:387-389, 540-583, 850-859`); GHL Repair contact gets both Monday ids written back (`:921-930`); live email/phone fallback lookup + Close write-back when the GHL Repair CF is missing (`:990-1018`).
5. **NEW (WF-43): attaches the original signed agreement PDF to the Monday client item** (`:1285`, fetch from GHL public viewer endpoints resolved from the lead's Agreement CF `cf_BQj46...`, `:54-147`).
6. **NEW: marks the Repair Leads board row Closed + write-once stamps Joined Program** (`markRepairLeadClosed` `:1298`, board `7620745327`, matched by GHL Repair id then Close lead id; fulfillment alert if no row matches, `:1142-1151`).
7. GHL Repair iMessage WF-15: POST to the inbound webhook trigger (`:601`, called `:1307`); explicitly NOT idempotent on its own (comment `:625-626`), relies on the step-0 guard.
8. KV idempotency marker write (`:1316`).

Non-won mapped stages take the simple path: lead-status sync only (`:1417`).

**Required change:** map all new-pipeline `stat_` ids in `config/kv-mappings.json` + re-seed, AND change `CLOSED_WON_STAGE_ID` at `:252`. The new pipeline has TWO won stages (Won PIF, Won PP): the single-constant comparison at `:1411` must become a set (or the KV entries need a `is_won` flag). Decide Deposit's role (Open Question 1).

**Risk if unmapped (SILENT STOP): VERIFIED as designed behavior** (`:1399-1405`). A Won PIF/Won PP close on the new pipeline produces no email, no Slack, no Monday records, no commission stamp, no agreement attach, no Repair-Leads close stamp, no iMessage. Downstream, WF-29 keeps creating Payment Schedule parents in "New Invoices" that nothing promotes, and (new since the board reorientation) the Repair Leads board never shows Closed, so the sales dashboard's close signal (`leadStatus = Closed`, data-map 4.7) also goes dark. Worse than the 7/10 audit knew.

**Risk in the other order (DOUBLE-FIRE): confirmed, one nuance.** The 90-day TTL (`:1316`) means bulk-moving historical won cards re-fires the full chain for any client won more than ~90 days ago. Mitigation unchanged: re-point first, migrate OPEN opportunities only (July 2 decision, old pipeline stays historical), and consider adding a `pipeline_id` guard in `handleStageChange` since none exists today. Note the re-seed itself REPLACES the KV map, so after re-seeding, old-pipeline events no-op automatically; the hardcoded `:252` constant is the only place an old id could linger.

### 2.2 PRIORITY 1: Zapier booking Zap (WF-03). CORRECTED in three places

The live Zap is **"0 - Lead Booked Call (WEBHOOK VERSON)", id `302729523`, v45, 91 steps**, now fully documented in-repo (`docs/zap-wf03-internals.md`, read 2026-06-29). Corrections to the 7/10 audit:
1. It creates the opp at **"Strategy Call Booked"** (old id `stat_IIjg...`) with lead status "Intake Form Needed", NOT at a "Call Booked" stage.
2. It creates the lead+opp ONLY when neither the email find nor the phone find matches (v45 added phone dedup); existing leads get a reschedule path with **status unchanged**.
3. The id ambiguity is resolved: `302729523` IS the live booking Zap. The legacy "1 - New In-House Client" Zap is `251224074` (WF-50) and was **toggled OFF in Zapier 2026-06-13**: the audit's "pending manual disable since 2026-05-12" is closed.

Change: re-point the Zap's Close create-opportunity step(s) to the new pipeline's booking stage. The new pipeline splits **Setter Booked / Self Booked**: WF-03 fires only for lead-initiated public-funnel bookings (setter-internal calendars are excluded from its GHL trigger workflow), so WF-03 plausibly maps to Self Booked while WF-38 (dashboard setter bookings) maps to Setter Booked, but the old flow's Lead Opt-In -> Eligibility -> Strategy ladder does not correspond 1:1 to the new entry stages: needs Josh's mapping (Open Question 3). Failure shape: silent mis-route onto the old pipeline (not a stop).

### 2.3 PRIORITY 1: Worker A `/intake-submitted` (WF-04). CORRECTED failure shape

Verified mechanics (`worker-a/src/index.js`): pipeline id comes from KV (`config.pipeline_id`, `:243`) and scopes the opportunity lookup (`findExistingOpportunity` `:212`, called `:254`); the stage id is **hardcoded** (`:244`); the lead status is derived from the KV map **keyed by that hardcoded id** (`:245`); the opp is PUT to Intake Submitted (`:261`) and the lead to Audit Needed + credit-monitoring CFs (`:265-300`).

The audit's (a)-yank vs (b)-silent-stop question resolves to: **(c) hard error.** If KV is re-seeded with new-pipeline ids but `:244` is not updated, line `:245` throws (`stage_to_lead_status[oldId]` is undefined), the request 500s, and the worker alert fires. If neither KV nor code changes, the KV pipeline filter finds no old-pipeline opp for new leads and returns 404 "No existing opportunity found". Change: new **Intake Form Submitted** id at `:244` + the KV remap (2.1's edit covers the map; the KV `pipeline_id` field covers the lookup).

### 2.4 PRIORITY 1: nafa-audit-sync (WF-30) and the WF-24 auto-audit path. VERIFIED + resolved

`nafa-audit-sync/src/index.js`: `PIPELINE_ID` `:539`, `AUDIT_COMPLETE_STAGE_ID` `:540`, and a forward-only guard listing the two allowed FROM stages, old Strategy-Call-Booked (`:568`, comment says "Call Booked") and Intake Submitted (`:569`). All three plus the pipeline id are code changes. The new pipeline's equivalent from-set (at least Setter Booked, Self Booked, Intake Form Submitted) needs deciding alongside the target Audit Complete id.

RESOLVED from 7/10: the WF-24 auto-generation path's stage move does NOT live in the Mac Studio service; the service attaches the PDF to Monday and **nafa-audit-sync's Monday webhook is the only Audit Complete writer**. One re-point covers both the manual and auto paths. `/direct-upload` (dashboard-initiated) skips the stage move entirely (`:30`, header comment `:11-17`).

### 2.5 PRIORITY 1: contract-signed-webhook (WF-11). VERIFIED

`CONTRACT_SIGNED_STAGE_ID` `src/index.js:144` (code change), written by `moveOppToContractSigned` `:296-300`. Lead lookup is by GHL Marketing contact id CFs with an active-opp preference (`:222-260`), NOT pipeline-scoped, so on a new-pipeline opp it would write the old id and yank the card: the (a) shape. Also verified: `/contract-sent` drops a sent-note only (`:536-584`); whether it should move the card to the new **Contract Sent** stage is a product decision (Open Question 6). Design note in code: signing deliberately does NOT move to Closed Won; Closed Won stays a manual salesman move (`:136-143`).

### 2.6 PRIORITY 1: Worker B stage-to-lead-status table (WF-05..09). CORRECTED: 8 stages, not 5

The live KV map (`config/kv-mappings.json:4-45`) covers: Eligibility Call Booked -> Eligibility Call Booked, Strategy Call Booked -> Intake Form Needed, Intake Submitted -> Audit Needed, Audit Complete -> Ready For Call, Call Completed -> Call Completed, Closing -> Closing, Closed Won -> Closed Client, Lost -> Lost. The new pipeline's stages (Setter Booked, Self Booked, Intake Form Submitted, Audit Complete, Contract Sent, Contract Signed, Deposit, Won PIF, Won PP, Lost, DQ On Call, plus the rest of the 19) need a decided mapping (Open Question 2), not id substitution. Any stage left unmapped silently skips (`worker-b/src/index.js:1399-1405`), which may be CORRECT for stages that shouldn't sync a lead status: make the omissions explicit decisions.

### 2.7 PRIORITY 2: ghl-optin-close-sync (WF-39/41). CORRECTED: fully known, config-level re-point

Everything the 7/10 audit presumed is now line-verified, and the exposure is wider: opp creation at Lead Opt-In for Paid Media opt-ins (`wrangler.toml:44-45`, value `:52`), eligibility advance to Eligibility Call Booked + its lead status (`:83-84`), and the 8-id `BDCR_PIPELINE_STAGE_ORDER` forward-only ladder (`:87`, logic `src/pipeline.js:37-44`). The guard degrades SAFE on unknown ids (unknown target or current -> no write), so an un-re-pointed worker facing new-pipeline opps silently stops advancing rather than corrupting. Re-point = edit 6 vars + redeploy; no source change. Where the new pipeline puts "Lead Opt-In" and "Eligibility Call Booked" equivalents is Open Question 3 (they are not in the new stage list we have).

### 2.8 PRIORITY 2: quiz-email-draft (WF-54). NEW entry on the list

Creates a Lead Opt-In opp per quiz submission (`src/sync.js:144-148`; status id `wrangler.toml:49`; POST omits pipeline_id, Close infers it from the status). Same mis-route shape as 2.2. Re-point = 1 var + redeploy, plus the same "which new stage is opt-in" decision as 2.7.

### 2.9 PRIORITY 2: affiliate-partner-sync (WF-22). CORRECTED: on the list after all

The 7/10 audit called it unaffected. The partner pipeline side is indeed separate, but the worker reads `BDCR_PIPELINE_ID` (`wrangler.toml:33-35`, `src/index.js:113`) to detect whether the booking lead has an ACTIVE BDCR sales opp and split it onto a sibling "(Affiliate)" lead (`src/dedup.js`). Left un-re-pointed, a partner booking by an active NEW-pipeline prospect would attach to the sales lead instead of splitting, polluting live sales reporting. Re-point = 1 var; decide whether it should check the new pipeline only or both during the transition (Open Question 5).

### 2.10 PRIORITY 2: out-of-repo dashboard writers (BDCR-salesmen-dashboard repo), NOW LINE-VERIFIED (2026-07-11 pass, full detail in Section 8)

- **WF-38 setter booking (`POST /book-call`) writes stages, LINE-VERIFIED in the BDCR-salesmen-dashboard repo**: old pipeline hardcoded `CLOSE_PIPELINE_ID = 'pipe_7QGKHLVYed30khcc1R8PyN'` (`workers/bdcr-sales-dashboard-api/src/index.js:1711`); per-callType stage config: eligibility -> opp stage `stat_QFUjvbNKHkWGWryTHRiSaQnzvsGSY58PxQTeSml7SFp` + lead status `stat_1qewgpNNm5ROdmQRqf3qkk8TSgZCqUhkZZZvUoZ0gHa` (`:1695-1696`), strategy -> opp stage `stat_IIjgYAr7REzK4lee8bRBNPyxUuNFOMl5wOnOzmF0pj9` + lead status "Intake Form Needed" `stat_byAkxwfl1nflyF0AO68eCKd865Kjshc9fhzsgX0po8U` (`:1703-1704`). Write site: `POST opportunity {lead_id, status_id, pipeline_id}` (`:2136-2144`) then `PUT lead/{id} {status_id}` (`:2148-2150`). Failure shape un-re-pointed: silent mis-route, setter bookings keep landing opps on the OLD pipeline (write is non-blocking, `:2129-2131`, so the setter UI shows success either way). Both constants must move together (pipeline_id is passed explicitly "to be defensive", `:2139-2141`; swapping only one of the two 400s or mis-routes). Lead statuses are org-level in Close (not per-pipeline), so the two `closeLeadStatusId` values survive the swap mechanically; whether they SHOULD change is Open Question 2. Note WF-41's catalog entry claims single-writer ownership of eligibility advances; the optin worker's forward-only guard makes the overlap converge (same-stage writes no-op), but pick one owner when re-pointing.
- **WF-40 lead health check, LINE-VERIFIED**: read-only + id-backfill-only confirmed in code (fix writes are CF/column backfills only, no workflow re-runs: `lead-health.js:324-327, 341-344`). The stage table lives in `lead-health-spec.js:31` (old pipeline id) and `:35-44` (all 7 old stage ids + Lost). Consumed at `lead-health.js:209-212`: filters the lead's opps to the OLD pipeline (`:210`), falls back to newest any-pipeline opp (`:211`), maps `status_id` through the old-stage table (`:212`). Failure shape on a new-pipeline opp: stage resolves null -> `requirementFor` returns `not_applicable` for EVERY artifact/link (`lead-health-spec.js:193-201`) -> health checks silently stop flagging missing artifacts (report shows `stage: "unknown (<label>)"`, `lead-health.js:479`). Re-point = rewrite the STAGES table with the new stage ids + per-artifact `requiredFrom` decisions (a mapping decision like 2.6, not id substitution).
- **WF-32 Clients tab**: dropped from the re-point list (reads Monday, not Close; see Section 1).
- **WF-26 Send Agreement**: writes GHL merge fields + sends the contract; no Close stage writes (the note leg goes through `/contract-sent`). No re-point.
- **Mission Control / Tech Ops Chat**: keep `config/workflows.json` entries (stage names in `:1914`, `close_bdcr_pipeline` in `:2004`, trigger descriptions) updated in the same PR, CI-enforced (`CLAUDE.md:24`).

### 2.11 No change needed (line-verified where it matters)

`close-call-workflow-exit` (call filter only, no stage/pipeline test, `src/index.js:149-158`), `ghl-inbound-sms-workflow-exit`, `date-booked-normalizer` (Monday-only, RESOLVED), `payment-schedule-sync` (invoice-triggered; its new Close mirror writes a lead CF + note, no stages; but see 2.1 for its dependency on Worker B's promote step), `close-partner-ghl-sync` (affiliate-pipeline gate `src/index.js:65-73`), `onboarding-form-close-sync` (notes only), `careers-intake` (no opp), `hkd-ach-sync`, `idiq-login-checker` worker + service + canary, `nafa-r2-cleanup`, `fireflies-meeting-logger`, `tcb-client-reports-monday-sync`, `gmail-attachments`. Docs to sweep in the same PR: `docs/manual-lead-backfill-runbook.md:118` (backfill instructions point at the old pipeline), `docs/bdcr-e2e-testing-plan.md:22,38`.

---

## 3) Collision check: their fleet vs our dashboard (re-run against live code)

Our system (unchanged, `dashboard/`): inbound Close webhook on `lead.created/updated`, `opportunity.created/updated` (`dashboard/app/api/webhooks/close/route.ts:9-11`); faithful mirror by `close_id` (`dashboard/lib/sync/normalize.ts:5-8`); outbound allow-list `close_update_opportunity_stage`, `close_create_note`, `ghl_create_contact_note` (`dashboard/lib/sync/writeback.ts:6-10`); single stage-write call site = form outcomes (`dashboard/lib/forms.ts:294`).

1. **Coexistence of webhooks: still safe, and there are now THREE of theirs.** `whsub_62FT...` (worker-b, opportunity.updated), `whsub_1gd5...` (call activity), `whsub_3fjk...` (close-partner-ghl-sync: lead.updated/deleted + opportunity.created/updated/deleted, added 2026-07-05). All independent of ours.
2. **Our stage write-back is a trigger source for Worker B: unchanged and now bigger.** A dashboard-driven move to a mapped stage fires lead-status sync; to a won stage (post-re-point) it fires the FULL chain, which now also stamps commission, attaches the agreement PDF, and closes the Repair Leads row. Desired parity, but worth restating to Josh: the dashboard becomes one of the hands that can pull the onboarding trigger, suppressed within 90 days by the KV marker.
3. **Our stage write-back also reaches close-partner-ghl-sync and is correctly ignored**: its opportunity gate requires the Affiliate pipeline (`src/index.js:65-73`), so Sales-pipeline events return `{skipped, reason: 'other_pipeline'}`. No loop.
4. **No stage-to-stage loops: re-verified.** Worker B writes lead STATUS, never stages (`:1201`, `:1417`); contract-signed/nafa/worker-a stage moves are event-driven from GHL/Monday, not from `opportunity.updated`; nothing of theirs reacts to a stage change by writing a stage.
5. **Notes: both sides write more of them now, still nobody reacts.** New Close note writers on their side since the 7/10 audit: contract-signed-webhook's signed-PDF attachment note (`:105-109`), onboarding-form-close-sync's OB note + email mirror, payment-schedule-sync's invoice-mirror note (`close-mirror.ts`), quiz/careers notes. Their three subscriptions cover opportunity, lead, and call-activity events only, no `activity.note` subscription, and we don't subscribe to notes either. Still safe; re-check if a GHL "note added" trigger ever appears.
6. **Close lead FIELDS: a new shared-surface nuance, no conflict.** The 7/10 audit said "we write no Close lead fields, they write few". Their side now writes the lead CF "Invoice" (`cf_ImIdEUBO...`) from payment-schedule-sync (and the dashboard writes the same field at send time, they dedupe between themselves via the fixed invoice title, `close-mirror.ts:33-36`). We still write no lead fields. No contention.
7. **NMI: zero overlap, verified.** A repo-wide grep for nmi/NMI/deposyt across workers/apps/packages/services returns nothing: no code in their fleet consumes NMI or its silent post. Their payment visibility is GHL invoices (payment-schedule-sync) plus the WF-45 Stripe -> ClickMagick attribution Zap. Our daily NMI poll has the silent-post surface to itself. (`docs/nmi-reference.md` exists as reference documentation only.)
8. **One hazard on OUR side to retire, unchanged: the won-stage fallback.** `OUTBOUND_FALLBACKS` mapping `won_pif`/`won_pp`/`deposit` to `closed_won` (`dashboard/lib/sync/writeback.ts: RESOLVED July 10, the won_pif/won_pp/deposit to closed_won fallbacks were removed and deployed; only strategy_call_booked to self_booked remains (new-pipeline direction, safe)...`), yanking the card to the old pipeline AND detonating Worker B's chain from a dashboard action. Remove after migration.
9. **Bulk-migration burst: now hits three of their subscribers.** Us (idempotent mirror), Worker B (2.1 double-fire analysis applies), close-partner-ghl-sync (cheap skips). Sequence: re-point first, move OPEN cards only, watch Worker B logs.
10. **No other shared write targets.** Monday: theirs live, ours one-time import. GHL: our Marketplace-app events + contact notes vs their workflows/tags/CFs; disjoint. Slack: separate channels. Gmail: their hkd-ach-sync DWD reads are unrelated to us.

---

## 4) Slack surface (their notification map, updated)

| Channel | Producer | Content | Evidence |
|---|---|---|---|
| Win alerts channel `C069L4NFGSZ` (behind `SLACK_WEBHOOK_URL`) | Worker B (WF-08) | "New Client Signed" win alert: client, salesman, Close link | `worker-b/src/index.js:1221-1250` |
| `#1-signed-agreements` (behind `SLACK_SIGNED_AGREEMENTS_WEBHOOK_URL`) | contract-signed-webhook | "Agreement Signed" with signed-at + links | `contract-signed-webhook/src/index.js:404-450` |
| Sales x fulfillment channel (behind `SLACK_FULFILLMENT_WEBHOOK_URL`) | Worker B | "Fulfillment action needed": missing GHL Repair link, Monday errors, unmatched Repair Leads row | `worker-b/src/index.js:212-248, 1144-1150` |
| Payment alerts channel (keycap-zero name) | payment-schedule-sync; ALSO date-booked-normalizer correction notices | Invoice payment alerts; TZ-fix notices | `payment-schedule-sync/src/lib/slack-*.ts`; `date-booked-normalizer/src/index.js:80-96` + its CLAUDE.md |
| **Worker-error alert channel `C0BA7KS05UM`** | **NEW: fleet-wide `alert.js` on 12 wired workers** (bot token, 60s throttle, never throws) | Unrecoverable handler errors with context | `docs/observability.md:37-39`; e.g. `worker-b/src/alert.js`, wired `worker-b/src/index.js:1456-1461` |
| **Setter reports channel `C0BE0144HRU`** (keycap-seven name) | NEW: WF-57 setter form (dashboard repo, via `tcb_bot`) | Per-submission setter attribution summaries | `config/workflows.json` WF-57 actions |
| IDIQ results channel (via env) | idiq-login-checker service; canary on failure | Block Kit login-check results | service README; WF-16/17 catalog entries |
| Quiz notifications | quiz-email-draft (WF-54) | Quiz intake notification | WF-54 catalog entry |
| Zapier private channels | WF-44/47/49/52/53 | Mailed docs, support pings, POA updates, access codes | catalog entries |
| Ad-hoc | bdcr-tech-ops-chat `post_to_slack` (confirmation-gated) | Agent-composed messages | service README |
| Commission channel (manual client process) | Manual | Commission postings | our `CLIENT-DECISIONS.md:130` |

Migration note unchanged: win alert + fulfillment alerts + (new) commission stamp, agreement attach, and Repair-Leads close stamp are all Closed Won side effects and inherit the 2.1 silent-stop until Worker B is re-pointed.

---

## 5) New since the June 12 consolidation (not in the archived docs)

Each item: trigger, reads, writes.

1. **quiz-email-draft worker (WF-54)** and **careers-intake worker (WF-55)**: website intake consolidation. `tcb-website` `/api/quiz` and `/api/careers` are thin forwarders; the workers own Close (lead + note; quiz also an old-pipeline Lead Opt-In opp), GHL tagging, Monday Hiring board, Slack, and Anthropic drafting/personalization. Quiz is on the re-point list (2.8).
2. **close-partner-ghl-sync worker (WF-58)**: Close smart view "BDCR Affiliate Partners" + Partner-* lead statuses mirrored to 4 managed GHL Marketing tags. Third Close webhook subscription (`whsub_3fjk...`, signature-verified, a first for the fleet), daily reconcile cron. Reads Close saved-search + leads; writes GHL tags + Close CF link write-back only.
3. **onboarding-form-close-sync worker (WF-59)**: GHL Repair OB-form webhook -> Close OB note + verbatim S.P.A.D.E. email mirrored into the lead's Close email feed (log-only). Marker-deduped.
4. **hkd-ach-sync worker (WF-56)**: HKD Law ACH PDFs from Gmail (DWD impersonation) -> parsed -> Monday Payment Schedule "HKD Payment" subitems + R2 archive; daily cron. CORRECTED from the 7/10 audit: this is no longer the paused mission-control pipeline, it is LIVE as a worker.
5. **Worker B chain growth (all inside Closed Won)**: commission-rate locking (10%/15% engine mirroring the dashboard), signed-agreement PDF attach to Monday (WF-43), Repair Leads board Closed + Joined Program stamping, plus the `/lead-status-changed` Monday webhook route (manual board closes get the join date stamped). Also: legacy "(2 Round Max)" item-name suffix removed 2026-07-08.
6. **payment-schedule-sync Close mirror (2026-07-07)**: invoice URL -> Close lead CF "Invoice" + note on InvoiceCreate; dashboard-created invoices excluded to prevent double-mirror. Plus full invoice lifecycle handlers (update/void/refund/partial) and a past-due cron.
7. **nafa-audit-sync `/direct-upload`**: dashboard-initiated NAFA PDF upload (bearer-gated, via service binding from the dashboard worker); skips note/stage/violation steps.
8. **worker-a pending-links cron**: every 2 minutes drains KV-queued Repair-contact links that raced Close's search index.
9. **Fleet observability**: per-worker `alert.js` posting handler errors to Slack `C0BA7KS05UM` on 12 workers; Workers Logs enabled on ghl-optin-close-sync.
10. **Workflow catalog governance**: `config/workflows.json` (61 WFs) with CI validation (bidirectional connections, live-link + plain-English-note requirements); `scripts/generate-workflows-json.js --check`.
11. **Zapier fleet catalogued** (WF-43..53): see Section 1; two Zaps confirmed OFF (WF-46, WF-50).
12. **New integrations**: Dub (affiliate short-link attribution network, in progress, `briefs/dub-affiliate-network.md` + `docs/dub-reference.md`); Kick.co (books MCP); Linq; Google Workspace DWD service account; MyScoreIQ support in the credit checker (WF-17 fallback logic); Mason/Vera AI builder/verifier loop for IDIQ parser fixes (Phase 1.5, human-approved); TCB mobile app (deferred plan).
13. **apps/ scaffolds + `salesmen-dashboard/data-map.md`** staged as the canonical metric spec; the Repair Leads board reorientation (single close signal `leadStatus = Closed`, uniform Showed Up marker) is partially shipped (Phase A marker + Worker B stamping live; the rest of the brief is Deferred, spec ready).

Nothing in the new set consumes NMI; overlaps with our dashboard are covered in Section 3.

---

## 6) Open questions for Josh (refreshed to live truth)

Resolved since 7/10 and removed: ghl-optin-close-sync internals (now line-verified), date-booked-normalizer (Monday-only), the Zapier catalog + zap-id ambiguity + legacy-Zap disable (all confirmed in-repo), where the WF-24 stage move lives (nafa-audit-sync), where the dashboard worker lives (`BDCR-salesmen-dashboard` repo), WF-32's exposure (none, reads Monday), repo access (this pass).

1. **Which new stages fire the Closed Won chain?** Won PIF + Won PP presumably; is **Deposit** excluded? Code change either way (`worker-b/src/index.js:252` is a single-id comparison today). Please confirm the intended set and each stage's exact `stat_` id (we have none of the new ids yet; nothing in the repo lists them).
2. **Stage-to-lead-status map for all 19 new stages** for `config/kv-mappings.json`: which lead status should each new stage set, and which stages should deliberately NOT sync (unmapped = skipped by design)? Or is lead-status sync retired in favor of the pipeline itself?
3. **Entry-stage mapping**: the old funnel's Lead Opt-In, Eligibility Call Booked, and Strategy Call Booked have no obvious equivalents in the new stage list. Where do (a) quiz/paid-media opt-in opps (WF-54, WF-39), (b) eligibility bookings (WF-41), and (c) WF-03 public-funnel bookings vs WF-38 setter bookings land? Is the intended split WF-03 -> Self Booked and WF-38 -> Setter Booked?
4. **nafa-audit-sync forward-only guard**: which new stages are valid FROM stages for the Audit Complete move (today: Strategy Call Booked + Intake Submitted, `:568-569`)?
5. **affiliate-partner-sync dedup**: after migration should the active-BDCR-opp check (`wrangler.toml:35`) look at the new pipeline only, or both pipelines while open old-pipeline cards still exist?
6. **Contract Sent**: should `/contract-sent` (today note-only, `contract-signed-webhook/src/index.js:536-584`) start moving the card to the new Contract Sent stage?
7. **Migration mechanics**: confirm open-opportunities-only (won/lost history stays on "BDCR Sales" per July 2), re-point BEFORE any cards move, and whether you want a `pipeline_id` guard added to Worker B's `/stage-change` (there is none today) so old-pipeline events can never re-trigger the won chain.
8. **BDCR-salesmen-dashboard repo re-point**: WF-38's stage constants and WF-40's stage-aware spec live there; give us (or your dev) the same line-level pass in that repo. Its Clients tab is safe (Monday-based).
9. **`NAFA_AUTOGEN_ENABLED` runtime value**: catalog says WF-24 is LIVE; the flag is PM2 env on the Mac Studio, not in the repo. Confirm on/off so we know whether auto-audits are part of the cutover-week traffic.
10. **Catalog + docs in the re-point PR**: `config/workflows.json` (CI will enforce it), `docs/manual-lead-backfill-runbook.md:118`, `docs/bdcr-e2e-testing-plan.md`, and the Tech Ops Chat agent's pipeline knowledge (it reads the catalog, so keeping the catalog current covers it).

---

## 7) How our dashboard coexists (summary of shared touchpoints, updated)

| Object | Their writers (live-verified) | Our behavior | Verdict |
|---|---|---|---|
| Close opportunity STAGE | worker-a (Intake Submitted), nafa-audit-sync (Audit Complete), contract-signed-webhook (Contract Signed), ghl-optin-close-sync (Lead Opt-In create + Eligibility advance), quiz-email-draft (Lead Opt-In create), WF-03 Zap (Strategy Call Booked create), WF-38 dashboard worker (Eligibility/Strategy mirror), reps manually | Mirror 1:1 inbound; outbound stage writes only from form outcomes, allow-listed, echo-safe | Safe. The one genuinely shared lever; everything in Section 2 exists to make it safe. Our writes trigger Worker B like any human move; retire our `closed_won` fallbacks post-migration (3.8) |
| Close LEAD (status, fields, notes, files) | worker-b (lead statuses), IDIQ checker service (result fields + tasks), contract-signed (Agreement CF + signed PDF file + notes), payment-schedule-sync (Invoice CF + note), onboarding-form-close-sync (note + email mirror), quiz/careers (leads + notes), ghl-optin-close-sync (GHL-link CFs, Lead Source) | Inbound `lead.*` upserts contacts (merge, never overwrite). Outbound: notes only | Safe; no field contention (we write no Close lead fields) |
| GHL contacts (both locations) | Workflows + workers write CFs (Monday ids, merge fields) and tags (close-partner-ghl-sync's 4 managed tags); sequences fired via inbound webhooks | Marketplace-app reads + nightly poll; outbound contact notes only | Safe; separate subscriptions, no shared fields |
| Monday boards | worker-b (3 boards) + payment-schedule-sync + hkd-ach-sync + tcb-client-reports-monday-sync + date-booked-normalizer + nafa-audit-sync (violation count) write live | One-time history import, read-only | Safe |
| NMI | Nobody (verified: zero NMI code in their fleet) | Daily poll + checkout page | Safe; surface is ours alone |
| Slack | Channels per Section 4 (now incl. worker-error + setter-report channels) | We post nothing to their Slack | Safe |
| Close webhooks | `whsub_62FT...` (worker-b), `whsub_1gd5...` (call activity), `whsub_3fjk...` (partner sync) | Our own lead+opportunity subscription | Additive; Close fans out to all subscribers |

---

## 8) BDCR-salesmen-dashboard pass (2026-07-11): resolves Section 6 open question 8

Read-only line-level audit of a fresh shallow clone of `The-Credit-Brothers/BDCR-salesmen-dashboard` at `clients/the-credit-brothers/BDCR-salesmen-dashboard/`. Nothing modified, nothing run networked. This is the pass Section 6 question 8 asked Josh for; we did it ourselves. Paths below are relative to that repo; the worker is `workers/bdcr-sales-dashboard-api/src/` unless stated. The 2.10 entries above were updated in place from this pass.

**Headline: the repo contains exactly TWO old-pipeline exposure points, both already on the re-point list and both now line-verified: WF-38 stage writes (`src/index.js:1695-1711, 2136-2150`) and WF-40's stage table (`src/lead-health-spec.js:31-44`, read at `src/lead-health.js:209-212`). A repo-wide grep for `stat_`/`pipe_` finds ids in only those two files (plus one org-level lead status at `src/index.js:4390`). Everything else this app renders is built from MONDAY boards + its own report data, not Close stages, so the rest of the dashboard survives the pipeline swap.**

### 8.1 What the app is

- **"TCB Sales Hub"** at sales.thecreditbrothers.com (`README.md:1-7`), the client's own salesmen-facing dashboard, live at **v1.479** (`version.json`). Frontend = ONE static 35,918-line `index.html` on Vercel behind Cloudflare Access (Google auth); backend = Cloudflare Worker `bdcr-sales-dashboard-api` (10,521-line `src/index.js` + 20 modules incl. `closer-recon/` and `ig-fb-dm-setter/`) + a second small worker `bdcr-close-lookup` (name/id -> Close lead resolver, KV-cached, read-only, `workers/close-lookup/src/index.js:1-5`).
- **Users** (`README.md:13-16`): closers chris/isaac/anthony/mike @thecreditbrothers.com; appointment setter (currently Anthony) via the Call Setting tab; admins josh, chris, miro@personalbrands.io. Owner-pinning: bookings are pinned server-side to the logged-in rep via `X-User-Email` -> `EMAIL_TO_GHL_USER` (`README.md:59`).
- **Data flow**: Leads tab + KPIs read the Monday Repair Leads Source board `7620745327` (README:36-50, 2026-01-01 floor); Clients tab reads (and since 2026-05-22 partially writes) the Monday Payment Schedule board `7117839824` (`docs/payment-schedule.md:3`); Sales Funnel tab reads KV keys fed by a **Mac Studio Playwright cron** (`scripts/ghl-funnel-stats-scraper/`) that calls GHL's reverse-engineered internal `backend.leadconnectorhq.com/stats/` endpoint with a saved session and POSTs unique-visitor counts to `/ghl/funnel-stats-ingest` (`README.md` of the scraper, worker route `src/index.js:10221`); Cost-per-Booked-Call reads Meta Graph API ad spend (`src/index.js:8113-8171`). Ops writes go to GHL (appointments/contacts/invoices/documents), Monday (6+ boards), Close (below), Slack, SendBlue.
- **Service bindings INTO the tcb-operations fleet** (`wrangler.toml [[services]]`): `CONTRACT_SIGNED_WEBHOOK` (agreement send fires the `/contract-sent` Close note, `src/index.js:4323`, the WF-26 leg already covered in 2.5) and `NAFA_AUDIT_SYNC` (`/nafa/upload` proxies salesman PDF uploads to nafa-audit-sync `/direct-upload`, `src/index.js:8259`, which skips the stage move by design, see 2.4). So the dashboard deliberately DELEGATES its two Close-note/stage-adjacent flows to the ops fleet instead of duplicating them.
- Every mutating request is captured to a D1 audit log (`src/audit.js`, `AUDIT_DB`); the DM-setter AI tool has its own D1 (`DM_SETTER_DB`); signed sales-team role agreements go to R2 (`AGREEMENTS_BUCKET`).

### 8.2 Close WRITE inventory (complete)

| # | Flow | What it writes | Evidence | Re-point? |
|---|---|---|---|---|
| 1 | **WF-38 `POST /book-call`** | Opportunity CREATE at old Eligibility/Strategy stage + old pipeline id; lead status set | `src/index.js:1695-1696, 1703-1704, 1711, 2136-2150` | **YES: the repo's one stage writer** (2.10, updated) |
| 2 | Manual/Partner lead create (`/leads/manual`, `/partners/submit`) | Lead find-or-create; on CREATE only, optional lead status "Paid Media Lead - New" `stat_ezW3tTpVN5e4ZCvz3qadxapouqsSf26V0hvPw4oKVwl`; on MATCH, refreshes primary contact name/email/phone; NO opportunity | `src/index.js:4389-4391`; `src/close-api.js:68-162` (status on create `:141`, contact refresh PUT `:105-109`) | No (org-level lead status; folds into Open Question 2) |
| 3 | Invoice mirror (`POST /invoice`) | Lead CF "Invoice" `cf_ImIdEUBO...` + a sent-note | `src/index.js:3654, 3662-3695` | No stages. Shared field with payment-schedule-sync; they dedupe (Section 3.6) |
| 4 | Referred-by editor | Lead CF "Referral / Affiliate" `cf_MryL3...` read+write | `src/index.js:4398-4435, 5831` | No |
| 5 | WF-40 lead-health BACKFILL fixes | Lead CFs: GHL Marketing id+url, GHL Repair id+url (the cross-system foreign keys) | `src/lead-health.js:324-327, 341-344`; ids `src/lead-health-spec.js:61-64` | No stages (but its stage READS gate when fixes apply, 8.3) |
| 6 | Full reassignment orchestrator | Each open opportunity's `user_id` (owner), explicitly "No status_id change"; pipeline-agnostic (all opps on the lead) | `src/index.js:6385-6396, 6640-6646`; roster `:1749-1756` | No; survives migration as-is |
| 7 | IG/FB DM Setter "Sync to Close" | Lead find-or-create (no status id passed) + readiness-brief NOTE; dissimilar-name guard before linking | `src/ig-fb-dm-setter/close-sync.js:149-170` | No |
| 8 | Agreement send + NAFA upload | Close notes only, via service bindings into tcb-operations (see 8.1) | `src/index.js:4323, 8259` | Covered by 2.4/2.5 on the ops side |

No other opportunity creation exists (`closeApiRequest` call-site sweep: `:2136` is the only `POST opportunity`). The WF-57 setter form is Monday-only, "No Close/GHL writes" (`README.md:138`), verified.

### 8.3 Close stage READS (silent-break surface)

1. **WF-40 lead health**: the only stage reader in the repo, detailed in the updated 2.10. Old ids: pipeline `src/lead-health-spec.js:31`, stages `:35-43` (Eligibility Call Booked `stat_QFU...`, Strategy Call Booked `stat_IIjg...`, Intake Submitted `stat_RuWzZSa4OqwKCJAr3NxMD1GMcn96ab4m2gE8H5Ngjv5`, Audit Complete `stat_NcFD2VLMwotpNQQdStr8Pfm7wQ5bgZQZ1ScZ3dzd6hG`, Call Completed `stat_GCPnZxCKz3w5rZy4qUw7ApFHV4Rwr6Hb4NCAl4VVNk3`, Closing `stat_Kj61BtAa0iIlSd5iGj4AjaEySHC16Ytnni10XRbOnJr`, Closed Won `stat_5H0LFdifIUVPfma3Cy38yaIMj2AZIZVQN1icedhUr2E`), Lost `:44` (`stat_en0RkVOwC8kL59V32tVNQnT1S6q4EwhtZfAjpniQaZI`). New-pipeline cards make every health check go `not_applicable` silently.
2. **Nothing else.** Leads/Clients/Sales Data/Funnel tabs, closer-recon, and the commission engine read Monday + own reports; `bdcr-close-lookup` reads `display_name`/contacts only (`workers/close-lookup/src/index.js:44-60`); the frontend has zero `stat_`/`pipe_` ids (the only "Audit Complete" strings are training copy, `index.html:28638`).

### 8.4 NMI / Monday / Slack / GHL surfaces

- **NMI: ZERO.** Repo-wide case-insensitive grep for nmi/deposyt matches only `openMissedCallForm`/`durationMin` substrings. Section 3.7's "surface is ours alone" holds across BOTH client repos now.
- **Monday (live read+write)**: Repair Leads Source `7620745327` (dateBooked writeback `src/index.js:2117`, Closer reassign, Appointment Setter `dropdown8__1`, archive-group moves); Sales Call Reports `18407611764` + Missed Call Reports `18407684845`; Setter Reports `18419868361`; Commission Reports `18415101261` (both provisioned by this repo's scripts, `wrangler.toml [vars]`); Payment Schedule `7117839824` read + agreement-URL writeback (`docs/payment-schedule.md:3`); Credit Audits linkage reads. Our one-time-import stance is unaffected.
- **Slack (their channels, no overlap with ours)**: posts to #commission-reports `C0ANVN4BK8D` (`src/index.js:21`), #closer-reports `C0AQX18GWUV` (call + missed-call reports, `:508, :966`; later edits/deletes via chat.update/delete `:1534, :1631`), setter-reports `C0BE0144HRU` (`:27`), closer-recon insights `C0B8MBPJE5C` (`wrangler.toml`) + per-closer DM channels (`closer-recon/format-dm.js`). READS #leads-general-chat `C090S15K6D8` (Jane's morning schedule posts, `closer-recon/jane-chat.js:1-8`) and #4-sales-x-fulfilment `C092MATFWG1` ("New Client:" posts, `closer-recon/sales-fulfillment.js:1-12`); "Hank" Q&A bot answers metric questions in-channel (`closer-recon/slack-events.js`).
- **GHL writes**: Marketing appointments create/reschedule/cancel (`src/index.js:1938` + PUT/DELETE routes), Marketing contacts create (`:1905`), agreement merge-field contact CFs + `proposals/templates/send` (WF-26 send leg, `:4224-4226` + the send flow `:4280-4345`), Repair invoices create+send (`POST /invoice`) and Repair contacts (partner flow). GHL funnel stats are READ via the scraper (8.1).
- **SendBlue**: admin tab reads lines/conversations; the reassignment flow WRITES the SendBlue contact's `assigned_to_email` (partial PUT, `src/sendblue.js:311-330`).
- **Cron schedules** (`wrangler.toml [triggers]`): 4 closer-recon crons (nightly tally 03:00 UTC, morning catchup, next-day reminder, Sunday weekly rollup). None touch Close stages.

### 8.5 Overlap map vs OUR dashboard (factual, no judgment)

| Surface | Their Sales Hub (this repo) | Our tcb-sales-system | Note |
|---|---|---|---|
| Close booking-stage writes | WF-38 `/book-call` (setter bookings) at old Eligibility/Strategy stages | Form-outcome stage writes on the NEW pipeline (allow-listed) | The two writers meet at Open Question 3's WF-38 -> "Setter Booked" mapping |
| Lead roster / KPIs | Monday Repair Leads board, 2026-01-01 floor; booked/show/close/PIF-PP KPI strip + Meta spend | Supabase mirror of Close + GHL webhooks + payments | Two independent KPI pipelines over the same funnel; theirs is Monday-derived, ours Close-derived |
| Show/no-show + report compliance | closer-recon: Google Calendar DWD reads of closer mailboxes + Jane's Slack posts + Monday reports; nightly Slack tally, DMs, weekly rollup, Hank Q&A | Our booked->taken bottleneck metrics in the KPI spec | They already measure held-vs-booked per closer daily, from calendars not Close |
| Commissions | Full engine: draft/submit/mark-paid, Monday Commission Reports board, Slack posts; tier rule = trailing-2-week close rate >= 30% -> 15% else 10% (`src/index.js:9029-9032`) + $20/lead base (Isaac) | Commissions module per the NEW comp plan (CLIENT-DECISIONS.md: new plan supersedes 10%/15%) | Post-migration the two commission surfaces will disagree until theirs adopts the new plan (worker-b's KV `comm_rate` stamp shares this rule, see 2.1) |
| Close lead CF "Invoice" | Writes it on dashboard invoice sends (`:3654-3667`) | We write no Close lead fields | Same as Section 3.6, unchanged |
| Booking/scheduling | Books GHL appointments directly (owner-pinned) | No booking surface | Disjoint |
| NMI | Zero | Daily poll + checkout | Ours alone |
| Future | `PRD-ADMIN-V2.md`: their own Next.js+Supabase admin rewrite sketch, "aspirational, no v2 repo yet" (`README.md:238`) | Live Next.js+Supabase dashboard | Same architecture class; PRD is dated 2026-03-26, pre-dates our engagement |

### 8.6 Net adds to the migration plan

1. The re-point PR in THIS repo is small and code-level: 3 constants in `src/index.js` (2 stage ids + pipeline id, `:1695, :1703, :1711`) + the `lead-health-spec.js` STAGES rewrite + `wrangler deploy`. No KV, no Zap.
2. Sequencing: re-point WF-38 in the same window as WF-03 (2.2) since they are the Self Booked / Setter Booked twins; until then every setter booking lands on the old pipeline with a success toast.
3. WF-40 mis-report is silent (everything `not_applicable`), so after cutover, run one lead-health probe on a new-pipeline lead to confirm the new stage table resolves (the `stage: "unknown"` marker is the tell).
4. The commission tier rule (`:9029-9032`) is not a pipeline item but IS a July-2-decisions item: flag to Josh that the dashboard (and worker-b's mirror of the same rule) still encode 10%/15% while the new comp plan supersedes it.
