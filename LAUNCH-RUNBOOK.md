# TCB Launch Runbook: pipeline cutover + go-live

Written July 13, 2026. The step-by-step to launch, in execution order. Every
Close status id below was pulled live from their org today, so nobody hunts ids
tomorrow. Sources: AUTOMATION-AUDIT.md (line-verified across bdcr-operations,
tcb-operations, BDCR-salesmen-dashboard), the automation map site, and the
launch plan. Owners: JOSH (client tech), KATIE (8FS), TEAM (reps), ELISA (NMI
checkout, parallel track, not blocking).

## The one rule that orders everything

Re-point the automations FIRST, migrate open cards SECOND, flip our push THIRD.
Any other order either kills onboarding silently or double-fires it.

## Reference: the new "Sales" pipeline (pipe_5ZtGJ7zT6RjguZ6KPEebkC)

| Stage | status_id |
|---|---|
| Lead Opt In | stat_q8Pyvq8KKMtx720mgtiiVNSa5JpovtGlMsqTBGrhiK9 |
| Setter Booked | stat_gDcBm9UkAaY2YU3IOOa2Z5b6X3O2uyBfBUVWYAer62L |
| Self Booked | stat_HHOa6IkTJpf7LJN1zajfrJ6CuoGtXATSmCHMadIBM9I |
| Intake Form Submitted | stat_7kuJqvE18kMjXVx5r8W2t8uIp7m9RJbJ1PZceRBFvAx |
| Audit Complete | stat_fFzaT56wJOQzZrdLGn1zcJwb9Td7eytOSRGEXo8v0AR |
| Intake Form Needed | stat_RbBZHCa7ELQhIemHPjMCytEhnE4CEtNHjshDL7O0slP |
| Call Confirmed | stat_vxqUOMpwJOfLLsnmzTqPj1skXVfBidarWoI6fgP4HJM |
| No Show | stat_RLtswpkT3rooziMmbbn0dHYmn1wfWPeInp9i6ocZ4fM |
| Call Canceled (by Lead) | stat_PcRyq3lu3elnGGzpwdhEmFHDIw1E4p35eGBHaposoyg |
| Call Canceled (by Team) | stat_yYyANSoTbLB67GQgzWtNRrSBLy22sW03dnHG1klZ6HD |
| Follow Up Call Booked | stat_HakGIeriYxLGGWdq2j0PBguT6twU11ZSvKaYfAY2auT |
| Warm List | stat_TgmFhwnsKpfPfuP0p05H7l34lkl8MK8uXnb7O777UOW |
| Contract Sent | stat_ZaLwFAWAp3lEQJNJYZpa91EqtFOBJrsMTgXPczsAy3K |
| Contract Signed | stat_c3DTXr85wR727tZTvQ1UYRDd2wFofqEVmYvfm6l9it9 |
| Deposit [won] | stat_r50Y8oCQTMHIamJydiyz42NLlk08T6GTsu7uGCeTu9z |
| Won PIF [won] | stat_6SqcupJuYW3Ic7yUStBHFIAyB51SGBlYMOwavNtgHdE |
| Won PP [won] | stat_be0ywEn3HHhdGCUvyODZZBKFFJz27DE5jBpBTausJ2s |
| Lost | stat_VwofutbkB7An8UANb7Qf1oEw070H6uYdTuJ1aZspjc7 |
| DQ On Call | stat_M2KvJaDzpjI4hUS2wv1AiQv8fLpgdMYvlMoUb36lxcM |

Old pipeline (BDCR Sales, pipe_7QGKHLVYed30khcc1R8PyN) stays untouched as the
historical archive. Old Closed Won (the current onboarding trigger):
stat_5H0LFdifIUVPfma3Cy38yaIMj2AZIZVQN1icedhUr2E.

## Phase 0: pre-flight (tonight, ~30 min total)

- [ ] JOSH decides the Deposit policy: onboarding fires on Won PIF + Won PP
      EXPLICIT status ids, never on Close's "won" TYPE. (Deposit is also typed
      won; keying on type would onboard deposit-only clients prematurely.)
- [ ] JOSH screenshots the Zapier dashboard (Zap names + on/off) so the audit's
      Zapier picture is verified complete, not just catalog-documented.
- [ ] KATIE turns on the NMI Silent Post: NMI portal, Settings, Silent Post URL:
      https://tcb-sales-system.vercel.app/api/webhooks/nmi?secret=03a493de668fa3fc0acb712885ae394b
- [ ] KATIE configures Slack notifications (Admin > Notifications): channel +
      test-send per rule; at minimum Deal won, Payment succeeded, No-show,
      Daily digest. /invite @tcb_sales_system in each private target channel.
- [ ] KATIE sanity check: dashboard Connections page shows every source green,
      no needs-attention items pending decisions.

## Phase 1: re-point the automations (JOSH, ~2-4 hours, from AUTOMATION-AUDIT.md)

All in tcb-operations unless noted. Ship as ONE PR so the CI-enforced catalog
(config/workflows.json) updates with the code.

- [ ] 1.1 Worker B /stage-change (THE onboarding chain). CODE change: the
      Closed Won match is a hardcoded single-id comparison (worker-b/src/index.js
      around :252 and :1411); it must become a SET containing Won PIF
      (stat_6Sqc...) and Won PP (stat_be0y...), per the Phase 0 policy NOT
      Deposit and NOT type=won. Update the KV config stage map (namespace
      ce3fbd35d0cc4373906ada4f27f07877) for the new pipeline ids. The chain it
      protects: lead status write, Slack win alert (C069L4NFGSZ), onboarding
      email (Close template), Monday client records (boards 7002021408 +
      7117839824), GHL Repair iMessage workflow, commission-rate stamp,
      agreement PDF attach, Repair Leads board stamping.
- [ ] 1.2 Worker A /intake-submitted: writes old Intake Submitted; re-point to
      Intake Form Submitted (stat_7kuJ...). Note its failure mode is a hard 500
      keyed off the old stage id (src/index.js:244-245).
- [ ] 1.3 nafa-audit-sync: writes old Audit Complete; re-point to new Audit
      Complete (stat_fFza...).
- [ ] 1.4 contract-signed-webhook: writes old Contract Signed; re-point to new
      Contract Signed (stat_c3DT...) (Slack #1-signed-agreements unchanged).
- [ ] 1.5 ghl-optin-close-sync: wrangler.toml:37-87 vars carry the old pipeline
      and its 8-stage forward-only ladder; replace with the new pipeline id +
      new stage ids (config edit + redeploy, no code).
- [ ] 1.6 affiliate-partner-sync: wrangler.toml:35 BDCR_PIPELINE_ID points at
      the old pipeline for its active-sales split; update to
      pipe_5ZtGJ7zT6RjguZ6KPEebkC.
- [ ] 1.7 quiz-email-draft (WF-54): creates opt-in opps on the old pipeline;
      re-point creation to Lead Opt In (stat_q8Py...).
- [ ] 1.8 Zapier WF-03 booking Zap (302729523): TURN OFF. Our dashboard push
      replaces it (Phase 2). Do not re-point it; retiring removes the dual-writer.
- [ ] 1.9 BDCR-salesmen-dashboard (separate repo): 3 constants in
      workers/bdcr-sales-dashboard-api/src/index.js (CLOSE_PIPELINE_ID :1711,
      eligibility stage :1695, strategy stage :1703 -> Setter Booked / Self
      Booked as appropriate) + the WF-40 lead-health stage table
      (src/lead-health-spec.js:31-44) + redeploy. Note: its booking write is
      non-blocking, so un-re-pointed it mis-routes SILENTLY.
- [ ] 1.10 Sales Hub commission engine (same repo, src/index.js:9029-9032) still
      pays the OLD 10/15 percent rule; either update to the July 2 plan or
      accept a known temporary divergence from the dashboard statements and tell
      the reps which number is canonical (the dashboard).
- [ ] 1.11 Deploy everything, then verify with ONE synthetic lead: create a test
      lead in Close, walk it Lead Opt In -> Self Booked -> Won PP on the NEW
      pipeline; confirm the onboarding chain fires exactly once (Slack win
      alert, email, Monday records) and NOTHING fires from the old pipeline.

## Phase 2: flip our push (KATIE, 10 min, only after 1.8)

- [ ] 2.1 Admin > Options > Sync policy: toggle ON "Push GHL events to Close".
- [ ] 2.2 Live test: book a slot on "BDCR Strategy Call (Free Bookings)" in GHL.
      Verify within a minute: dashboard shows the booking; the Close card moved
      to (or was created at) Self Booked on the NEW pipeline; the Slack booked
      notification posted.
- [ ] 2.3 Watch the writeback queue for failures (Connections page) for the
      first hour. Rollback = flip the toggle OFF (and re-enable the Zap if
      bookings must keep flowing while debugging).

## Phase 3: migrate the open cards (JOSH + TEAM, ~1 hour)

- [ ] 3.1 Move OPEN (non-won, non-lost) opportunities from the old pipeline to
      the new one, mapping: Lead Opt-In -> Lead Opt In; Eligibility Call Booked
      -> Setter Booked; Strategy Call Booked -> Self Booked (or Setter Booked
      where a setter actually booked it); Intake Submitted -> Intake Form
      Submitted; Audit Complete -> Audit Complete; Call Completed / Closing ->
      Contract Sent or Follow Up Call Booked per reality; Contract Signed ->
      Contract Signed.
- [ ] 3.2 DO NOT move historical Closed Won or Lost cards. Won cards older than
      about 90 days have expired idempotency markers and WILL re-fire the full
      onboarding chain if they land on Won PIF/Won PP.
- [ ] 3.3 Verify on the dashboard: Admin > Stages shows zero unmapped labels;
      opportunity counts per stage match Close (the reconciliation already
      proved the mirror exact, so any delta is a migration miss).
- [ ] 3.4 The 22 previously drifted opportunities (ours said Self Booked, Close
      said Lead Opt-In) settle themselves as cards move; spot-check two.

## Phase 4: team go-live (KATIE, ~45 min)

- [ ] 4.1 Security rotation: rotate the Supabase DB password; revoke the two
      GitHub audit tokens (github_pat + ghp_ on 7fsteam101); confirm the Slack
      and Meta tokens live only in Vault.
- [ ] 4.2 Turn authentication ON (remove AUTH_DISABLED from Vercel env, then
      redeploy) and create the user accounts: Josh + Chris (admin), closers
      (Anthony, Isaac, Mike, Sakib, Denis), setter, with per-user Notes access
      as desired.
- [ ] 4.3 Supabase Pro upgrade (backups before the team depends on it).
- [ ] 4.4 Brief the reps (15 min): dashboards are read-truth; the three forms
      (Sales Call Report, Missed Call Report, Post-Call Notes) are the daily
      ritual and they drive attendance, deals, and commissions; the 876-unmarked
      calls banner is the backlog to burn down.
- [ ] 4.5 Flip the remaining Slack rules ON (booked, lead, refund) once the
      team channels are chosen.

## Phase 5: first-48-hours watch (KATIE + JOSH)

- [ ] Sync-health banner stays clear (any source silent > 36h shows itself).
- [ ] Writeback queue: zero stuck ops.
- [ ] Worker B logs after the first real new-pipeline win; commission statement
      appears for that closer on the dashboard.
- [ ] Daily digest posts on schedule with sane numbers.
- [ ] ELISA (parallel): NMI checkout production cutover per NMI-DEV-HANDOFF.md
      (tokenization key, live key, webhook signing, Apple Pay, DNS).

## Rollback map

| Symptom | Rollback |
|---|---|
| Onboarding fires twice / from old pipeline | Re-check 1.1 set logic; the 90-day markers absorb repeats for recent wins |
| Onboarding does not fire on a new win | Worker B logs; confirm KV map + the two won ids; the win alert channel is the canary |
| Close cards not moving on bookings | Admin > Options toggle state; writeback queue errors; contact missing close_id shows as a normalize note |
| Cards moving twice / fighting | The booking Zap came back on; turn it off (1.8) |
| A new stage label appears | Admin > Stages: map it in the UI, no code |
| Numbers look wrong | Reconciliation script rerun; the audit + recon docs carry every known delta explanation |
