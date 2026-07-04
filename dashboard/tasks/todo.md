# Task: Add missing KPI widgets to calls / receivables / reps pages

## Plan
- [ ] Create lib/kpi-quality.ts with verified queries (schema from lib/forms.ts, form-options.ts, detail.tsx)
- [ ] calls page: DQ RATE AT SETTING + DQ RATE AT CLOSING + top DQ reasons (HBarList). New "Disqualifications" section. Keep first batch at 4, DQ queries in a SEPARATE batch.
- [ ] receivables page: ONBOARDING COMPLETION RATE + COLLECTION RATE as ProgressRings. Add 1 combined query (batch 3 -> 4).
- [ ] reps page: CALL REPORT SUBMISSION RATE per closer (on-time vs missing). Compact "Report compliance" table. Add as a SEPARATE await (batch already at 4 + repGoals).
- [ ] npx tsc --noEmit until clean.

## Verified schema (from code, NOT guessed)
- sales.call: disposition ('dq_on_call'), occurred_at, rep_id, opportunity_id, type='strategy', is_demo. NO dq_reason_id column.
- sales.opportunity: stage ('dq_on_call'), qualified, dq_stage ('setting'|'closing'), dq_reason_id, opened_at, is_demo, contact_id.
- core.dq_reason: id, name, active, sort_order.
- delivery.fulfilment: deal_id, contact_id, program_start, program_end, onboarding_complete (bool), status ('active'), is_demo.
- sales.report_submission: type ('sales_call'|'missed_call'|'post_call_notes'), rep_id, strategy_call_id, follow_up_call_id, submitted_at, status ('validated'|'superseded'), is_duplicate, on_time (bool), payload.
- finance.receivable: status ('scheduled'|'late'|'delinquent'|'paid'), amount_minor, payment_plan_id, deal_id, is_demo.
- DQ reasons sourced ONLY via sales.opportunity.dq_reason_id (call.dq_reason_id does not exist).

## Review
- [x] lib/kpi-quality.ts created: dqRates, dqReasons, onboardingAndCollection, reportCompliance. Each = ONE sql call.
- [x] calls page: DQ Rate at Setting + DQ Rate at Closing (Stat) + top reasons (HBarList) under new "Disqualifications" section. DQ queries in a SEPARATE Promise.all (2) so main batch stays 4.
- [x] receivables page: Onboarding Completion Rate + Collection Rate as ProgressRings under "Delivery and collections". Combined query = 4th in the batch.
- [x] reps page: Report compliance compact table (on-time %, on time, missing, taken) per closer. reportCompliance is a separate await (batch stays 4, then repGoals, then compliance sequential).
- [x] npx tsc --noEmit: EXIT 0, zero errors.
- All 6 KPIs are REAL (every column verified present in the write path lib/forms.ts). Empty-states are runtime null/zero-row guards, not stubs for missing columns.
- DQ reasons joined via sales.opportunity.dq_reason_id only (sales.call.dq_reason_id does NOT exist in the schema/code).
- No emojis, no em-dashes in prose (kept the app's existing "no-data" sentinel glyph for consistency). var() tokens throughout. Did not touch db.ts/layout.tsx/ui.tsx/charts.tsx/globals.css.
