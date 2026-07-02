-- =====================================================================
-- 0008: Organize the tables into domain schemas (Katie 2026-06-27).
-- core / sales / credit / finance / marketing / delivery, instead of one flat
-- public schema. FKs, indexes, RLS policies, grants and triggers all travel with
-- their table, so nothing breaks. The updated_at trigger function stays in public
-- (the triggers reference it by name, so it must stay put).
-- =====================================================================

create schema if not exists core;
create schema if not exists sales;
create schema if not exists credit;
create schema if not exists finance;
create schema if not exists marketing;
create schema if not exists delivery;

-- core: identity + shared reference lists
alter table public.contact             set schema core;
alter table public.contact_identifier  set schema core;
alter table public.cancellation_reason set schema core;
alter table public.dq_reason           set schema core;
alter table public.source_channel      set schema core;
alter table public.credit_account_type set schema core;
alter table public.call_outcome        set schema core;
alter table public.objection_type      set schema core;

-- sales: the funnel + the sales team
alter table public.opt_in            set schema sales;
alter table public.opportunity       set schema sales;
alter table public.call              set schema sales;
alter table public.appointment       set schema sales;
alter table public.deal              set schema sales;
alter table public.contract          set schema sales;
alter table public.report_submission set schema sales;
alter table public.objection         set schema sales;
alter table public.rep               set schema sales;

-- credit: the NAFA pipeline (PII)
alter table public.intake_submission set schema credit;
alter table public.nafa              set schema credit;

-- finance: money + commission
alter table public.payment_plan       set schema finance;
alter table public.receivable         set schema finance;
alter table public.successful_payment set schema finance;
alter table public.reversal           set schema finance;
alter table public.commission_plan    set schema finance;
alter table public.commission_tier    set schema finance;
alter table public.commission_line    set schema finance;
alter table public.commission_payout  set schema finance;

-- marketing: ads + the offer catalog
alter table public.ad_spend     set schema marketing;
alter table public.offer        set schema marketing;
alter table public.pricing_plan set schema marketing;

-- delivery
alter table public.fulfilment set schema delivery;

-- Grants: the backend (service_role) and the dashboard (authenticated) need USAGE on
-- the new schemas. The per-table grants moved with each table, so this just opens the
-- schema doors. intake_submission keeps NO authenticated grant (PII stays backend-only).
grant usage on schema core, sales, credit, finance, marketing, delivery to authenticated, service_role;
grant all on all tables    in schema core, sales, credit, finance, marketing, delivery to service_role;
grant all on all sequences in schema core, sales, credit, finance, marketing, delivery to service_role;

-- NOTE: to read these schemas through Supabase's auto-generated Data API (the dashboard's
-- supabase-js reads), add them to the project's Exposed Schemas (Settings -> API, or the
-- Management API). Deferred until the dashboard is built; the sync writes via the service
-- role / direct connection, which does not go through the Data API.

-- End of migration 0008.
