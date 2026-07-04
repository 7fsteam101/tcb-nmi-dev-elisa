-- =====================================================================
-- 0029: Payment-link PRODUCTS + plan/subscription fields on payment links.
--   finance.payment_product — admin-managed catalog shown in the Payment Links
--     product dropdown (name, price, whether it can be sold as a plan).
--   finance.payment_link gains product_id + frequency + installments so a link
--     can be a one-time charge OR a payment plan / subscription.
-- =====================================================================

create table finance.payment_product (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  description text,
  amount_minor int not null,
  active boolean not null default true,
  allow_plan boolean not null default true,
  default_installments int,
  default_frequency public.payment_cadence,
  sort_order int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table finance.payment_product is 'Catalog of products/offers shown in the Payment Links dropdown. Admin-managed.';
comment on column finance.payment_product.id is 'Primary key (uuid, auto-generated).';
comment on column finance.payment_product.name is 'Product name shown in the dropdown and on the invoice.';
comment on column finance.payment_product.description is 'Line-item description on the pro-forma invoice.';
comment on column finance.payment_product.amount_minor is 'Default total price (minor units / cents).';
comment on column finance.payment_product.active is 'Whether it appears in the payment-links dropdown.';
comment on column finance.payment_product.allow_plan is 'Whether this product can be sold as a payment plan (vs one-time only).';
comment on column finance.payment_product.default_installments is 'Suggested number of installments when sold as a plan.';
comment on column finance.payment_product.default_frequency is 'Suggested billing frequency (payment_cadence) for a plan.';
comment on column finance.payment_product.sort_order is 'Display order in the dropdown.';
comment on column finance.payment_product.created_at is 'When created.';
comment on column finance.payment_product.updated_at is 'When last updated (auto-maintained).';
create trigger trg_payment_product_updated before update on finance.payment_product for each row execute function public.set_updated_at();
alter table finance.payment_product enable row level security;
grant all on finance.payment_product to service_role;
grant select on finance.payment_product to authenticated;
create index idx_payment_product_active on finance.payment_product(active, sort_order);

alter table finance.payment_link add column product_id uuid references finance.payment_product(id);
alter table finance.payment_link add column frequency public.payment_cadence;
alter table finance.payment_link add column installments int;
comment on column finance.payment_link.product_id is 'FK to the product this link sells.';
comment on column finance.payment_link.frequency is 'Billing frequency for a plan/subscription; null = one-time charge.';
comment on column finance.payment_link.installments is 'Number of installments for a plan; null or 1 = one-time.';

-- seed example products (Katie edits in Admin -> Products)
insert into finance.payment_product (name, description, amount_minor, allow_plan, default_installments, default_frequency, sort_order) values
  ('Book-a-Call Fee', '$25 refundable strategy-call booking fee.', 2500, false, null, null, 1),
  ('BDCR Program', 'Backdoor Credit Reset program.', 300000, true, 4, 'monthly', 2),
  ('Program Deposit', 'Deposit to secure onboarding.', 50000, false, null, null, 3);

-- End of migration 0029.
