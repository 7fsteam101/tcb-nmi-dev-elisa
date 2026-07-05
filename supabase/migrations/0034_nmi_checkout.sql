-- =====================================================================
-- 0034: NMI branded checkout. Adds the fields the pay page + charge/schedule/
-- webhook flow needs onto finance.payment_link:
--   token          public URL token (distinct from the row id), unique
--   expires_at     link expiry
--   nmi_customer_vault_id   the vaulted card, for later installment charges
--   nmi_subscription_id     the NMI subscription driving installments 2..N
--   viewed_at      first-open timestamp (status telemetry)
-- Additive only. payment_link.status stays text; the flow uses:
--   pending -> viewed -> paid  (or failed / expired / void).
-- =====================================================================

alter table finance.payment_link add column if not exists token text;
alter table finance.payment_link add column if not exists expires_at timestamptz;
alter table finance.payment_link add column if not exists viewed_at timestamptz;
alter table finance.payment_link add column if not exists nmi_customer_vault_id text;
alter table finance.payment_link add column if not exists nmi_subscription_id text;

create unique index if not exists uq_payment_link_token
  on finance.payment_link (token) where token is not null;

comment on column finance.payment_link.token is 'Public URL token for the branded pay page (pay.thecreditbrothers.com/pay/<token>). Not the row id, so the id is never exposed.';
comment on column finance.payment_link.nmi_customer_vault_id is 'NMI Customer Vault id for the card taken on this link; used to charge later installments card-not-present.';
comment on column finance.payment_link.nmi_subscription_id is 'NMI subscription id auto-charging installments 2..N (add_subscription, plan_payments = N-1).';

-- widen the status check to the checkout flow's states.
alter table finance.payment_link drop constraint if exists chk_payment_link_status;
alter table finance.payment_link add constraint chk_payment_link_status
  check (status in ('created','sent','pending','viewed','paid','failed','expired','void','refunded'));

-- End of migration 0034.
