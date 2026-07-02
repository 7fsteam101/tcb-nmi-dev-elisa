-- =====================================================================
-- The Credit Brothers — Sales System Schema (v1)
-- Source of truth: doc 13 "Entity Field Specifications (Schema Spec)"
-- Target: TCB's own Supabase project (client-owned). Single-tenant.
--
-- Conventions (doc 13):
--   - id uuid PK (gen_random_uuid)
--   - created_at / updated_at timestamptz on every table (updated_at via trigger)
--   - money = integer minor units (cents), suffix _minor
--   - dates ISO; timestamptz = an event in time, date = calendar date
--   - controlled lists = native enums; reference lists (section J) = lookup tables
--   - external sync keys kept (close_id, ghl_*_id, monday_*_id)
--   - PII (intake credentials, SSN) = ciphertext only, RLS-locked, purge after use
-- =====================================================================

create extension if not exists pgcrypto;

-- updated_at trigger function -----------------------------------------
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;

-- =====================================================================
-- ENUM TYPES
-- =====================================================================
create type lifecycle_status      as enum ('lead','qualified','customer','do_not_contact');
create type contact_identifier_type as enum ('email','phone');
create type optin_goal            as enum ('house','car','credit_cards','business_credit','other');
create type opportunity_stage     as enum (
  'opt_in','booked','intake_submitted','audit_complete','readiness_confirmed',
  'strategy_taken','offer_made','closing','contract_signed','invoice_paid',
  'closed_won','onboarded','lost','dq');
create type dq_stage              as enum ('setting','closing');
create type call_type             as enum ('readiness','strategy','follow_up');
create type readiness_outcome     as enum ('confirmed_ready','reschedule','dq','no_contact');
create type call_disposition      as enum ('closed','follow_up','dq_on_call','no_decision');
create type follow_up_sub_type    as enum ('follow_up','enrollment');
create type follow_up_outcome     as enum ('closed','follow_up','dq','no_show','reschedule');
create type appointment_status    as enum ('scheduled','confirmed','taken','no_show','cancelled_by_lead','cancelled_by_team','rescheduled');
create type appointment_actor     as enum ('lead_link','closer');
create type intake_provider       as enum ('identityiq','myscoreiq');
create type intake_status         as enum ('submitted','verified','failed');
create type nafa_version          as enum ('A','B','C','D');
create type plan_type             as enum ('pif','3pay','6pay','7pay','12pay','13pay','zero_down');
create type deal_status           as enum ('active','refunded','churned');
create type contract_status       as enum ('sent','viewed','completed','void');
create type receivable_status     as enum ('scheduled','paid','late','delinquent','waived');
create type payment_processor     as enum ('stripe','nmi');
create type payment_type          as enum ('booking_25','deposit','installment','pif');
create type reversal_type         as enum ('refund','chargeback');
create type rep_role              as enum ('setter','closer','hybrid','csm','admin');
create type commission_tier_name  as enum ('base_10','elevated_15');
create type commission_basis      as enum ('cash_collected');
create type commission_eval_metric as enum ('close_rate');
create type refund_handling       as enum ('clawback','none');
create type commission_line_type  as enum ('base','residual','adjustment','clawback');
create type commission_payout_status as enum ('calculated','approved','paid');
create type offer_type            as enum ('core','coaching','funding','community','lto','booking_fee');
create type fulfilment_status     as enum ('active','completed','churned','refunded');
create type report_type           as enum ('sales_call','missed_call','post_call_notes');
create type report_status         as enum ('submitted','validated','superseded','rejected');

-- =====================================================================
-- J. LOOKUP / REFERENCE TABLES (controlled lists, never free text)
-- =====================================================================
create table cancellation_reason  (id uuid primary key default gen_random_uuid(), name text not null, category text, sort_order int, active bool not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table dq_reason            (id uuid primary key default gen_random_uuid(), name text not null, category text, sort_order int, active bool not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table source_channel       (id uuid primary key default gen_random_uuid(), name text not null, category text, sort_order int, active bool not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table credit_account_type  (id uuid primary key default gen_random_uuid(), name text not null, category text, sort_order int, active bool not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table call_outcome         (id uuid primary key default gen_random_uuid(), name text not null, category text, sort_order int, active bool not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());
create table objection_type       (id uuid primary key default gen_random_uuid(), name text not null, category text, sort_order int, active bool not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now());

-- =====================================================================
-- E. PEOPLE
-- =====================================================================
create table rep (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  email text,
  role rep_role not null,
  sendblue_owner text,
  sendblue_owner_email text,
  current_commission_tier commission_tier_name,   -- derived from rolling 2-wk close rate
  active bool not null default true,
  gusto_employee_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- A. IDENTITY & SOURCE
-- =====================================================================
create table contact (
  id uuid primary key default gen_random_uuid(),
  full_name text not null,
  first_name text,
  last_name text,
  primary_email text,
  primary_phone text,
  company_name text,
  website text,
  lifecycle_status lifecycle_status not null default 'lead',  -- never downgrade from customer/DNC (app rule D5)
  owner_rep_id uuid references rep(id),
  merged_into_contact_id uuid references contact(id),          -- set on dedup merge; keep both histories
  close_id text, ghl_marketing_id text, ghl_repair_id text, monday_lead_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table contact_identifier (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contact(id) on delete cascade,
  type contact_identifier_type not null,
  value text not null,                 -- append a new value if different, NEVER overwrite (D5)
  is_primary bool not null default false,
  source text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- F. MARKETING (offers / pricing)
-- =====================================================================
create table offer (
  id uuid primary key default gen_random_uuid(),
  name text not null,                  -- BDCR / Coaching / Business Funding / School / Credit-Maxing / $25 Booking
  type offer_type not null,
  default_price_minor int,
  active bool not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table pricing_plan (
  id uuid primary key default gen_random_uuid(),
  offer_id uuid not null references offer(id),
  name plan_type not null,
  version int not null,
  installments int,
  installment_amount_minor int,
  requires_first_last bool,            -- the first+last-upfront rule
  effective_from date, effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- B. FUNNEL & CALLS — Opportunity / Opt-In / Call / Appointment
-- =====================================================================
create table opportunity (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contact(id),
  stage opportunity_stage not null default 'opt_in',     -- canonical lifecycle; no moving backwards (app rule)
  qualified bool not null default true,                  -- innocent until DQ'd
  dq_stage dq_stage,
  dq_reason_id uuid references dq_reason(id),
  owner_rep_id uuid references rep(id),
  first_touch_channel text,                              -- snapshot-at-close (first Opt-In source)
  converting_touch_channel text,                         -- snapshot-at-close (booking source)
  cohort_month date,
  current_nafa_id uuid,                                  -- FK added after nafa table (circular)
  opened_at timestamptz, closed_at timestamptz,
  close_id text, ghl_marketing_opp_id text, monday_lead_source_item text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table opt_in (
  id uuid primary key default gen_random_uuid(),
  contact_id uuid not null references contact(id),
  opportunity_id uuid references opportunity(id),
  submitted_at timestamptz not null,
  goal optin_goal,
  credit_score_range text,
  blocker text,
  source_channel text, source_campaign text, utm text, dub_link_id text,  -- feeds first-touch
  form_id text,
  counts_as_unique bool not null default true,           -- derived: >30-day re-count rule
  ghl_marketing_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table intake_submission (
  -- ⚠️ PII: idiq/msiq logins + SSN-last-4. Store CIPHERTEXT ONLY (app-layer encrypt
  -- via pgcrypto or Supabase Vault). RLS-locked to service role. Purge after the pull / engagement end.
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunity(id),
  contact_id uuid not null references contact(id),
  submitted_at timestamptz not null,
  provider intake_provider not null,
  idiq_username text, idiq_password text,                -- 🔒 encrypted ciphertext only
  msiq_username text, msiq_password text,                -- 🔒 encrypted ciphertext only
  last_4_ssn text,                                       -- 🔒 encrypted ciphertext only
  status intake_status not null default 'submitted',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table nafa (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunity(id),
  contact_id uuid not null references contact(id),
  intake_id uuid references intake_submission(id),
  pulled_at timestamptz not null,
  provider intake_provider,
  violation_opportunities int,
  accounts_with_violations int,
  version nafa_version,
  other_negative_accounts int,
  ineligible_accounts int,
  hard_inquiries int,
  credit_score int,
  utilization_pct numeric,
  report_pdf_url text,
  report_url text,
  qualifies bool,                                        -- derived: >=5 violation ops AND >=2 accounts
  is_canonical bool not null default true,               -- latest valid = used for auto-DQ / scoring / pitch
  monday_audit_id text, monday_credit_audit_item text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table opportunity add constraint opportunity_current_nafa_fk
  foreign key (current_nafa_id) references nafa(id);

create table call (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunity(id),
  type call_type not null,
  rep_id uuid references rep(id),
  scheduled_at timestamptz,                              -- original event start
  current_scheduled_at timestamptz,                      -- after reschedules (the same call moves)
  occurred_at timestamptz,
  recording_url text,
  transcript_text text,
  dq_reason_id uuid references dq_reason(id),
  -- strategy-specific
  booking_payment_id uuid,                               -- FK added after successful_payment (circular)
  booking_source_channel text, booking_source_campaign text, booking_utm text, booking_dub_link_id text, -- = converting-touch
  nafa_id uuid,                                          -- FK added after nafa exists? nafa exists; add now below
  cancellation_reason_id uuid references cancellation_reason(id),
  offer_made bool,
  disposition call_disposition,
  is_primary bool,                                       -- the canonical strategy call for the opp
  is_duplicate bool default false,                       -- excluded from all KPIs (refunded $25)
  -- readiness-specific
  chk_intake bool, chk_video bool, chk_partner bool, chk_price bool, chk_40day bool, chk_not_at_work bool,
  expected_payment_minor int,
  readiness_outcome readiness_outcome,
  -- follow_up-specific
  sub_type follow_up_sub_type,
  sequence_no int,
  partial_payment_minor int,
  followup_outcome follow_up_outcome,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table call add constraint call_nafa_fk foreign key (nafa_id) references nafa(id);

create table appointment (
  -- one scheduled slot of a strategy-call booking (per-slot model). Booking counts once;
  -- each reschedule = a NEW row. Terminal slots (taken/no_show/cancelled) are immutable.
  id uuid primary key default gen_random_uuid(),
  call_id uuid not null references call(id) on delete cascade,
  seq int not null,                                      -- 1st / 2nd / 3rd scheduled time
  scheduled_for timestamptz not null,
  status appointment_status not null default 'scheduled',
  is_current bool not null default true,                 -- the live slot (latest)
  reason_id uuid references cancellation_reason(id),
  moved_by appointment_actor,                            -- lead_link (self-serve) vs closer
  rescheduled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- D. DEAL & MONEY
-- =====================================================================
create table deal (
  id uuid primary key default gen_random_uuid(),
  opportunity_id uuid not null references opportunity(id),
  contact_id uuid not null references contact(id),
  closer_rep_id uuid references rep(id),
  offer_id uuid not null references offer(id),           -- always 1 offer per deal
  total_contract_value_minor int not null,              -- Booked revenue
  plan_type_snapshot plan_type,                          -- plan AS SOLD (frozen snapshot)
  discount_pct numeric,
  is_couple bool default false,
  partner_contact_id uuid references contact(id),
  deal_close_date date not null,
  status deal_status not null default 'active',          -- never deleted
  close_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table contract (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deal(id),
  issued_at timestamptz,
  status contract_status not null default 'sent',
  viewed_at timestamptz, signed_at timestamptz,          -- "viewed" = the honesty signal
  contract_value_minor int,
  is_canonical bool not null default true,               -- latest SIGNED = canonical
  document_url text,
  ghl_marketing_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table payment_plan (
  -- versioned — fixes the #1 back-reflection bug. A re-split = NEW version + new receivables,
  -- old version marked not-current. History preserved, never overwritten.
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deal(id),
  version int not null,
  plan_type plan_type,
  total_minor int,
  is_current bool not null default true,
  superseded_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table receivable (
  id uuid primary key default gen_random_uuid(),
  payment_plan_id uuid not null references payment_plan(id),  -- the version it belongs to
  deal_id uuid not null references deal(id),                  -- denormalized for convenience
  installment_no int not null,
  due_date date not null,
  amount_minor int not null,
  status receivable_status not null default 'scheduled',      -- delinquent = 14+ days late
  paid_at date,
  payment_id uuid,                                            -- FK added after successful_payment (circular)
  monday_payment_schedule_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table successful_payment (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid references deal(id),                       -- null for the $25
  strategy_call_id uuid references call(id),              -- for the $25 booking fee
  receivable_id uuid references receivable(id),           -- the installment it fulfils
  rep_id uuid references rep(id),                         -- for commission attribution
  processor payment_processor not null,
  type payment_type not null,
  amount_minor int not null,                             -- gross
  processing_fee_minor int,                              -- commission is on gross
  occurred_at timestamptz not null,
  nmi_transaction_id text, stripe_charge_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table receivable add constraint receivable_payment_fk
  foreign key (payment_id) references successful_payment(id);
alter table call add constraint call_booking_payment_fk
  foreign key (booking_payment_id) references successful_payment(id);

create table reversal (   -- Refund / Chargeback
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deal(id),
  payment_id uuid references successful_payment(id),
  type reversal_type not null,
  amount_minor int not null,
  reason text,
  occurred_at timestamptz not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- E. COMMISSION (rules-as-data → lines → payout)
-- =====================================================================
create table commission_plan (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  role rep_role not null,                                -- setter / closer
  basis commission_basis not null default 'cash_collected',
  eval_metric commission_eval_metric,
  eval_window_days int,                                  -- e.g. 14 (prior 2 weeks)
  residual_rate numeric,                                 -- [confirm: = tier?]
  refund_handling refund_handling,                       -- [confirm]
  effective_from date not null,
  effective_to date,
  is_current bool not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table commission_tier (
  id uuid primary key default gen_random_uuid(),
  commission_plan_id uuid not null references commission_plan(id) on delete cascade,
  label text,
  min_metric_value numeric not null,                     -- threshold e.g. 0.0 or 0.333
  rate numeric not null,                                 -- e.g. 0.10 / 0.15
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table commission_payout (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references rep(id),
  period_start date not null, period_end date not null,
  total_commission_minor int not null default 0,
  status commission_payout_status not null default 'calculated',
  approved_by_rep_id uuid references rep(id),
  approved_at timestamptz, paid_at timestamptz,
  gusto_payout_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table commission_line (
  id uuid primary key default gen_random_uuid(),
  rep_id uuid not null references rep(id),
  payment_id uuid references successful_payment(id),     -- null for clawback/adjustment lines
  deal_id uuid references deal(id),
  payout_id uuid references commission_payout(id),
  commission_plan_id uuid references commission_plan(id),
  type commission_line_type not null,
  rate_applied numeric not null,                         -- FROZEN at calc time
  commission_amount_minor int not null,                 -- payment x rate (negative for clawback)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- F. MARKETING — Ad Spend (Meta insights, daily by ad)
-- =====================================================================
create table ad_spend (
  id uuid primary key default gen_random_uuid(),
  date date not null,                                    -- in the ad-account timezone (lock EST vs PST)
  campaign_id text, campaign_name text,
  adset_id text, adset_name text,
  ad_id text not null, ad_name text,
  spend_minor int not null,
  impressions int, reach int, clicks int,
  ctr numeric,
  cpm_minor int, cpc_minor int,
  leads int,
  pulled_at timestamptz not null,                        -- for restatement (trailing-window upsert)
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- G. FULFILMENT (1:1 Deal — delivery of one service)
-- =====================================================================
create table fulfilment (
  id uuid primary key default gen_random_uuid(),
  deal_id uuid not null references deal(id),
  contact_id uuid not null references contact(id),
  csm_rep_id uuid references rep(id),
  onboarded_at date,
  program_start date, program_end date,
  onboarding_complete bool,
  status fulfilment_status not null default 'active',
  ghl_repair_id text, monday_client_source_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- H. CAPTURE — Report Submission (call reports; NOT commission)
-- =====================================================================
create table report_submission (
  id uuid primary key default gen_random_uuid(),
  type report_type not null,
  rep_id uuid not null references rep(id),
  strategy_call_id uuid references call(id),
  follow_up_call_id uuid references call(id),
  submitted_at timestamptz not null,
  status report_status not null default 'submitted',
  supersedes_id uuid references report_submission(id),   -- the prior submission it corrects
  is_duplicate bool default false,
  on_time bool,
  payload jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- I. PHASE 2 — Objection (built now, populated when AI call analysis is on)
-- =====================================================================
create table objection (
  id uuid primary key default gen_random_uuid(),
  strategy_call_id uuid not null references call(id) on delete cascade,
  objection_type_id uuid references objection_type(id),
  led_to_loss bool,
  source text,                                           -- rep_logged / ai_extracted
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- =====================================================================
-- CONSTRAINTS & INDEXES — enforce the locked rules at the DB level
-- =====================================================================
-- one identifier value maps to one person; one primary per (contact,type)
create unique index uq_identifier_value on contact_identifier (type, lower(value));
create unique index uq_identifier_primary on contact_identifier (contact_id, type) where is_primary;
-- one OPEN opportunity per contact (won/onboarded/lost/dq are closed cycles → a new one may open)
create unique index uq_open_opp_per_contact on opportunity (contact_id)
  where stage not in ('closed_won','onboarded','lost','dq');
-- exactly one primary strategy call per opportunity
create unique index uq_primary_strategy on call (opportunity_id) where type = 'strategy' and is_primary;
-- one current appointment per booking; unique slot sequence
create unique index uq_current_appt on appointment (call_id) where is_current;
create unique index uq_appt_seq on appointment (call_id, seq);
-- at most one Deal per Opportunity (1:0..1)
create unique index uq_deal_per_opp on deal (opportunity_id);
-- one canonical NAFA per opportunity; one canonical contract per deal
create unique index uq_canonical_nafa on nafa (opportunity_id) where is_canonical;
create unique index uq_canonical_contract on contract (deal_id) where is_canonical;
-- one current payment-plan version per deal; unique version number
create unique index uq_current_plan on payment_plan (deal_id) where is_current;
create unique index uq_plan_version on payment_plan (deal_id, version);
-- receivable installment uniqueness
create unique index uq_receivable_installment on receivable (payment_plan_id, installment_no);
-- ad spend grain = one row per ad per day
create unique index uq_adspend_grain on ad_spend (date, ad_id);
-- one current commission plan per role
create unique index uq_current_comm_plan on commission_plan (role) where is_current;
-- commission payout per rep per period
create unique index uq_payout_period on commission_payout (rep_id, period_start, period_end);

-- foreign-key / query indexes (Postgres does not auto-index FKs)
create index ix_optin_contact on opt_in (contact_id);
create index ix_optin_opp on opt_in (opportunity_id);
create index ix_opp_contact on opportunity (contact_id);
create index ix_call_opp on call (opportunity_id);
create index ix_appt_call on appointment (call_id);
create index ix_appt_scheduled_for on appointment (scheduled_for);
create index ix_nafa_opp on nafa (opportunity_id);
create index ix_intake_opp on intake_submission (opportunity_id);
create index ix_deal_opp on deal (opportunity_id);
create index ix_deal_contact on deal (contact_id);
create index ix_contract_deal on contract (deal_id);
create index ix_plan_deal on payment_plan (deal_id);
create index ix_receivable_plan on receivable (payment_plan_id);
create index ix_receivable_deal on receivable (deal_id);
create index ix_receivable_due on receivable (due_date);
create index ix_payment_deal on successful_payment (deal_id);
create index ix_payment_receivable on successful_payment (receivable_id);
create index ix_payment_occurred on successful_payment (occurred_at);
create index ix_commline_rep on commission_line (rep_id);
create index ix_commline_payout on commission_line (payout_id);
create index ix_fulfilment_deal on fulfilment (deal_id);
create index ix_report_strategy_call on report_submission (strategy_call_id);

-- =====================================================================
-- updated_at triggers on every table
-- =====================================================================
do $$ declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('create trigger trg_%s_updated before update on public.%I for each row execute function public.set_updated_at()', t, t);
  end loop;
end $$;

-- =====================================================================
-- ROW-LEVEL SECURITY
--   Enable on every table. The backend sync writes via the service role
--   (which bypasses RLS). The dashboard reads as `authenticated`.
--   PII (intake_submission) is service-role only — NO authenticated policy.
--   Tighten per the dashboard's role model in a follow-up migration.
-- =====================================================================
do $$ declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I enable row level security', t);
    if t <> 'intake_submission' then
      execute format('create policy %I on public.%I for select to authenticated using (true)', t || '_auth_read', t);
    end if;
  end loop;
end $$;

-- =====================================================================
-- DATA API GRANTS
--   The project is set to "auto-expose new tables = OFF", so grant the
--   Data API roles explicitly (don't rely on the project default).
--   service_role (backend sync) = full access; authenticated (dashboard)
--   = SELECT on every table EXCEPT the PII intake table.
-- =====================================================================
grant usage on schema public to authenticated, service_role;
grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;
do $$ declare t text;
begin
  for t in select tablename from pg_tables where schemaname = 'public' and tablename <> 'intake_submission' loop
    execute format('grant select on public.%I to authenticated', t);
  end loop;
end $$;

-- =====================================================================
-- TABLE COMMENTS (full field-level descriptions live in doc 13)
-- =====================================================================
comment on table contact is 'One real person = the Close "Lead" (1:1). Extra emails/phones live in contact_identifier.';
comment on table contact_identifier is 'A person''s extra emails/phones. Append-only, never overwrite; match across all when deduping.';
comment on table opt_in is 'A marketing lead-form submission. Carries the source that feeds first-touch.';
comment on table opportunity is 'The sales-cycle instance = the reporting unit. One OPEN per contact; won → a new opportunity.';
comment on table call is 'All calls in one table (type = readiness/strategy/follow_up). The strategy call is the booking; funnel KPIs filter type=strategy.';
comment on table appointment is 'One scheduled slot of a strategy booking. Each reschedule = a new row; terminal slots are immutable. Reschedule = status=rescheduled.';
comment on table intake_submission is '⚠️ PII (idiq/msiq logins + SSN-last-4). Ciphertext only, RLS-locked to service role, purge after use.';
comment on table nafa is 'One credit-report pull rendered as a NAFA. 1:N per opportunity (history kept); is_canonical = the latest valid.';
comment on table deal is 'A won opportunity + terms. Always one offer per deal. status never deleted.';
comment on table payment_plan is 'Versioned schedule. A re-split creates a new version + new receivables (the #1 bug fix); old version not-current.';
comment on table receivable is 'One scheduled installment of a payment-plan version. Drives pipeline value, projected cash, delinquency, collection rate.';
comment on table successful_payment is 'A cleared transaction. Cash collected = NMI gross, excludes booking_25, net of reversals.';
comment on table commission_line is 'Per commissionable payment, auto-calculated, rate frozen. Its own table so one payment can split across reps and clawbacks can exist with no payment.';
comment on table ad_spend is 'Meta insights, grain = (date x ad_id). Trailing-window upsert by pulled_at for restatements. Lock the ad-account timezone first.';
comment on table fulfilment is 'Delivery of ONE purchased service (1:1 deal). The "client" is the contact; contact:deal = 1:N.';

-- End of migration 0001.
