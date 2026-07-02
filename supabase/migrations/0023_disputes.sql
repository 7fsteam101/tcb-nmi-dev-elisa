-- =====================================================================
-- 0023: Dispute lifecycle entity (Katie 2026-07-02: "disputes, dispute status").
-- A dispute is a PROCESS with deadlines, not just an outcome: reversal rows keep
-- recording the money movement (funds withdrawn / final loss), while this table
-- tracks the case itself so open disputes and evidence deadlines are visible.
-- =====================================================================

create type public.dispute_status as enum (
  'warning_needs_response', 'warning_under_review', 'warning_closed',
  'needs_response', 'under_review', 'won', 'lost', 'charge_refunded'
);

create table finance.dispute (
  id uuid primary key default gen_random_uuid(),
  payment_id uuid references finance.successful_payment(id),
  deal_id uuid references sales.deal(id),
  processor public.payment_processor not null default 'stripe',
  external_dispute_id text not null unique,
  external_charge_id text,
  amount_minor int not null,
  reason text,
  status public.dispute_status not null,
  evidence_due_by timestamptz,
  opened_at timestamptz not null,
  closed_at timestamptz,
  funds_withdrawn boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table finance.dispute is 'A chargeback/dispute CASE and its lifecycle (needs_response -> under_review -> won/lost), incl. the evidence deadline. The money movement itself lands in finance.reversal when funds are actually withdrawn or the case is lost.';
comment on column finance.dispute.id is 'Primary key (uuid, auto-generated).';
comment on column finance.dispute.payment_id is 'FK to the disputed payment (when matched).';
comment on column finance.dispute.deal_id is 'FK to the deal (via the payment, when matched).';
comment on column finance.dispute.processor is 'stripe or nmi.';
comment on column finance.dispute.external_dispute_id is 'The dispute id in the processor (idempotency key).';
comment on column finance.dispute.external_charge_id is 'The disputed charge id in the processor.';
comment on column finance.dispute.amount_minor is 'Disputed amount (minor units).';
comment on column finance.dispute.reason is 'Processor-reported reason (fraudulent, product_not_received, ...).';
comment on column finance.dispute.status is 'Current lifecycle status, mirrored from the processor.';
comment on column finance.dispute.evidence_due_by is 'Evidence submission deadline — the operational clock.';
comment on column finance.dispute.opened_at is 'When the dispute was opened.';
comment on column finance.dispute.closed_at is 'When the dispute closed (won/lost/refunded).';
comment on column finance.dispute.funds_withdrawn is 'Whether the processor has pulled the funds (reinstated flips it back).';
comment on column finance.dispute.created_at is 'When this row was created.';
comment on column finance.dispute.updated_at is 'When this row was last updated (auto-maintained).';

create trigger trg_dispute_updated before update on finance.dispute for each row execute function public.set_updated_at();
alter table finance.dispute enable row level security;
grant all on finance.dispute to service_role;
grant select on finance.dispute to authenticated;
create index idx_dispute_status on finance.dispute(status);
create index idx_dispute_payment on finance.dispute(payment_id);

-- End of migration 0023.
