-- =====================================================================
-- 0050: Slack notifications (Katie, July 13). A Slack bot connects like any
-- other provider (token in Vault on sync.connections provider='slack');
-- core.notification_rule holds per-event config: enabled, target channel, and
-- an editable message template with {placeholder} custom values. The engine
-- (lib/notify.ts) renders + posts fire-and-forget so ingest never breaks on a
-- Slack hiccup.
-- =====================================================================
-- the bot token is stored on sync.connections like every other provider, so
-- the provider enum needs the value (safe here: nothing in this migration
-- uses it inside the same transaction)
alter type sync.provider add value if not exists 'slack';

create table if not exists core.notification_rule (
  id uuid primary key default gen_random_uuid(),
  event_type text not null unique,
  label text not null,
  enabled boolean not null default false,
  channel_id text,
  channel_name text,
  template text not null,
  variables text not null,
  min_amount_minor integer,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
comment on table core.notification_rule is 'Per-event Slack notification config: toggle, target channel, editable template with {placeholder} values (the variables column documents what each event offers). min_amount_minor optionally gates money events.';

drop trigger if exists set_updated_at on core.notification_rule;
create trigger set_updated_at before update on core.notification_rule
  for each row execute function public.set_updated_at();

alter table core.notification_rule enable row level security;
grant all on core.notification_rule to service_role;
grant select on core.notification_rule to authenticated;
drop policy if exists notification_rule_auth_read on core.notification_rule;
create policy notification_rule_auth_read on core.notification_rule for select to authenticated using (true);

-- seed the rule catalog (disabled until Slack is connected and a channel chosen)
insert into core.notification_rule (event_type, label, template, variables) values
  ('payment_succeeded', 'Successful payment',
   'Payment received: {amount} from {contact_name} ({processor}). Deal collected: {collected_pct}.',
   '{contact_name} {amount} {processor} {plan_type} {collected_pct} {deal_value}'),
  ('payment_refunded', 'Refund / chargeback',
   'Reversal: {amount} {kind} for {contact_name}.',
   '{contact_name} {amount} {kind}'),
  ('deal_won', 'Deal won',
   'Deal closed: {contact_name} at {amount} ({plan_type}) by {closer}.',
   '{contact_name} {amount} {plan_type} {closer}'),
  ('appointment_booked', 'Appointment booked',
   'New booking: {contact_name} on {time} ({calendar}, {booked_by}).',
   '{contact_name} {time} {calendar} {booked_by}'),
  ('appointment_no_show', 'No-show',
   'No-show: {contact_name} missed {time}.',
   '{contact_name} {time} {calendar}'),
  ('lead_created', 'New lead',
   'New lead: {contact_name} via {source}{campaign}.',
   '{contact_name} {source} {campaign}'),
  ('daily_digest', 'Daily KPI digest',
   'Yesterday: {leads} leads, {booked} booked, {taken} taken, {cash} collected.',
   '{leads} {booked} {taken} {cash} {date}')
on conflict (event_type) do nothing;
