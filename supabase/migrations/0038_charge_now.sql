-- =====================================================================
-- 0038: "Charge Now" — admin on-demand charge of a client's saved card.
-- An admin can charge the vaulted NMI Customer Vault token behind a payment
-- link from the payments UI. Two additive, backward-compatible changes back it:
--   1. a 'manual' payment_type, distinct from installment/pif/etc, for the
--      resulting successful_payment row.
--   2. charged_by_user_id on successful_payment: the admin who triggered it
--      (audit trail — automated/customer-initiated payments leave it null).
-- Neither is USED in this migration: a new enum value cannot be used in the
-- same transaction that adds it (see 0021), so only app code (post-commit)
-- writes the 'manual' value.
-- =====================================================================

-- 1. New payment_type for a manually-initiated (merchant-on-demand) charge.
alter type public.payment_type add value if not exists 'manual';

-- 2. Audit: which admin app_user triggered a manual charge. Null for every
--    non-manual payment (installments, the checkout sale, the $25 booking) —
--    those have no human operator.
alter table finance.successful_payment
  add column if not exists charged_by_user_id uuid references core.app_user(id);

comment on column finance.successful_payment.charged_by_user_id is
  'FK to the admin (core.app_user) who triggered a manual "Charge Now" against the saved card. Null for automated or customer-initiated payments.';

-- End of migration 0038.
