import { sql } from "./db";
import type { PageKey } from "./access-rules";

// The drill-down registry: every widget on every dashboard opens one of these —
// the actual rows behind the number. Each metric declares its home page (for
// access control), columns, and row query. `arg` carries a filter (a stage, a
// campaign, a rep id) for the parameterized drills.
export type ExploreColumn = { key: string; label: string; kind?: "money" | "datetime" | "date" | "label" | "close_link" };
export type ExploreDef = {
  title: string;
  description: string;
  page: PageKey;
  columns: ExploreColumn[];
  query: (demo: boolean, days: number, arg?: string) => Promise<any[]>;
};

const contactCols: ExploreColumn[] = [
  { key: "contact_name", label: "Contact" },
  { key: "close_id", label: "Open in Close", kind: "close_link" },
];

export const EXPLORE: Record<string, ExploreDef> = {
  leads: {
    title: "Leads (unique opt-ins)",
    description: "Every lead-form submission in range. Unique = first submission, or a return after 30+ days.",
    page: "overview",
    columns: [
      { key: "submitted_at", label: "Submitted", kind: "datetime" },
      ...contactCols,
      { key: "source_channel", label: "Source" },
      { key: "source_campaign", label: "Campaign" },
      { key: "goal", label: "Goal", kind: "label" },
      { key: "counts_as_unique", label: "Unique" },
    ],
    query: (demo, days) => sql`
      select o.submitted_at, ct.full_name as contact_name, ct.close_id, o.source_channel,
             o.source_campaign, o.goal, case when o.counts_as_unique then 'yes' else 'repeat' end as counts_as_unique
      from sales.opt_in o join core.contact ct on ct.id = o.contact_id
      where o.is_demo = ${demo} and o.submitted_at >= now() - make_interval(days => ${days})
      order by o.submitted_at desc limit 500`,
  },
  booked: {
    title: "Calls booked",
    description: "Unique paid strategy-call bookings, counted once regardless of reschedules.",
    page: "overview",
    columns: [
      { key: "scheduled_at", label: "Booked for", kind: "datetime" },
      ...contactCols,
      { key: "closer", label: "Closer" },
      { key: "booking_source_channel", label: "Source" },
      { key: "slots", label: "Slots (1 = never moved)" },
      { key: "current_status", label: "Current status", kind: "label" },
    ],
    query: (demo, days) => sql`
      select coalesce(c.current_scheduled_at, c.scheduled_at) as scheduled_at,
             ct.full_name as contact_name, ct.close_id, rep.full_name as closer,
             c.booking_source_channel,
             (select count(*) from sales.appointment a where a.call_id = c.id) as slots,
             (select a.status from sales.appointment a where a.call_id = c.id and a.is_current) as current_status
      from sales.call c
      join sales.opportunity o on o.id = c.opportunity_id
      join core.contact ct on ct.id = o.contact_id
      left join sales.rep rep on rep.id = c.rep_id
      where c.is_demo = ${demo} and c.type = 'strategy' and c.is_primary and c.is_booking
        and coalesce(c.current_scheduled_at, c.scheduled_at) >= now() - make_interval(days => ${days})
      order by 1 desc limit 500`,
  },
  taken: {
    title: "Calls taken",
    description: "Appointment slots that actually happened, by event start time.",
    page: "overview",
    columns: [
      { key: "scheduled_for", label: "Happened", kind: "datetime" },
      ...contactCols,
      { key: "closer", label: "Closer" },
      { key: "seq", label: "Attempt #" },
      { key: "disposition", label: "Disposition", kind: "label" },
    ],
    query: (demo, days) => sql`
      select a.scheduled_for, ct.full_name as contact_name, ct.close_id, rep.full_name as closer,
             a.seq, c.disposition
      from sales.appointment a
      join sales.call c on c.id = a.call_id
      join sales.opportunity o on o.id = c.opportunity_id
      join core.contact ct on ct.id = o.contact_id
      left join sales.rep rep on rep.id = c.rep_id
      where a.is_demo = ${demo} and a.status = 'taken'
        and a.scheduled_for >= now() - make_interval(days => ${days})
      order by a.scheduled_for desc limit 500`,
  },
  no_shows: {
    title: "No-shows",
    description: "Slots where the lead did not show. A later taken slot on the same booking = recovered.",
    page: "funnel",
    columns: [
      { key: "scheduled_for", label: "Was scheduled", kind: "datetime" },
      ...contactCols,
      { key: "closer", label: "Closer" },
      { key: "seq", label: "Attempt #" },
      { key: "recovered", label: "Recovered later" },
    ],
    query: (demo, days) => sql`
      select a.scheduled_for, ct.full_name as contact_name, ct.close_id, rep.full_name as closer, a.seq,
             case when exists (select 1 from sales.appointment a2 where a2.call_id = a.call_id and a2.seq > a.seq and a2.status = 'taken')
                  then 'yes' else 'no' end as recovered
      from sales.appointment a
      join sales.call c on c.id = a.call_id
      join sales.opportunity o on o.id = c.opportunity_id
      join core.contact ct on ct.id = o.contact_id
      left join sales.rep rep on rep.id = c.rep_id
      where a.is_demo = ${demo} and a.status = 'no_show'
        and a.scheduled_for >= now() - make_interval(days => ${days})
      order by a.scheduled_for desc limit 500`,
  },
  reschedules: {
    title: "Reschedules",
    description: "Every slot that was moved to a new time (each move counts once).",
    page: "funnel",
    columns: [
      { key: "rescheduled_at", label: "Moved on", kind: "datetime" },
      ...contactCols,
      { key: "scheduled_for", label: "Old slot", kind: "datetime" },
      { key: "moved_by", label: "Moved by", kind: "label" },
      { key: "reason", label: "Reason" },
      { key: "seq", label: "Was attempt #" },
    ],
    query: (demo, days) => sql`
      select a.rescheduled_at, ct.full_name as contact_name, ct.close_id, a.scheduled_for,
             a.moved_by, r.name as reason, a.seq
      from sales.appointment a
      join sales.call c on c.id = a.call_id
      join sales.opportunity o on o.id = c.opportunity_id
      join core.contact ct on ct.id = o.contact_id
      left join core.cancellation_reason r on r.id = a.reason_id
      where a.is_demo = ${demo} and a.status = 'rescheduled'
        and a.rescheduled_at >= now() - make_interval(days => ${days})
      order by a.rescheduled_at desc limit 500`,
  },
  cancellations: {
    title: "Cancellations",
    description: "Cancelled slots, by lead and by team, with reasons.",
    page: "funnel",
    columns: [
      { key: "scheduled_for", label: "Was scheduled", kind: "datetime" },
      ...contactCols,
      { key: "status", label: "Cancelled by", kind: "label" },
      { key: "reason", label: "Reason" },
    ],
    query: (demo, days) => sql`
      select a.scheduled_for, ct.full_name as contact_name, ct.close_id, a.status, r.name as reason
      from sales.appointment a
      join sales.call c on c.id = a.call_id
      join sales.opportunity o on o.id = c.opportunity_id
      join core.contact ct on ct.id = o.contact_id
      left join core.cancellation_reason r on r.id = a.reason_id
      where a.is_demo = ${demo} and a.status in ('cancelled_by_lead','cancelled_by_team')
        and a.scheduled_for >= now() - make_interval(days => ${days})
      order by a.scheduled_for desc limit 500`,
  },
  deals: {
    title: "Deals won",
    description: "Won deals in range, by deal close date.",
    page: "overview",
    columns: [
      { key: "deal_close_date", label: "Closed", kind: "date" },
      ...contactCols,
      { key: "closer", label: "Closer" },
      { key: "plan_type_snapshot", label: "Plan", kind: "label" },
      { key: "total_contract_value_minor", label: "Contract value", kind: "money" },
      { key: "status", label: "Status", kind: "label" },
    ],
    query: (demo, days) => sql`
      select d.deal_close_date, ct.full_name as contact_name, ct.close_id, rep.full_name as closer,
             d.plan_type_snapshot, d.total_contract_value_minor, d.status
      from sales.deal d
      join core.contact ct on ct.id = d.contact_id
      left join sales.rep rep on rep.id = d.closer_rep_id
      where d.is_demo = ${demo} and d.deal_close_date >= (now() - make_interval(days => ${days}))::date
      order by d.deal_close_date desc limit 500`,
  },
  cash: {
    title: "Cash collected",
    description: "Program payments (excluding the $25 booking fees), gross.",
    page: "receivables",
    columns: [
      { key: "occurred_at", label: "Paid", kind: "datetime" },
      ...contactCols,
      { key: "type", label: "Type", kind: "label" },
      { key: "amount_minor", label: "Amount", kind: "money" },
      { key: "processor", label: "Processor", kind: "label" },
      { key: "rep", label: "Rep" },
    ],
    query: (demo, days) => sql`
      select p.occurred_at, coalesce(ct.full_name, '(unlinked)') as contact_name, ct.close_id,
             p.type, p.amount_minor, p.processor, rep.full_name as rep
      from finance.successful_payment p
      left join sales.deal d on d.id = p.deal_id
      left join core.contact ct on ct.id = d.contact_id
      left join sales.rep rep on rep.id = p.rep_id
      where p.is_demo = ${demo} and p.type <> 'booking_25'
        and p.occurred_at >= now() - make_interval(days => ${days})
      order by p.occurred_at desc limit 500`,
  },
  stage: {
    title: "Pipeline stage",
    description: "Every opportunity currently in this stage.",
    page: "funnel",
    columns: [
      { key: "opened_at", label: "Opened", kind: "datetime" },
      ...contactCols,
      { key: "owner", label: "Owner" },
      { key: "cohort_month", label: "Cohort", kind: "date" },
    ],
    query: (demo, days, arg) => sql`
      select o.opened_at, ct.full_name as contact_name, ct.close_id, rep.full_name as owner, o.cohort_month
      from sales.opportunity o
      join core.contact ct on ct.id = o.contact_id
      left join sales.rep rep on rep.id = o.owner_rep_id
      where o.is_demo = ${demo} and o.stage = ${arg ?? "lead_opt_in"}::public.opportunity_stage
      order by o.opened_at desc limit 500`,
  },
  receivables: {
    title: "Receivables",
    description: "Installments on current plan versions, filtered by status.",
    page: "receivables",
    columns: [
      { key: "due_date", label: "Due", kind: "date" },
      ...contactCols,
      { key: "installment_no", label: "Installment #" },
      { key: "amount_minor", label: "Amount", kind: "money" },
      { key: "status", label: "Status", kind: "label" },
    ],
    query: (demo, _days, arg) => sql`
      select r.due_date, ct.full_name as contact_name, ct.close_id, r.installment_no, r.amount_minor, r.status
      from finance.receivable r
      join finance.payment_plan pp on pp.id = r.payment_plan_id and pp.is_current
      join sales.deal d on d.id = r.deal_id
      join core.contact ct on ct.id = d.contact_id
      where r.is_demo = ${demo}
        and case when ${arg ?? "open"} = 'next30' then r.status = 'scheduled' and r.due_date <= current_date + 30
                 when ${arg ?? "open"} = 'open' then r.status in ('scheduled','late','delinquent')
                 else r.status = ${arg ?? "scheduled"}::public.receivable_status end
      order by r.due_date asc limit 500`,
  },
  adspend: {
    title: "Ad spend",
    description: "Per ad per day, as pulled from Meta (restated for 48h).",
    page: "marketing",
    columns: [
      { key: "date", label: "Date", kind: "date" },
      { key: "campaign_name", label: "Campaign" },
      { key: "adset_name", label: "Adset" },
      { key: "ad_name", label: "Ad" },
      { key: "spend_minor", label: "Spend", kind: "money" },
      { key: "leads", label: "Meta leads" },
      { key: "clicks", label: "Clicks" },
    ],
    query: (demo, days, arg) => sql`
      select s.date, s.campaign_name, s.adset_name, s.ad_name, s.spend_minor, s.leads, s.clicks
      from marketing.ad_spend s
      where s.is_demo = ${demo} and s.date >= current_date - ${days}::int
        and (${arg ?? null}::text is null or s.campaign_name = ${arg ?? null})
      order by s.date desc, s.spend_minor desc limit 500`,
  },
  objections: {
    title: "Objections",
    description: "Objections logged on strategy calls (from the rep forms).",
    page: "funnel",
    columns: [
      { key: "created_at", label: "Logged", kind: "datetime" },
      ...contactCols,
      { key: "objection", label: "Objection" },
      { key: "led_to_loss", label: "Led to loss" },
      { key: "source", label: "Source", kind: "label" },
    ],
    query: (demo, days) => sql`
      select ob.created_at, ct.full_name as contact_name, ct.close_id, ot.name as objection,
             case when ob.led_to_loss then 'yes' else 'no' end as led_to_loss, ob.source
      from sales.objection ob
      join core.objection_type ot on ot.id = ob.objection_type_id
      join sales.call c on c.id = ob.strategy_call_id
      join sales.opportunity o on o.id = c.opportunity_id
      join core.contact ct on ct.id = o.contact_id
      where c.is_demo = ${demo} and ob.created_at >= now() - make_interval(days => ${days})
      order by ob.created_at desc limit 500`,
  },
  rep: {
    title: "Rep activity",
    description: "This rep's taken calls and outcomes in range.",
    page: "reps",
    columns: [
      { key: "scheduled_for", label: "Call", kind: "datetime" },
      ...contactCols,
      { key: "status", label: "Slot status", kind: "label" },
      { key: "disposition", label: "Disposition", kind: "label" },
      { key: "tcv_minor", label: "Deal value", kind: "money" },
    ],
    query: (demo, days, arg) => sql`
      select a.scheduled_for, ct.full_name as contact_name, ct.close_id, a.status, c.disposition,
             d.total_contract_value_minor as tcv_minor
      from sales.call c
      join sales.appointment a on a.call_id = c.id and a.is_current
      join sales.opportunity o on o.id = c.opportunity_id
      join core.contact ct on ct.id = o.contact_id
      left join sales.deal d on d.opportunity_id = o.id
      where c.is_demo = ${demo} and c.rep_id = ${arg ?? null}
        and a.scheduled_for >= now() - make_interval(days => ${days})
      order by a.scheduled_for desc limit 500`,
  },
  missing_reports: {
    title: "Won in Close, report missing",
    description: "Opportunities marked won in Close with NO Sales Call Report filed — the deal record does not exist until the closer submits the form (due same day).",
    page: "reps",
    columns: [
      { key: "closed_at", label: "Won in Close", kind: "datetime" },
      ...contactCols,
      { key: "stage", label: "Stage", kind: "label" },
      { key: "owner", label: "Owner" },
    ],
    query: (demo) => sql`
      select o.closed_at, ct.full_name as contact_name, ct.close_id, o.stage, rep.full_name as owner
      from sales.opportunity o
      join core.contact ct on ct.id = o.contact_id
      left join sales.rep rep on rep.id = o.owner_rep_id
      where o.is_demo = ${demo}
        and o.stage in ('closed_won','deposit','won_pif','won_pp')
        and not exists (select 1 from sales.deal d where d.opportunity_id = o.id)
      order by o.closed_at desc nulls last limit 500`,
  },
  reversals: {
    title: "Refunds and chargebacks",
    description: "Every reversal netted out of cash collected.",
    page: "receivables",
    columns: [
      { key: "occurred_at", label: "When", kind: "datetime" },
      ...contactCols,
      { key: "type", label: "Type", kind: "label" },
      { key: "amount_minor", label: "Amount", kind: "money" },
      { key: "reason", label: "Reason" },
    ],
    query: (demo, days) => sql`
      select v.occurred_at, coalesce(ct.full_name, '(unlinked)') as contact_name, ct.close_id,
             v.type, v.amount_minor, v.reason
      from finance.reversal v
      left join sales.deal d on d.id = v.deal_id
      left join core.contact ct on ct.id = d.contact_id
      where v.is_demo = ${demo} and v.occurred_at >= now() - make_interval(days => ${days})
      order by v.occurred_at desc limit 500`,
  },
};
