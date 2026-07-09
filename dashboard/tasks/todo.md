# Task: Enrich contact profile + call/appointment detail pages (Katie, July 9)

## Plan
- [ ] contacts/[id]/detail.tsx: flatten ContactTabs layout into anchored sections (tabs use display:none, so hash deep-links cannot land on hidden panels; tabs.tsx is not owned by this task and stays untouched on disk). Server-rendered jump nav replaces the tab bar; ALL existing content preserved.
- [ ] Section anchors: #overview #opt-ins #calls #appointments #payments #credit #reports #contracts #notes #activity, each with scrollMarginTop 80. Opt-ins strip chip links to #opt-ins.
- [ ] Opt-ins section: full detail (form name via sync.form_map left join, source, campaign, utm, dub_link_id, goal, credit_score_range, blocker, Counts/Not counted + Unique/Repeat badges). Expand existing batched query, no new query.
- [ ] Credit section: NAFA audits (credit.nafa) + intake submissions (credit.intake_submission, NON-credential columns only). Two NEW queries as sequential awaits after the existing full batches of 4.
- [ ] Reports section: expand existing report_submission query with rep name + on_time + strategy_call_id; render table with Late badge and View call link.
- [ ] calls/[id]/body.tsx: main query gains calendar_map join (calendar_name), booked_by, is_paid_booking; grid rows Calendar / Booked by / Paid booking; Reports filed section (batch grows 2 -> 3, <= 4).
- [ ] appointments/[id]/body.tsx: same grid additions on the folded-in call details; objections await becomes a batch of 2 (objections + reports filed), both gated on call_id.
- [ ] npx tsc --noEmit until clean.

## Verified schema (from migrations, NOT guessed)
- sales.opt_in: submitted_at, goal (optin_goal), credit_score_range, blocker, source_channel, source_campaign, utm, dub_link_id, form_id (0045), counted bool not null (0045), counts_as_unique bool not null, contact_id. NO page-URL column.
- sync.form_map (0045): form_id, form_name, counts_as_lead. Join on fm.form_id = o.form_id per task spec.
- credit.nafa (0001, schema move 0008): pulled_at, provider (intake_provider), violation_opportunities int, accounts_with_violations int, credit_score int, utilization_pct numeric (stored 0-100, "Credit utilization percentage" - do NOT run through pct() which multiplies by 100), qualifies bool null, is_canonical bool, report_url, report_pdf_url, contact_id.
- credit.intake_submission: submitted_at, provider, status (intake_status: submitted|verified|failed), contact_id. FORBIDDEN: idiq_username, idiq_password, msiq_username, msiq_password, last_4_ssn (encrypted PII, backend-only; never selected).
- sales.report_submission: type (sales_call|missed_call|post_call_notes), rep_id -> sales.rep.full_name, strategy_call_id uuid null, submitted_at, status (submitted|validated|superseded|rejected), on_time bool null.
- sales.call: calendar_map_id (0017) -> sync.calendar_map.id/calendar_name, booked_by text null (0033: self_book|setter), is_paid_booking bool NULL-able (0042).
- DB role: direct pooler connection (postgres owner), so credit.* reads work despite no authenticated grant; the security rule is enforced by column selection.

## Review
- [x] detail.tsx: ContactTabs usage replaced with 10 anchored sections + a server-rendered jump nav (same visual language as the old tab bar, count badges preserved). ALL previous tab content kept: overview mini-stats + contact details, opportunities with nested calls, appointments table, deals with plans/receivables/payments, contracts, notes composer + list, merged activity feed. tabs.tsx untouched on disk (now unreferenced).
- [x] Anchors land on first paint: sections always render (None empty states), ids on <section> wrappers, scrollMarginTop 80. Required ids all present: #opt-ins #calls #payments #credit #reports (+ #overview #appointments #contracts #notes #activity). Opt-ins strip chip = <a href="#opt-ins">.
- [x] Opt-ins section: form_name via left join sync.form_map on fm.form_id = o.form_id (fallback muted mono form_id), Counts/Not counted (form gate) + Unique/Repeat (30-day dedupe) badges, dateTime, Source/Campaign/Goal/Credit score/Blocker/UTM rows, Dub link row only when present. Existing batched query expanded in place; batch stays at 4. No page-URL column invented.
- [x] Credit section: NAFA cards (dateTime pulled_at, provider label, Canonical accent badge, Qualifies good / Does not qualify bad, Report + PDF external buttons target=_blank rel=noreferrer, Violations / Accounts hit / Credit score / Utilization grid; utilization rendered as raw numeric + "%", NOT pct()) and intake table (dateTime, provider label, status badge; verified=good added to EXTRA_TONE). SECURITY HELD: intake query selects ONLY id, submitted_at, provider, status; grep over app/ lib/ components/ finds the credential column names only inside the warning comment, zero queries or renders.
- [x] Reports section: type badge, submitted dateTime, rep name (left join sales.rep), status badge, Late warn badge when on_time=false (muted "On time" text when true, dash when null), View call link when strategy_call_id non-null.
- [x] Query budget: contact page batches remain 4/4/4; nafa + intake added as two sequential awaits after (batches were full). Call page batch 2 -> 3 (<= 4). Appointment page conditional await -> conditional batch of 2 (<= 4), both gated on call_id.
- [x] calls/[id]/body.tsx: main query + sync.calendar_map join; grid gains Calendar, Paid booking (Paid=good / Free=neutral / null=muted dash), Booked by (label()); Booking source kept. Reports filed section below Objections, rendered only when non-empty. Existing slots/objections/links intact.
- [x] appointments/[id]/body.tsx: same three rows in the folded-in call grid; Reports filed below Objections when non-empty; form-prefill buttons and merged layout untouched.
- [x] npx tsc --noEmit: EXIT 0 (run again after final comment cleanup, still 0).
- ESLint note: the 42 no-explicit-any hits and the Date.now()-in-render hit are pre-existing baseline patterns in these files (the (row: any) map style and the `const now = Date.now()` line predate this task); not introduced or expanded by this change. Task gate = tsc, which is clean.
- No emojis (grep-verified), no em dashes in prose/comments I authored (the "—" glyph appears only as the app's established no-data sentinel in data cells), var() tokens only (--panel-2 verified in globals.css), label() for all enum text, money() untouched.
- Files changed: app/(app)/contacts/[id]/detail.tsx, app/(app)/calls/[id]/body.tsx, app/(app)/appointments/[id]/body.tsx, tasks/todo.md. Nothing else.
