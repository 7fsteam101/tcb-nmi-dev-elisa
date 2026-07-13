import { sql } from "@/lib/db";
import { slackStatus, listSlackChannels } from "@/lib/notify";
import { money, shortDate } from "@/lib/format";
import { reportTimezone } from "@/lib/settings";
import { label } from "@/components/ui";
import { NotificationRulesEditor } from "./editor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Sample values for the preview (obviously fake, real shape). The editor also
// offers "latest real example" computed below from live data.
const SAMPLE: Record<string, string> = {
  contact_name: "Jane Sample", amount: "$2,500", processor: "NMI", plan_type: "3pay",
  collected_pct: "33%", deal_value: "$7,500", kind: "refund", closer: "Sample Closer",
  time: "2026-07-14T18:00:00.000Z", calendar: "Strategy Calls", booked_by: "Self book",
  source: "meta ads", campaign: " (Sample Campaign)",
  leads: "12", booked: "5", taken: "4", cash: "$8,250", date: "2026-07-12",
};

export default async function NotificationsAdmin() {
  // sequential on purpose: status first, channels only when connected, then rules
  const connected = await slackStatus();
  const channels = connected ? await listSlackChannels() : [];
  const tz = await reportTimezone();
  const rules = await sql`
    select id, event_type, label, enabled, channel_id, channel_name, template, variables, min_amount_minor, bot_name, bot_icon
    from core.notification_rule order by label`;

  // ---- latest REAL example per event type (sequential, one row each) ----
  const examples: Record<string, Record<string, string>> = {};
  const [pay] = await sql`
    select p.amount_minor, p.processor, p.type, ct.full_name,
           d.total_contract_value_minor as tcv,
           (select coalesce(sum(p2.amount_minor),0) from finance.successful_payment p2 where p2.deal_id = d.id) as collected
    from finance.successful_payment p
    left join core.contact ct on ct.id = p.contact_id
    left join sales.deal d on d.id = p.deal_id
    where not p.is_demo and p.type <> 'booking_25'
    order by p.occurred_at desc limit 1`;
  if (pay) examples.payment_succeeded = {
    contact_name: pay.full_name ?? "unknown", amount: money(Number(pay.amount_minor)),
    processor: String(pay.processor ?? "").toUpperCase(), plan_type: pay.type ?? "",
    collected_pct: pay.tcv ? `${Math.round((Number(pay.collected) / Number(pay.tcv)) * 100)}%` : "",
    deal_value: pay.tcv ? money(Number(pay.tcv)) : "",
  };
  const [rev] = await sql`
    select r.amount_minor, r.type, ct.full_name
    from finance.reversal r
    left join sales.deal d on d.id = r.deal_id
    left join core.contact ct on ct.id = d.contact_id
    order by r.occurred_at desc limit 1`;
  if (rev) examples.payment_refunded = {
    contact_name: rev.full_name ?? "unknown", amount: money(Number(rev.amount_minor)), kind: rev.type ?? "refund",
  };
  const [deal] = await sql`
    select d.total_contract_value_minor as tcv, d.plan_type_snapshot, ct.full_name, rep.full_name as closer
    from sales.deal d
    left join core.contact ct on ct.id = d.contact_id
    left join sales.rep rep on rep.id = d.closer_rep_id
    where not d.is_demo order by d.deal_close_date desc limit 1`;
  if (deal) examples.deal_won = {
    contact_name: deal.full_name ?? "unknown", amount: money(Number(deal.tcv)),
    plan_type: deal.plan_type_snapshot ?? "", closer: deal.closer ?? "",
  };
  const [appt] = await sql`
    select a.scheduled_for, ct.full_name, cm.calendar_name, c.booked_by
    from sales.appointment a
    join sales.call c on c.id = a.call_id
    join sales.opportunity o on o.id = c.opportunity_id
    join core.contact ct on ct.id = o.contact_id
    left join sync.calendar_map cm on cm.id = c.calendar_map_id
    where not a.is_demo and a.is_current
    order by a.created_at desc limit 1`;
  if (appt) examples.appointment_booked = {
    contact_name: appt.full_name ?? "unknown", time: new Date(appt.scheduled_for).toISOString(),
    calendar: appt.calendar_name ?? "", booked_by: appt.booked_by ? label(appt.booked_by) : "Self book",
  };
  const [ns] = await sql`
    select a.scheduled_for, ct.full_name, cm.calendar_name
    from sales.appointment a
    join sales.call c on c.id = a.call_id
    join sales.opportunity o on o.id = c.opportunity_id
    join core.contact ct on ct.id = o.contact_id
    left join sync.calendar_map cm on cm.id = c.calendar_map_id
    where not a.is_demo and a.status = 'no_show'
    order by a.scheduled_for desc limit 1`;
  if (ns) examples.appointment_no_show = {
    contact_name: ns.full_name ?? "unknown", time: new Date(ns.scheduled_for).toISOString(), calendar: ns.calendar_name ?? "",
  };
  const [lead] = await sql`
    select o.submitted_at, o.source_channel, o.source_campaign, ct.full_name
    from sales.opt_in o join core.contact ct on ct.id = o.contact_id
    where not o.is_demo and o.counted order by o.submitted_at desc limit 1`;
  if (lead) examples.lead_created = {
    contact_name: lead.full_name ?? "unknown",
    source: lead.source_channel ? label(lead.source_channel) : "",
    campaign: lead.source_campaign ? ` (${lead.source_campaign})` : "",
  };
  const [dig] = await sql`
    select
      (select count(*) from sales.opt_in o where not o.is_demo and o.counted and o.counts_as_unique
        and o.submitted_at >= current_date - 1 and o.submitted_at < current_date)::int as leads,
      (select count(*) from sales.call c where not c.is_demo and c.type='strategy' and c.is_primary and c.is_booking
        and coalesce(c.current_scheduled_at, c.scheduled_at) >= current_date - 1
        and coalesce(c.current_scheduled_at, c.scheduled_at) < current_date)::int as booked,
      (select count(*) from sales.appointment a where not a.is_demo and a.status='taken'
        and a.scheduled_for >= current_date - 1 and a.scheduled_for < current_date)::int as taken,
      (select coalesce(sum(p.amount_minor),0) from finance.successful_payment p where not p.is_demo
        and p.type <> 'booking_25' and p.occurred_at >= current_date - 1 and p.occurred_at < current_date) as cash`;
  if (dig) examples.daily_digest = {
    leads: String(dig.leads), booked: String(dig.booked), taken: String(dig.taken),
    cash: money(Number(dig.cash)), date: shortDate(new Date(Date.now() - 864e5).toISOString(), tz),
  };

  const serialized = rules.map((r: any) => ({
    id: String(r.id),
    eventType: String(r.event_type),
    label: String(r.label),
    enabled: Boolean(r.enabled),
    channelId: r.channel_id == null ? null : String(r.channel_id),
    channelName: r.channel_name == null ? null : String(r.channel_name),
    template: String(r.template),
    variables: String(r.variables),
    minAmountMinor: r.min_amount_minor == null ? null : Number(r.min_amount_minor),
    botName: r.bot_name ?? null,
    botIcon: r.bot_icon ?? null,
    sample: SAMPLE,
    example: examples[String(r.event_type)] ?? null,
  }));
  return <NotificationRulesEditor connected={connected} channels={channels} rules={serialized} />;
}
