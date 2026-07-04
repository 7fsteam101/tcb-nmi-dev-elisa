-- =====================================================================
-- 0027: Goals / projections + toggleable commission rules (Katie 2026-07-04).
--   core.goal              — company-wide and per-rep targets per metric+period
--   sales.commission_rule  — the rule catalog (base rate, tier bonus, clawback)
--   sales.rep_commission_setting — per-rep on/off (and optional param override)
-- =====================================================================

create table core.goal (
  id uuid primary key default gen_random_uuid(),
  scope text not null default 'company',
  rep_id uuid references sales.rep(id),
  metric text not null,
  period text not null default 'monthly',
  target_value numeric not null,
  effective_from date not null default date_trunc('month', current_date)::date,
  effective_to date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chk_goal_scope check (scope in ('company','rep')),
  constraint chk_goal_metric check (metric in ('calls_booked','calls_taken','cash_collected','deals_won','clients')),
  constraint chk_goal_period check (period in ('weekly','monthly','quarterly')),
  constraint chk_goal_rep check ((scope = 'rep') = (rep_id is not null))
);
comment on table core.goal is 'Targets for a metric over a period, company-wide (scope=company) or per rep (scope=rep). Progress = actual / target_value.';
comment on column core.goal.id is 'Primary key (uuid, auto-generated).';
comment on column core.goal.scope is 'company = whole team; rep = one person (rep_id set).';
comment on column core.goal.rep_id is 'FK to the rep when scope=rep; null for company goals.';
comment on column core.goal.metric is 'calls_booked / calls_taken / cash_collected (minor units) / deals_won / clients.';
comment on column core.goal.period is 'weekly / monthly / quarterly — the window the target applies to.';
comment on column core.goal.target_value is 'The target. For cash_collected this is minor units (cents); otherwise a count.';
comment on column core.goal.effective_from is 'First day the goal applies.';
comment on column core.goal.effective_to is 'Last day it applies (null = still active).';
comment on column core.goal.created_at is 'When this row was created.';
comment on column core.goal.updated_at is 'When this row was last updated (auto-maintained).';
create trigger trg_goal_updated before update on core.goal for each row execute function public.set_updated_at();
alter table core.goal enable row level security;
grant all on core.goal to service_role;
grant select on core.goal to authenticated;
create index idx_goal_lookup on core.goal(scope, metric, period, rep_id);

create table sales.commission_rule (
  id uuid primary key default gen_random_uuid(),
  key text not null unique,
  name text not null,
  description text,
  params jsonb not null default '{}'::jsonb,
  default_enabled boolean not null default true,
  sort_order int,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table sales.commission_rule is 'Catalog of commission rules. Each can be toggled per rep in rep_commission_setting; params hold the numbers (rates, thresholds).';
comment on column sales.commission_rule.id is 'Primary key (uuid, auto-generated).';
comment on column sales.commission_rule.key is 'Stable machine key the commission engine switches on.';
comment on column sales.commission_rule.name is 'Human name shown in the admin toggle.';
comment on column sales.commission_rule.description is 'What the rule does.';
comment on column sales.commission_rule.params is 'Rule numbers, e.g. {"rate":0.10} or {"threshold":0.333,"rate":0.15}.';
comment on column sales.commission_rule.default_enabled is 'Whether a rep gets this rule unless a per-rep setting overrides it.';
comment on column sales.commission_rule.sort_order is 'Display order in admin.';
comment on column sales.commission_rule.created_at is 'When this row was created.';
comment on column sales.commission_rule.updated_at is 'When this row was last updated (auto-maintained).';
create trigger trg_commission_rule_updated before update on sales.commission_rule for each row execute function public.set_updated_at();
alter table sales.commission_rule enable row level security;
grant all on sales.commission_rule to service_role;
grant select on sales.commission_rule to authenticated;

create table sales.rep_commission_setting (
  rep_id uuid not null references sales.rep(id),
  rule_id uuid not null references sales.commission_rule(id),
  enabled boolean not null default true,
  override_params jsonb,
  updated_at timestamptz not null default now(),
  primary key (rep_id, rule_id)
);
comment on table sales.rep_commission_setting is 'Per-rep on/off (and optional param override) for a commission rule. Absent row => use rule.default_enabled + rule.params.';
comment on column sales.rep_commission_setting.rep_id is 'FK to the rep.';
comment on column sales.rep_commission_setting.rule_id is 'FK to the commission rule.';
comment on column sales.rep_commission_setting.enabled is 'Whether this rule applies to this rep.';
comment on column sales.rep_commission_setting.override_params is 'Optional per-rep params (e.g. a custom rate); null = use rule.params.';
comment on column sales.rep_commission_setting.updated_at is 'When this row was last updated (auto-maintained).';
create trigger trg_rep_comm_updated before update on sales.rep_commission_setting for each row execute function public.set_updated_at();
alter table sales.rep_commission_setting enable row level security;
grant all on sales.rep_commission_setting to service_role;
grant select on sales.rep_commission_setting to authenticated;

-- seed the current commission logic as editable rules
insert into sales.commission_rule (key, name, description, params, default_enabled, sort_order) values
  ('base_rate', 'Base commission', 'Base rate on cash collected.', '{"rate":0.10}'::jsonb, true, 1),
  ('tier_bonus', 'Performance tier bonus', 'Higher rate while the trailing 14-day close rate meets the threshold.', '{"threshold":0.333,"rate":0.15}'::jsonb, true, 2),
  ('refund_clawback', 'Refund clawback', 'Deduct base rate on cash tied to deals that later refunded.', '{"rate":0.10}'::jsonb, true, 3);

-- End of migration 0027.
