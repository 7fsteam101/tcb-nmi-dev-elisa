-- =====================================================================
-- 0033: July 2 call decisions (schema starters). Additive, permissive-mirror
-- safe. Covers three confirmed decisions:
--   1. product tier (high vs low ticket) on payments + deals, for the dashboard
--      high/low-ticket filter. Backfilled from payment_type (booking_25 = low).
--   2. self-booked vs setter-booked split (report the %): a booked_by tag on the
--      call, plus the two new pipeline stages so the new Close pipeline can map
--      Self Booked / Setter Booked directly.
--   3. a partner flag on rep, so a commission payee can be marked partner vs team
--      member (the full partner-commission model lands with the comp-plan rebuild).
-- Nothing here fights the permissive Close mirror; enum values are pre-added but
-- not required.
-- =====================================================================

-- 1. PRODUCT TIER -----------------------------------------------------
do $$ begin
  if not exists (select 1 from pg_type where typname = 'product_tier') then
    create type public.product_tier as enum ('high_ticket', 'low_ticket');
  end if;
end $$;

alter table finance.successful_payment add column if not exists product_type public.product_tier;
comment on column finance.successful_payment.product_type is
  'High vs low ticket. booking_25 = low (the $25 fee); program payments = high. Dashboard filter dimension (July 2 decision). Unified Stripe + NMI table.';
update finance.successful_payment
  set product_type = case when type = 'booking_25' then 'low_ticket'::public.product_tier
                          else 'high_ticket'::public.product_tier end
  where product_type is null;

alter table sales.deal add column if not exists product_type public.product_tier default 'high_ticket';
comment on column sales.deal.product_type is 'High vs low ticket program (July 2 decision).';

-- 2. SELF-BOOKED vs SETTER-BOOKED SPLIT -------------------------------
-- text tag mirrors the moved_by convention ('self_book' | 'setter').
alter table sales.call add column if not exists booked_by text;
comment on column sales.call.booked_by is
  'Who booked the strategy call: self_book | setter. Feeds the Self-Booked vs Setter-Booked split (July 2 decision).';

-- new-pipeline stages for the split (safe to pre-add; used once the new Close
-- pipeline launches mid-July).
alter type public.opportunity_stage add value if not exists 'setter_booked';
alter type public.opportunity_stage add value if not exists 'self_booked';

-- 3. PARTNER PAYEE FLAG ----------------------------------------------
alter table sales.rep add column if not exists is_partner boolean not null default false;
comment on column sales.rep.is_partner is
  'Marks a commission payee as an external partner vs a team member. Minimal starter; full partner-commission model lands with the comp-plan rebuild (July 2 decision).';

-- End of migration 0033.
