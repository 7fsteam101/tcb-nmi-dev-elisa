# TCB Automation Audit: Pre-Migration (Old "BDCR Sales" Pipeline to New "Sales" Pipeline)

Date: 2026-07-10. Auditor: 8FS (Katie's Claude Code). Read-only audit, nothing modified, nothing pushed, no network calls.

## Scope and evidence base (read this first)

The repo at `/Users/katiebani/Documents/7FS/clients/the-credit-brothers/bdcr-operations` is a **shallow clone of the ARCHIVED repo** at its final commit (`be084f7`, "v1.159 ARCHIVED.md: final commit before archive"). Every `workers/`, `services/`, `config/`, `scripts/`, and `mcp-servers/` directory contains only a `MIGRATED.md` tombstone:

> "This repo was fully consolidated into `The-Credit-Brothers/tcb-operations` between 2026-06-12 (v1.150-v1.159) and archived the same day. Nothing here is operational." (`bdcr-operations/ARCHIVED.md:3`)

Consequences for this audit:

1. **Worker source code and `config/kv-mappings.json` / `config/workflows.json` are NOT in this clone.** They live in `tcb-operations` (`workers/operations/<name>`, `config/`), which is not on this machine. The clone is shallow (single commit), so pre-archive git history is also unavailable locally.
2. Everything below is drawn from the repo's own operational documentation frozen at the final commit: `README.md`, `CLAUDE.md`, `CLAUDE_CODE_PROMPT.md`, `docs/BDCR_Sales_Automation_Plan.html` (the retired Vercel dashboard, doc version v1.007), `docs/TESTING_PLAN.md`, and the per-asset tombstones. These docs are detailed (routes, webhook ids, board ids, stage behavior) but they describe the old pipeline in its original 7-stage form; the live old pipeline had grown to 10 stages (Lead Opt-In, Eligibility Call Booked, Strategy Call Booked, and Contract Signed were added later) and the code for those additions is only in `tcb-operations`.
3. **Every finding marked VERIFY must be line-confirmed against `tcb-operations` (and the live KV `config` key) before the migration.** File:line citations below refer to files in this clone unless prefixed `dashboard/` (our repo) or named as one of our client-folder docs.

Key identifiers used throughout:

| Thing | Value | Evidence |
|---|---|---|
| OLD pipeline "BDCR Sales" | `pipe_7QGKHLVYed30khcc1R8PyN` | `docs/BDCR_Sales_Automation_Plan.html:1365`, `CLAUDE_CODE_PROMPT.md:20` |
| NEW pipeline "Sales" (19 stages, live 2026-07-07) | `pipe_5ZtGJ7zT6RjguZ6KPEebkC` | our `CONNECTIONS-TRIGGERS.md:22` |
| Affiliate Partners pipeline (separate, unaffected) | `pipe_7UJeYk7cELKYOZQ61wJ5vx` | `README.md:103` |
| Close webhook to Worker B (`opportunity.updated`) | `whsub_62FTMcyRA9vz73x00AZryT` | `README.md:66`, `docs/BDCR_Sales_Automation_Plan.html:1364`, `CLAUDE_CODE_PROMPT.md:33` |
| Shared Cloudflare KV namespace (`STAGE_MAP`) | `ce3fbd35d0cc4373906ada4f27f07877` | `docs/BDCR_Sales_Automation_Plan.html:1357`, `CLAUDE_CODE_PROMPT.md:44` |
| Close onboarding email template "BDCR - Onboarding Info (Resend)" | `tmpl_hy4HTgxsASTHeXe9EIrnagBraAgSKJYEYMKROYRqLu3` | `CLAUDE_CODE_PROMPT.md:38`, `docs/TESTING_PLAN.md:186` |
| GHL Marketing location | `Lyg7gTtXo2aqlKCVkJgg` | `docs/BDCR_Sales_Automation_Plan.html:1373` |
| GHL Repair Fulfillment location | `3cJtKFFu7gvKSXaSjBWI` | `docs/BDCR_Sales_Automation_Plan.html:1375`, `README.md:205` |
| GHL Repair iMessage workflow (WF-15 target) | `a4077faf` | `README.md:67` |
| Monday: Repair Clients Source board | `7002021408` | `README.md:67`, `CLAUDE_CODE_PROMPT.md:35` |
| Monday: In-House Payment Schedule board / subitems | `7117839824` / `7117839971` | `CLAUDE.md:201-205` |
| Monday: Credit Audit board / its webhook | `7625349540` / `537223197` | `README.md:71,75` |
| GHL Repair contact custom field (Monday payment-schedule pulse id) | `X6aVkafijpdITTfyCAqw` | `README.md:67`, `CLAUDE.md:210` |

---

## 1) Inventory: every automation in the repo

Sixteen worker directories, two Mac Studio services, one MCP server, config, scripts. All deployed names unchanged after migration to `tcb-operations` (per each tombstone). "Old-stage exposure" = references old-pipeline stage labels/ids and appears in Section 2.

### Cloudflare Workers (`workers/`)

| # | Worker (WF) | Purpose | Trigger | Reads | Writes | Old-stage exposure |
|---|---|---|---|---|---|---|
| 1 | `worker-b` (WF-05..10, 14, 15) | Close stage-change listener: lead-status auto-sync + the whole Closed Won chain | Close webhook `opportunity.updated` via `whsub_62FTMcyRA9vz73x00AZryT` to `/stage-change` (`README.md:63,66`) | Close opportunity payload; KV `config` stage-to-status map; KV `closed_won:<lead_id>` idempotency keys (90-day TTL, `README.md:65`); Close lead + Repair GHL contact fields | Close lead status; Slack win alert; onboarding email via Close (template above, sender gotcha at `CLAUDE.md:70-72`); Monday items on boards `7002021408` + `7117839824` (create/promote via `move_item_to_group` keyed off `status_1`, `README.md:67`); GHL Repair contact custom fields; POST to GHL Repair inbound webhook firing workflow `a4077faf` (SendBlue iMessage) | **YES, critical**: Audit Complete, Call Completed, Closing, Closed Won, Lost |
| 2 | `worker-a` (WF-04, WF-04B, repair-contact-linking) | GHL intake-form submission to Close; SendBlue video reminder timing logic | GHL Marketing workflow "3 - Full Service Repair Intake Form Submitted" webhook to `/intake-submitted`; GHL Repair webhook to `/repair-contact-linked` (`README.md:57`, `CLAUDE_CODE_PROMPT.md:26-28`). `/call-booked` route REMOVED in v1.008; lead+opp creation is Zapier's (`CLAUDE_CODE_PROMPT.md:28`) | GHL webhook body (email, phone, IDIQ/MSIQ creds, SSN last 4); Close lead/opportunity lookup; KV timing config + `sendblue_video_reminder` template | "moves opp to Intake Submitted + status to Audit Needed, populates credit monitoring fields" (`README.md:57`); Close task on the <30-min path; GHL webhook `86965abd-fba1-4c2b-9a53-83a5e1066128` for WF-04B (`docs/BDCR_Sales_Automation_Plan.html:1373`); Close custom fields GHL Repair Contact / GHL Repair ID | **YES**: Intake Submitted stage write |
| 3 | `nafa-audit-sync` (WF-30) | Monday NAFA PDF to Close + R2 | Monday webhook `537223197` on NAFA PDF column change, Credit Audit board `7625349540` (`README.md:71,75`) | Monday file column; Close lead | Uploads PDF to Close + R2 bucket `nafa-audit-pdfs`; Close note; NAFA Report URL field; "**moves opportunity to Audit Complete**" (`README.md:72`). Violation-count extraction gated by `VIOLATION_COUNT_ENABLED` (`README.md:174`) | **YES**: Audit Complete stage write |
| 4 | `contract-signed-webhook` (WF-11) | GHL Marketing "Document & Contract Signed" to Close + Slack | GHL Marketing Workflow 4 webhook on client signature; also a `/contract-sent` route hit by the Send Agreement flow (`docs/BDCR_Sales_Automation_Plan.html:691-693`) | GHL contract payload | Close Agreement field; "Contract signed" note; "**moves opp to 'Contract Signed' stage**, posts to Slack #1-signed-agreements" (`docs/BDCR_Sales_Automation_Plan.html:693`); on send: "Contract sent" note only | **YES**: Contract Signed stage write |
| 5 | `ghl-optin-close-sync` | GHL opt-in to Close sync (name-based; built during the repair-leads-reorientation work) | UNCLEAR from this clone; tombstone confirms it exists with "same routes, secrets, bindings, crons" (`workers/ghl-optin-close-sync/MIGRATED.md:5`); in-flight branch `feat/repair-leads-reorientation-phase-b` noted | GHL opt-in events (presumed) | Close leads/opportunities, presumably at the old pipeline's Lead Opt-In stage. VERIFY in `tcb-operations` | **PRESUMED YES**: Lead Opt-In (verify) |
| 6 | `payment-schedule-sync` (WF-29, 33, 34) | GHL Repair invoice events to Monday installment subitems | GHL Repair (location `3cJtKFFu7gvKSXaSjBWI`) InvoiceCreate / Invoice Paid workflow webhooks (`CLAUDE.md:205`, `README.md:177-178`); shared GHL webhook secret pattern (`CLAUDE.md:80-100`, reference impl `workers/payment-schedule-sync/src/verify.ts` per `CLAUDE.md:93`) | GHL invoice payload; GHL contact field `X6aVkafijpdITTfyCAqw`; D1 dedup (`CLAUDE.md:212`) | Monday board `7117839824` parent pulse in `group_mm39tayy` "New Invoices" + subitems (Subitem Type `Client Invoice` on column `color_mm38mded`); writes pulse id back to GHL contact; Slack payment-alerts channel (`CLAUDE.md:212`) | No direct stage refs; **degrades indirectly** if Worker B stops (see 2.1) |
| 7 | `close-call-workflow-exit` (WF-27) | Exits a Close-tracked closer call from GHL WF-02, enrolls WF-28 cooldown | Close call-activity webhook (our `CONNECTIONS-TRIGGERS.md:60` confirms Close has "two of TCB's own worker webhooks subscribed (stage-change, call-activity)"); subscription id not in this clone | Close call activity | GHL Marketing workflow membership (exit WF-02, enter WF-28) | Likely none (call-based). VERIFY no stage filter |
| 8 | `ghl-inbound-sms-workflow-exit` (WF-31) | Twin of WF-27 for inbound SMS replies | GHL inbound SMS workflow webhook (`README.md:28,175`) | GHL SMS event | Same as WF-27 | Likely none |
| 9 | `idiq-login-checker` (worker half, WF-23 front door) | Receives GHL IDIQ-credentials form webhook, forwards to Mac Studio service via Tunnel | GHL form webhook (`README.md:84-86`); also routed at `nafa.thecreditbrothers.com` (`workers/idiq-login-checker/MIGRATED.md:5`) | GHL form fields | Forward to `checker.thecreditbrothers.com` with `INTERNAL_SECRET` | None documented |
| 10 | `idiq-canary` (WF-16) | Daily canary of the IDIQ checker + public front-door probe | Cron daily 13:00 UTC (`README.md:92`) | Checker SQLite (self-discovered target), Close (password resolve) | POST `/run-canary`; Slack alert on failure only (`README.md:93-94`) | None |
| 11 | `nafa-r2-cleanup` | Deletes NAFA PDFs older than 90 days from R2 | Cron, Sundays 00:00 UTC (`README.md:78`) | R2 bucket `nafa-audit-pdfs` | R2 deletes | None |
| 12 | `date-booked-normalizer` | UNCLEAR from this clone (no README entry); name implies normalizing a Date Booked field | Has routes AND a cron per tombstone (`workers/date-booked-normalizer/MIGRATED.md:5`) | Unknown | Unknown (likely Close field writes). VERIFY | UNCLEAR; if it scans opportunities by pipeline, it needs the new pipeline id |
| 13 | `tcb-client-reports-monday-sync` | Parsed credit scores from tcb-client-reports to Monday Repair Clients Source board (`README.md:26`) | Unclear trigger (webhook from tcb-client-reports presumed) | Credit score payloads | Monday board `7002021408` | None documented |
| 14 | `affiliate-partner-sync` (WF-22) | GHL partner booking to Close Affiliate Partners pipeline | GHL Marketing workflow on appointment-booked, calendar `O235WMrP7rsLkvD02iwK` (`README.md:102`) | GHL booking payload | Close lead/opp at Call Booked on `pipe_7UJeYk7cELKYOZQ61wJ5vx`; dedup + "(Affiliate)" sibling-lead rules (`README.md:103`) | No (separate pipeline; only touched if the partner pipeline is also redesigned) |
| 15 | `fireflies-meeting-logger` (WF-35) | Fireflies transcript to Google Sheet (Randi CSM transition) | Fireflies "Transcription completed" webhook (`README.md:110`) | Fireflies transcript; Anthropic extraction | Google Sheet append | None |
| 16 | `monday-true-offboarding-autofill` (WF-21) | RETIRED 2026-06-12 without ever launching; catalog `LIVE` status was wrong, now `DEPRECATED` (`workers/monday-true-offboarding-autofill/MIGRATED.md:3-8`) | n/a | n/a | n/a | None (dead) |

### Mac Studio services (`services/`), MCP, config, scripts

| Asset | Purpose | Trigger | Notes |
|---|---|---|---|
| `services/idiq-login-checker` (WF-17, 24, 25) | Express + Playwright: validates IdentityIQ logins, checks report freshness/3-bureau/payment blockers, verifies affiliate status, "writes results back to Close CRM", SQLite, Slack Block Kit result post (`README.md:85-87`) | Forwarded GHL form webhook via the worker; `/run-canary` | WF-24 (NAFA auto-generation) is "LIVE (dormant)" behind `NAFA_AUTOGEN_ENABLED` (`README.md:168`). Our July 2 notes say the intake-to-audit automation "on success moves the Close opportunity to Audit Complete" (`CONNECTIONS-TRIGGERS.md:208-211`): the stage move must be re-pointed wherever it lives (this service or nafa-audit-sync). VERIFY |
| `services/bdcr-tech-ops-chat` | Claude-backed diagnostic agent for Mission Control's Tech Ops Chat tab; 12 read-only tools + 3 destructive (`retrigger_worker`, `redeploy_worker`, `post_to_slack`) behind UI confirmation (`README.md:123-124`) | HTTP at `bdcr-chat.thecreditbrothers.com`; GitHub push webhook auto-pull | Investigator only, does not modify code. Its memory/system prompt will still describe the OLD pipeline; update after migration so it does not give stale advice |
| `mcp-servers/gmail-attachments` | Gmail-attachments MCP server (used by the HKD ACH / Mission Control side) | MCP client calls | Migrated tombstone only (`mcp-servers/gmail-attachments/MIGRATED.md`); no pipeline exposure |
| `config/workflows.json`, `kv-mappings.json`, `salesmen.json` | Canonical workflow catalog (drives Mission Control Workflow Map) + "Close CRM stage-to-status ID mappings. Real production IDs" (`CLAUDE_CODE_PROMPT.md:10`) | n/a | Contents NOT in this clone. Edit only in `tcb-operations` (`config/MIGRATED.md`). This is the primary re-point artifact |
| `scripts/seed-kv.js` | Seeds KV `ce3fbd35...` from kv-mappings.json (`README.md:206`) | manual | The re-point deploy step: edit mapping, re-seed, no worker redeploy needed for mapping-only changes (`README.md:221`) |

### Referenced but NOT in this repo (need their own audit)

- **`bdcr-call-transcriber` worker** (WF-18/19/20/20B, call recording upload/transcription/verification, `README.md:161-164`). Repo unknown.
- **`bdcr-sales-dashboard-api` worker** (WF-26 Send Agreement `/agreement/send`, WF-32 Clients tab "per-closer signed-client roster", `README.md:170,176`). WF-32 very likely queries won-stage opportunities; if it filters by the old Closed Won status id or old pipeline id, the Clients tab silently stops accruing new-pipeline wins. VERIFY in its repo.
- **GHL-native workflows**: WF-01 reminders, WF-02 SendBlue intro, WF-04B relay, WF-28 cooldown, WF-33/34 invoice triggers, the booking-time Repair-contact workflow, and the Repair Fulfillment onboarding/delivery workflows (which fire off Worker B's WF-15 webhook POST, not off Close directly; our `CONNECTIONS-TRIGGERS.md:68-70`).
- **Zapier**: WF-03 "Create Close Lead + Opp on Call Booked, 3-path source branch (Paid Media / Skool / Organic), LIVE (Zapier + GHL)" (`README.md:145,219`). Legacy Zap "1 - New In-House Client" (id `302729523`) replaced by the v1.120 Monday architecture, "confirmed not firing as of 2026-05-12, pending manual disable in Zapier" (`README.md:223`). Note an id ambiguity: the retired HTML quick-ref links a "Lead Booked Call" Zap whose editor URL embeds the same `302729523` (`docs/BDCR_Sales_Automation_Plan.html:1379`). Our July 2 notes add: about 85 zaps exist, few active, "one moves the Close profile to Intake Form Submitted" (`CONNECTIONS-TRIGGERS.md:212-213`). **No Zapier inventory/catalog document exists in this clone**; the catalog is stated to live in the TCB operations repo (`CLIENT-DECISIONS.md:131`), so the Zapier flows folded into Section 2 are the three above only.
- **tcb-mission-control**: CFO Hub, `cfo-refresh-cron`, HKD ACH pipeline (paused, `HKD_ACH_ENABLED=false`, `CLAUDE.md:206`). No Close-stage exposure documented.

---

## 2) The re-point list (priority-ordered)

Old-pipeline statuses are per-pipeline objects in Close. The new "Sales" pipeline's stages have brand-new status ids even where labels repeat (Audit Complete, Closing, Lost). Two failure shapes:

- **Silent stop**: a worker matching on old status ids/labels simply never matches a new-pipeline event and no-ops.
- **Wrong-pipeline yank / double-fire**: a worker that WRITES an old status id onto an opportunity will, because status ids belong to a pipeline, effectively pull the card back onto the OLD pipeline (or error); and bulk-moving cards can re-trigger won-handlers.

### 2.1 PRIORITY 0: Worker B Closed Won handler (the onboarding trigger)

**Where "Closed Won" lives:** Worker B's `/stage-change` route, fed by Close webhook `whsub_62FTMcyRA9vz73x00AZryT` on `opportunity.updated` (`README.md:63,66`). Stage matching is driven by the KV `config` stage-to-status map ("Stage-to-status ID mapping for shared Cloudflare KV", `README.md:34`; "Real production IDs", `CLAUDE_CODE_PROMPT.md:10`), plus code in `workers/worker-b/src/index.js` (now `tcb-operations/workers/operations/worker-b`). Exact match keys (label vs status id) are in code/KV not present in this clone: VERIFY.

**What Closed Won kicks off, in order** (`README.md:67`): idempotency guard (skip if KV `closed_won:<lead_id>` exists, 90-day TTL) -> lead status to "Closed Client" -> Slack win alert (channel `C069L4NFGSZ`) -> onboarding email WF-10 (Close template `tmpl_hy4HTg...`, always from `support@thecreditbrothers.com`, `README.md:222`) -> Monday client records WF-14 (create Repair Clients Source item on `7002021408`; promote or create Payment Schedule pulse on `7117839824`) -> GHL Repair iMessage WF-15 (POST to GHL Repair inbound webhook, fires workflow `a4077faf` via SendBlue) -> write the KV idempotency marker.

**Required change:** map the NEW won stage ids (Won PIF, Won PP; decide Deposit, see Open Question 1) to the Closed Won handler, and remap the rest of the stage table (see 2.6). Mechanism: update `kv-mappings.json` in `tcb-operations`, re-seed KV (`node scripts/seed-kv.js ce3fbd35d0cc4373906ada4f27f07877`, `README.md:206`), plus any code-level stage constants in worker-b.

**Risk if migrated without the change: SILENT STOP.** A deal closed at Won PIF / Won PP on the new pipeline produces: no onboarding email, no Slack win alert, no Monday client records, no iMessage kickoff, no "Closed Client" lead status. Fulfillment is never notified. Downstream, WF-29 keeps creating Payment Schedule pulses in "New Invoices" but nothing ever promotes them and no Repair Clients Source item is created (`README.md:224-225`), so the Monday client layer quietly rots. This matches the open item we logged July 7 (`CONNECTIONS-TRIGGERS.md:27-30`).

**Risk in the other order: DOUBLE-FIRE.** The idempotency key is per-lead with a 90-day TTL (`README.md:65`). If the team bulk-moves historical WON cards onto the new pipeline AFTER the won-stage re-point, every won client whose marker has expired (won more than ~90 days ago) re-fires the full chain: duplicate onboarding email to a live client, duplicate Monday records, duplicate iMessage sequence. Mitigation: per the July 2 decision the old pipeline "stays intact as historical source" (`CLIENT-DECISIONS.md:80`), so migrate OPEN opportunities only, never won/lost history; and consider adding a `pipeline_id == pipe_5ZtGJ7zT6RjguZ6KPEebkC` guard in Worker B so old-pipeline events can never re-trigger.

### 2.2 PRIORITY 1: Zapier booking Zap (WF-03)

Creates the Close lead + opportunity at booking time on the old pipeline ("Zapier handles lead + opportunity creation", `README.md:219`; WF-03 LIVE, `README.md:145`). If not re-pointed, every new booking lands as an old-pipeline opportunity: the new board stays empty, reps work blind, and none of the new-stage automations ever see the card. Change: the Zap's pipeline/status to the new **Setter Booked / Self Booked** split (booked_by-dependent). Failure shape: silent mis-route (not a stop). Also confirm the dead legacy Zap `302729523` was actually disabled (pending since 2026-05-12, `README.md:223`) so nobody re-points a corpse, and resolve the HTML quick-ref id ambiguity (`docs/BDCR_Sales_Automation_Plan.html:1379`).

### 2.3 PRIORITY 1: Worker A `/intake-submitted` (WF-04)

Writes the old **Intake Submitted** stage + "Audit Needed" lead status (`README.md:57`). On a new-pipeline opportunity this either (a) writes the old status id and yanks the card back onto the old pipeline at Intake Submitted, or (b) if its opportunity lookup filters by the old pipeline id, finds nothing and silently stops. Which of (a)/(b) depends on code not in this clone: VERIFY. Change: new **Intake Form Submitted** status id (new pipeline label per `CLIENT-DECISIONS.md:83`) plus any pipeline filter in the lookup.

### 2.4 PRIORITY 1: nafa-audit-sync (WF-30) and the IDIQ auto-audit path (WF-24)

nafa-audit-sync "moves opportunity to Audit Complete" (`README.md:72`). The new pipeline also has an Audit Complete label but a different status id. Same yank-or-stop failure as 2.3. The dormant WF-24 auto-generation path ends in the same Audit Complete move per our call notes (`CONNECTIONS-TRIGGERS.md:208-211`); re-point it in the same pass and confirm whether `NAFA_AUTOGEN_ENABLED` is on in production.

### 2.5 PRIORITY 1: contract-signed-webhook (WF-11)

On signature: updates the Agreement field, drops the signed note, "**moves opp to 'Contract Signed' stage**, posts to Slack #1-signed-agreements" (`docs/BDCR_Sales_Automation_Plan.html:693`). Old pipeline has Contract Signed; the new pipeline has **Contract Sent AND Contract Signed**. Re-point to the new Contract Signed status id; decide whether the existing `/contract-sent` route (today: note only, `docs/BDCR_Sales_Automation_Plan.html:691-692`) should now also move the card to Contract Sent.

### 2.6 PRIORITY 1: Worker B stage-to-lead-status table (WF-05..09)

The KV map currently covers Audit Complete -> Ready For Call, Call Completed -> Call Completed, Closing -> Closing, Closed Won -> Closed Client, Lost -> Lost (`README.md:148-153`, `docs/BDCR_Sales_Automation_Plan.html:462-469`). The new pipeline has 19 stages including No Show, Call Confirmed, Call Canceled (by Lead/by Team), DQ On Call, Follow Up Call Booked, Warm List, Deposit (`CLIENT-DECISIONS.md:83`). Without a full remap the lead-status sync silently stops for every new-pipeline stage, and any Close smart views / reports keyed on lead status go stale. This needs a decided mapping (Open Question 2), not just id substitution.

### 2.7 PRIORITY 2: ghl-optin-close-sync

Presumed to create Close leads/opps at the old pipeline's **Lead Opt-In** stage (worker name + the repair-leads-reorientation branch note, `workers/ghl-optin-close-sync/MIGRATED.md:5-7`). If so, same mis-route failure as the booking Zap, plus it has crons whose scope is unknown. Nothing more is verifiable from this clone: confirm routes, crons, and the hardcoded pipeline/status ids in `tcb-operations/workers/operations/ghl-optin-close-sync`.

### 2.8 PRIORITY 2: out-of-repo won-stage consumers

- `bdcr-sales-dashboard-api` WF-32 Clients tab (signed-client roster, `README.md:176`): likely queries won opportunities; re-point its stage/pipeline filter or new wins vanish from the roster.
- `date-booked-normalizer`: unknown internals; if it iterates opportunities by pipeline id it needs the new id added.
- Mission Control surfaces reading `config/workflows.json`: update catalog entries (triggers, stage names) in the same PR; the repo rule requires it (`CLAUDE.md:42`).

### 2.9 No change needed (verified against docs)

`affiliate-partner-sync` (separate pipeline `pipe_7UJeYk7cELKYOZQ61wJ5vx`), `payment-schedule-sync` (invoice-triggered; but see 2.1 dependency), `close-call-workflow-exit` + `ghl-inbound-sms-workflow-exit` (call/SMS-triggered), `idiq-login-checker` worker + canary, `nafa-r2-cleanup`, `fireflies-meeting-logger`, `tcb-client-reports-monday-sync`, `gmail-attachments` MCP, HKD ACH (paused). Caveat: "no change" is per the frozen docs; the deployed code in `tcb-operations` should be grepped for `pipe_7QGKHLVYed30khcc1R8PyN` and old status ids as the final gate.

---

## 3) Collision check: their fleet vs our dashboard

Our system (the Supabase + Next.js dashboard in `dashboard/`): inbound Close webhook subscribed to `lead.created`, `lead.updated`, `opportunity.created`, `opportunity.updated` (`dashboard/app/api/webhooks/close/route.ts:9-11`); the DB is a faithful mirror by `close_id` with no direction rules (`dashboard/lib/sync/normalize.ts:5-8`); outbound writes go through a 3-operation allow-list: `close_update_opportunity_stage`, `close_create_note`, `ghl_create_contact_note` (`dashboard/lib/sync/writeback.ts:6-10`), with the single stage-write call site being form outcomes (`dashboard/lib/forms.ts:294`).

1. **Coexistence of webhooks is safe.** Close fans out to many subscribers; their two subscriptions (stage-change `whsub_62FT...`, plus a call-activity one per `CONNECTIONS-TRIGGERS.md:59-61`) and ours are independent. Nothing about receiving conflicts.
2. **Our stage write-back IS a trigger source for Worker B.** When a closer submits a Sales Call Report and the dashboard pushes a stage change to Close, Close emits `opportunity.updated` and Worker B runs exactly as if a rep dragged the card. After the re-point, a dashboard-driven move to Won PIF/Won PP will fire the full onboarding chain. That is desired parity, but Josh's team should know the dashboard is now one of the hands that can pull that trigger. Worker B's per-lead KV marker then suppresses a duplicate if someone also drags the card in Close within 90 days.
3. **No loops.** Their Worker B reacts to stage changes by writing LEAD STATUS (not stage), so there is no stage-to-stage ping-pong; its lead update comes back to us as `lead.updated`, which we consume as an idempotent contact upsert. Our inbound mirror never writes back out (write-backs originate only from human dashboard/form actions), so their stage moves (Worker A, NAFA, contract-signed) mirror into Supabase and stop there.
4. **Nobody reacts to notes.** We write Close lead notes and GHL contact notes; their catalogued triggers are opportunity.updated, call activity, GHL form/invoice/appointment/signature/SMS events. No automation of theirs triggers on note creation, and we do not subscribe to Close activity/note events, so their "Contract sent/signed" and NAFA notes do not bounce anywhere. Re-check this if they ever add a GHL workflow triggered on "note added".
5. **One hazard on OUR side to retire: the won-stage fallback.** Our outbound stage resolver has `OUTBOUND_FALLBACKS` mapping `won_pif`/`won_pp`/`deposit` to `closed_won` if the new label is ever missing from the org status list (`dashboard/lib/sync/writeback.ts:55-60`). Today it is dormant (the new stages exist), but if it ever engaged it would write the OLD Closed Won status id, which both yanks the card to the old pipeline and detonates Worker B's onboarding chain from a dashboard action. Recommendation: remove the `closed_won` fallbacks once the migration completes.
6. **Bulk-migration burst hits both systems.** Every moved card produces `opportunity.updated` to us (harmless: idempotent mirror; unknown labels auto-register unmapped in Admin > Stages, `dashboard/lib/sync/normalize.ts:37-40` and `CLIENT-DECISIONS.md:136`) and to Worker B (the 2.1 double-fire analysis applies). Sequence the migration: re-point first, move OPEN cards only, watch Worker B logs during the move.
7. **No shared write targets elsewhere.** Payments: they write GHL-invoice data to Monday; we ingest NMI/Stripe into Supabase. Monday: theirs is live write; ours is a one-time history import. GHL: our Marketplace-app events are separate from their workflow webhooks; our only GHL write is contact notes.

---

## 4) Slack surface (their notification map today)

| Channel | Producer | Content | Evidence |
|---|---|---|---|
| Win alerts channel `C069L4NFGSZ` (Slack app "BDCR Win Alerts", `A0ANCS1TT54`) | Worker B (WF-08) | Closed Won win alert: client name, deal value, salesman | `docs/BDCR_Sales_Automation_Plan.html:1053,1381-1382`; `docs/TESTING_PLAN.md:21,166` |
| `#1-signed-agreements` | contract-signed-webhook (WF-11) | Contract-signed announcement | `docs/BDCR_Sales_Automation_Plan.html:693` |
| `#4-sales-x-fulfilment-team-chat` (channel name carries a keycap "4" emoji digit) | Worker B via `SLACK_FULFILLMENT_WEBHOOK_URL` | "Fulfillment action needed" alerts (rendered with a warning emoji): missing GHL Repair contact link, manual-linking instructions, Monday errors | `README.md:64,67` |
| `#0-payment-alerts` (keycap "0" emoji digit) | payment-schedule-sync (WF-29) ONLY; policy: no other pipeline may post here | Repair-invoice payment alerts | `CLAUDE.md:212` |
| IDIQ results channel (id via `SLACK_CHANNEL_ID` env; name not in this clone) | idiq-login-checker service; idiq-canary on failure | Block Kit login-check results; canary failure alerts | `README.md:87,93-94` |
| Ad-hoc | bdcr-tech-ops-chat `post_to_slack` tool (confirmation-gated) | Agent-composed messages | `README.md:124` |
| Commission channel (client process, no automation in this repo) | Manual | Commission postings ("no commission board, that goes to a Slack channel") | `CLIENT-DECISIONS.md:130` |

Migration note: the win alert and fulfillment alerts are Closed Won side effects, so they inherit the 2.1 silent-stop until Worker B is re-pointed.

---

## 5) Open questions for Josh

1. **Which new stages fire onboarding?** Won PIF and Won PP both, presumably. Is **Deposit** excluded? (Deposit sits before Won PIF in the new pipeline; if Worker B were keyed on Close's "won" status TYPE rather than explicit ids, a deposit-only client could get onboarded prematurely. Explicit ids are safer; please confirm the intended set and each stage's exact `stat_` id.)
2. **Stage-to-lead-status map for all 19 new stages** (for the KV `config` remap): what lead status, if any, should No Show, Call Confirmed, Call Canceled by Lead/Team, DQ On Call, Follow Up Call Booked, Warm List, Deposit, Contract Sent/Signed set? Or do we retire lead-status sync in favor of the pipeline itself?
3. **ghl-optin-close-sync**: confirm what it creates (Lead Opt-In opps on which pipeline), its routes and crons, and where its pipeline/status ids are configured.
4. **date-booked-normalizer**: what exactly does it read/write, and is it pipeline-scoped?
5. **Zapier**: which Zap is the live WF-03 booking Zap (the docs leave an id ambiguity around `302729523`); was the legacy "1 - New In-House Client" Zap ever manually disabled; and beyond the "moves the Close profile to Intake Form Submitted" zap, do any of the ~85 zaps still write Close stages or statuses? Please share the Zapier catalog from tcb-operations so we can fold it into this list properly.
6. **Migration mechanics**: confirm the plan is open-opportunities-only (won/lost history stays on the old "BDCR Sales" pipeline per July 2), re-point BEFORE any cards move, and whether you want a `pipeline_id` guard added to Worker B so old-pipeline events can never re-trigger the won chain.
7. **Contract Sent**: should the Send Agreement flow's `/contract-sent` event start moving the card to the new Contract Sent stage (today it only drops a note)?
8. **Out-of-repo workers**: where do `bdcr-sales-dashboard-api` (WF-26/32) and `bdcr-call-transcriber` (WF-18..20B) live? WF-32's Clients tab likely filters by won stage and needs the same re-point.
9. **Access for the line-level pass**: this clone is the archived repo; grant/point us at `tcb-operations` (workers/operations/*, config/kv-mappings.json, config/workflows.json) plus a read of the live KV `config` key so every finding above can be confirmed at file:line before the switch. A repo-wide grep for `pipe_7QGKHLVYed30khcc1R8PyN` and the old `stat_` ids is the closing gate.
10. **Tech Ops Chat memory**: after re-pointing, update the agent's memory/system prompt so it stops describing the old pipeline as current.

---

## 6) How our dashboard coexists (summary of shared touchpoints)

| Object | Their writers | Our behavior | Verdict |
|---|---|---|---|
| Close opportunity STAGE | Worker A (Intake Submitted), nafa-audit-sync (Audit Complete), contract-signed-webhook (Contract Signed), Zapier (creation at booking), reps manually | Inbound: mirror 1:1 by `close_id`, no reaction-writes. Outbound: stage writes only from form outcomes (`dashboard/lib/forms.ts:294`), allow-listed, echo-safe (a write-back returns as `opportunity.updated` and re-mirrors the same value; converges, no loop) | Safe. Our stage writes trigger Worker B like any human move: intended parity (see 3.2). Retire our `closed_won` fallbacks post-migration (see 3.5) |
| Close LEAD (status, fields, notes) | Worker B (lead status "Closed Client" etc.), IDIQ checker (result fields), NAFA + contract workers (notes, Agreement/NAFA URL fields) | Inbound `lead.*` upserts contacts (merge, never overwrite). Outbound: notes only | Safe; no field contention (we write no Close lead fields) |
| GHL contacts (both locations) | Their workflows + workers write custom fields (e.g. `X6aVkafijpdITTfyCAqw`) and fire sequences | Marketplace-app reads + nightly poll; outbound contact notes only | Safe; separate subscriptions, no shared fields |
| Monday boards | Worker B + payment-schedule-sync + tcb-client-reports-monday-sync write live | One-time history import (reports, deals, NAFA), read-only | Safe |
| Slack | Their channels per Section 4 | We post nothing to their Slack | Safe |
| Close webhooks | `whsub_62FT...` (Worker B) + a call-activity subscription | Our own subscription (lead + opportunity events) | Additive; Close supports multiple subscribers (`CONNECTIONS-TRIGGERS.md:59-61`) |

The single genuinely shared lever is the opportunity stage: both sides write it, and Worker B reacts to every change regardless of author. Everything in Section 2 exists to make that lever safe before cards start moving.
