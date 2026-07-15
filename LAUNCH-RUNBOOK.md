# TCB Launch Runbook: pipeline cutover + go-live

Written July 13, 2026. UPDATED July 14: Katie executes everything herself (no
Josh dependency). The entire Phase 1 re-point is ALREADY BUILT and waiting as
two pull requests: tcb-operations#132 and BDCR-salesmen-dashboard#578 (all
tests green, catalog validated). Deploying them is one script:
deploy-cutover.sh in this folder, which needs a Cloudflare API token.

Every Close status id below was pulled live from their org, so nobody hunts
ids. Sources: AUTOMATION-AUDIT.md (line-verified across bdcr-operations,
tcb-operations, BDCR-salesmen-dashboard), the automation map site, and the
launch plan. Owners: KATIE (everything), TEAM (reps), ELISA (NMI checkout,
parallel track, not blocking).

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

## Phase 0: pre-flight (KATIE, ~30 min total)

- [x] Deposit policy: RESOLVED per the July 2 call and built accordingly.
      Onboarding fires on Won PIF + Won PP explicit status ids, never on
      Close's "won" type, never on Deposit.
- [ ] KATIE mints the Cloudflare API token on The Credit Brothers account:
      https://dash.cloudflare.com/profile/api-tokens -> Create Token ->
      "Edit Cloudflare Workers" template + add "Workers KV Storage: Edit".
      This is the ONLY missing credential; everything else is already in hand.
- [ ] KATIE opens Zapier and confirms the Zap catalog (names + on/off states)
      matches AUTOMATION-AUDIT.md; locate the WF-03 booking Zap (302729523)
      ready to switch off in Phase 1.
- [ ] KATIE turns on the NMI Silent Post: NMI portal, Settings, Silent Post URL:
      https://tcb-sales-system.vercel.app/api/webhooks/nmi?secret=03a493de668fa3fc0acb712885ae394b
- [ ] KATIE configures Slack notifications (Admin > Notifications): channel +
      test-send per rule; at minimum Deal won, Payment succeeded, No-show,
      Daily digest. /invite @tcb_sales_system in each private target channel.
- [ ] KATIE sanity check: dashboard Connections page shows every source green,
      no needs-attention items pending decisions.

## Phase 1: re-point the automations (KATIE, ~30 min; the code is ALREADY BUILT)

The whole re-point exists as two reviewed-and-tested pull requests, built by
8FS on July 14 with all ids embedded:

  tcb-operations#132  https://github.com/The-Credit-Brothers/tcb-operations/pull/132
    kv-mappings.json stage map v2 (13 stages), worker-b won-set {Won PIF, Won
    PP} (Deposit excluded), worker-a intake id, nafa-audit-sync ids + guard,
    contract-signed-webhook id, ghl-optin pipeline/opt-in/Setter Booked +
    rebuilt forward-only ladder (parked states No Show / cancels / Warm List
    sit before Setter Booked so a re-book lifts them back into the flow),
    affiliate + quiz vars, catalog (WF-11/38/41) + docs. Tests: worker-a 7/7,
    worker-b 9/9, quiz 7/7, ghl-optin 28/28, affiliate 33/33; catalog check OK.

  BDCR-salesmen-dashboard#578  https://github.com/The-Credit-Brothers/BDCR-salesmen-dashboard/pull/578
    Booking writes -> Setter Booked / Self Booked, pipeline id, WF-40
    lead-health stage table rebuilt (keys stable, Contract Sent / Contract
    Signed / Deposit added, Won PP + DQ aliased). Tests: 763/763.

Steps:
- [ ] 1.1 Merge both PRs (review the diffs on GitHub; squash-merge per repo
      convention; bump versions at merge if you follow their vX.XXX rule).
- [ ] 1.2 Zapier WF-03 booking Zap (302729523): TURN OFF. Our dashboard push
      replaces it (Phase 2). Do not re-point it; retiring removes the
      dual-writer.
- [ ] 1.3 Run the deploy: `CLOUDFLARE_API_TOKEN=... bash deploy-cutover.sh`
      (in 7FS/clients/the-credit-brothers/). It pushes the KV stage map and
      deploys all 8 workers across both repos in one pass. Worker A and the
      KV config MUST ship together; the script does this.
- [ ] 1.4 Synthetic-lead test: create a test lead in Close, walk it Lead Opt
      In -> Self Booked -> Won PP on the NEW pipeline; confirm the onboarding
      chain fires exactly once (Slack win alert C069L4NFGSZ, onboarding email,
      Monday client records) and NOTHING fires from the old pipeline.

Known accepted divergence: the Sales Hub commission engine still pays the old
10/15 rule (deliberately untouched). The dashboard carries the July 2 comp
plan and is canonical for commissions; update or retire the Hub engine later.

## Phase 2: flip our push (KATIE, 10 min, only after the Zap is off in 1.2)

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
| Cards moving twice / fighting | The booking Zap came back on; turn it off (step 1.2) |
| A new stage label appears | Admin > Stages: map it in the UI, no code |
| Numbers look wrong | Reconciliation script rerun; the audit + recon docs carry every known delta explanation |
