import { sql } from "./db";

// Every query filters on is_demo so demo mode and live mode never mix.
// Dates bucket in the report timezone (client-confirmable, default ET).
// Window: `days` gives the rolling default; when `since`/`until` are passed
// (a custom range) they bound the window explicitly (until null = open forward,
// which preserves rolling behavior so future-dated bookings still count).
type Params = { demo: boolean; days: number; tz: string; since?: string; until?: string | null };

export async function overviewKpis({ demo, days, since, until }: Params) {
  const [row] = await sql`
    with range as (select coalesce(${since ?? null}::timestamptz, now() - make_interval(days => ${days})) as since,
                          ${until ?? null}::timestamptz as until)
    select
      (select count(*) from sales.opt_in o, range r
        where o.is_demo = ${demo} and o.submitted_at >= r.since and (r.until is null or o.submitted_at < r.until) and o.counts_as_unique) as leads,
      (select count(*) from sales.call c, range r
        where c.is_demo = ${demo} and c.type = 'strategy' and c.is_primary and c.is_booking
          and not coalesce(c.is_duplicate, false)
          and coalesce(c.current_scheduled_at, c.scheduled_at) >= r.since
          and (r.until is null or coalesce(c.current_scheduled_at, c.scheduled_at) < r.until)) as booked,
      (select count(*) from sales.appointment a, range r
        where a.is_demo = ${demo} and a.status = 'taken' and a.scheduled_for >= r.since and (r.until is null or a.scheduled_for < r.until)) as taken,
      (select count(*) from sales.appointment a, range r
        where a.is_demo = ${demo} and a.status = 'no_show' and a.scheduled_for >= r.since and (r.until is null or a.scheduled_for < r.until)) as no_shows,
      (select count(*) from sales.deal d, range r
        where d.is_demo = ${demo} and d.deal_close_date >= r.since::date and (r.until is null or d.deal_close_date < r.until::date) and d.status <> 'refunded') as deals_won,
      (select coalesce(sum(d.total_contract_value_minor), 0) from sales.deal d, range r
        where d.is_demo = ${demo} and d.deal_close_date >= r.since::date and (r.until is null or d.deal_close_date < r.until::date) and d.status <> 'refunded') as booked_revenue_minor,
      (select coalesce(sum(p.amount_minor), 0) from finance.successful_payment p, range r
        where p.is_demo = ${demo} and p.type <> 'booking_25' and p.occurred_at >= r.since and (r.until is null or p.occurred_at < r.until)) as cash_collected_minor,
      (select coalesce(sum(v.amount_minor), 0) from finance.reversal v, range r
        where v.is_demo = ${demo} and v.occurred_at >= r.since and (r.until is null or v.occurred_at < r.until)) as reversals_minor,
      (select coalesce(sum(s.spend_minor), 0) from marketing.ad_spend s, range r
        where s.is_demo = ${demo} and s.date >= r.since::date and (r.until is null or s.date < r.until::date)) as ad_spend_minor,
      (select count(*) from sales.appointment a, range r
        where a.is_demo = ${demo} and a.status = 'rescheduled' and a.rescheduled_at >= r.since and (r.until is null or a.rescheduled_at < r.until)) as reschedules,
      (select count(*) from sales.appointment a, range r
        where a.is_demo = ${demo} and a.status in ('cancelled_by_lead','cancelled_by_team')
          and a.scheduled_for >= r.since and (r.until is null or a.scheduled_for < r.until)) as cancellations
  `;
  return row;
}

// Leadership close rate: deals won / ALL bookings on the calendar, including
// no-shows and cancellations. Denominator = the same unique primary strategy-call
// bookings as the "booked" KPI; numerator = deals won in range.
export async function leadershipCloseRate({ demo, days, since, until }: Omit<Params, "tz">) {
  const [row] = await sql`
    with range as (select coalesce(${since ?? null}::timestamptz, now() - make_interval(days => ${days})) as since,
                          ${until ?? null}::timestamptz as until)
    select
      (select count(*) from sales.deal d, range r
        where d.is_demo = ${demo} and d.deal_close_date >= r.since::date and (r.until is null or d.deal_close_date < r.until::date) and d.status <> 'refunded') as deals_won,
      (select count(*) from sales.call c, range r
        where c.is_demo = ${demo} and c.type = 'strategy' and c.is_primary and c.is_booking
          and not coalesce(c.is_duplicate, false)
          and coalesce(c.current_scheduled_at, c.scheduled_at) >= r.since
          and (r.until is null or coalesce(c.current_scheduled_at, c.scheduled_at) < r.until)) as booked
  `;
  return row;
}

export async function dailySeries({ demo, days, tz, from, to }: Params & { from?: string | null; to?: string | null }) {
  return sql`
    with d as (
      select generate_series(
        coalesce(${from ?? null}::date, current_date - ${days - 1}::int),
        coalesce(${to ?? null}::date, current_date),
        interval '1 day')::date as day
    )
    select d.day,
      (select count(*) from sales.opt_in o where o.is_demo = ${demo} and o.counts_as_unique
        and (o.submitted_at at time zone ${tz})::date = d.day) as leads,
      (select count(*) from sales.call c where c.is_demo = ${demo} and c.type = 'strategy' and c.is_primary
        and c.is_booking and not coalesce(c.is_duplicate, false)
        and (coalesce(c.current_scheduled_at, c.scheduled_at) at time zone ${tz})::date = d.day) as booked,
      (select count(*) from sales.appointment a where a.is_demo = ${demo} and a.status = 'taken'
        and (a.scheduled_for at time zone ${tz})::date = d.day) as taken,
      (select count(*) from sales.appointment a where a.is_demo = ${demo} and a.status = 'rescheduled'
        and (a.rescheduled_at at time zone ${tz})::date = d.day) as rescheduled,
      (select coalesce(sum(p.amount_minor), 0) from finance.successful_payment p where p.is_demo = ${demo}
        and p.type <> 'booking_25' and (p.occurred_at at time zone ${tz})::date = d.day) as cash_minor,
      (select coalesce(sum(s.spend_minor), 0) from marketing.ad_spend s where s.is_demo = ${demo}
        and s.date = d.day) as spend_minor
    from d order by d.day`;
}

export async function pipelineByStage(demo: boolean) {
  return sql`
    select o.stage, count(*) as n
    from sales.opportunity o
    where o.is_demo = ${demo}
    group by o.stage
    order by min(case o.stage
      when 'lead_opt_in' then 1 when 'strategy_call_booked' then 2 when 'intake_form_submitted' then 3
      when 'audit_complete' then 4 when 'intake_form_needed' then 5 when 'call_confirmed' then 6
      when 'no_show' then 7 when 'call_canceled_by_lead' then 8 when 'follow_up_call_booked' then 9
      when 'warm_list' then 10 when 'contract_sent' then 11 when 'contract_signed' then 12
      when 'deposit' then 13 when 'won_pif' then 14 when 'won_pp' then 15
      when 'call_canceled_by_team' then 16 when 'lost' then 17 when 'dq_on_call' then 18 end)`;
}

// The leakage story: what happens between "booked" and "taken".
export async function leakage({ demo, days, since, until }: Omit<Params, "tz">) {
  const [row] = await sql`
    with rng as (select coalesce(${since ?? null}::timestamptz, now() - make_interval(days => ${days})) as since,
                        ${until ?? null}::timestamptz as until),
    bookings as (
      select c.id,
        count(a.id) as slots,
        count(*) filter (where a.status = 'rescheduled') as reschedules,
        bool_or(a.status = 'taken') as ever_taken,
        bool_or(a.status = 'no_show') as ever_no_show,
        bool_or(a.status in ('cancelled_by_lead','cancelled_by_team')) as cancelled
      from sales.call c
      join sales.appointment a on a.call_id = c.id
      cross join rng
      where c.is_demo = ${demo} and c.type = 'strategy' and c.is_primary and c.is_booking
        and coalesce(c.current_scheduled_at, c.scheduled_at) >= rng.since
        and (rng.until is null or coalesce(c.current_scheduled_at, c.scheduled_at) < rng.until)
      group by c.id)
    select
      count(*) as bookings,
      count(*) filter (where ever_taken) as taken,
      count(*) filter (where reschedules > 0) as with_reschedule,
      count(*) filter (where reschedules > 1) as with_multi_reschedule,
      count(*) filter (where ever_no_show) as with_no_show,
      count(*) filter (where ever_no_show and ever_taken) as no_show_recovered,
      count(*) filter (where cancelled) as cancelled,
      coalesce(avg(reschedules), 0) as avg_reschedules
    from bookings`;
  return row;
}

export async function cancellationReasons({ demo, days }: Omit<Params, "tz">) {
  return sql`
    select coalesce(r.name, 'No reason recorded') as reason, count(*) as n
    from sales.appointment a
    left join core.cancellation_reason r on r.id = a.reason_id
    where a.is_demo = ${demo}
      and a.status in ('rescheduled','cancelled_by_lead','cancelled_by_team')
      and a.scheduled_for >= now() - make_interval(days => ${days})
    group by 1 order by n desc`;
}

export async function upcomingAppointments(demo: boolean) {
  return sql`
    select a.id, a.scheduled_for, a.status, a.seq, ct.full_name as contact_name, ct.id as contact_id,
           rep.full_name as closer, c.booking_source_channel, o.stage
    from sales.appointment a
    join sales.call c on c.id = a.call_id
    join sales.opportunity o on o.id = c.opportunity_id
    join core.contact ct on ct.id = o.contact_id
    left join sales.rep rep on rep.id = c.rep_id
    where a.is_demo = ${demo} and a.is_current
      and a.scheduled_for between now() - interval '12 hours' and now() + interval '7 days'
    order by a.scheduled_for asc limit 50`;
}

export async function recentCallOutcomes(demo: boolean) {
  return sql`
    select c.id, c.occurred_at, c.disposition, ct.full_name as contact_name, ct.id as contact_id,
           rep.full_name as closer, d.total_contract_value_minor, d.plan_type_snapshot
    from sales.call c
    join sales.opportunity o on o.id = c.opportunity_id
    join core.contact ct on ct.id = o.contact_id
    left join sales.rep rep on rep.id = c.rep_id
    left join sales.deal d on d.opportunity_id = o.id and d.is_demo = ${demo}
    where c.is_demo = ${demo} and c.type = 'strategy' and c.occurred_at is not null
    order by c.occurred_at desc limit 25`;
}

export async function receivablesSummary(demo: boolean) {
  const [row] = await sql`
    select
      coalesce(sum(amount_minor) filter (where status = 'scheduled'), 0) as scheduled_minor,
      coalesce(sum(amount_minor) filter (where status = 'late'), 0) as late_minor,
      coalesce(sum(amount_minor) filter (where status = 'delinquent'), 0) as delinquent_minor,
      coalesce(sum(amount_minor) filter (where status = 'paid'), 0) as paid_minor,
      coalesce(sum(amount_minor) filter (where status = 'scheduled' and due_date <= current_date + 30), 0) as next_30d_minor,
      count(*) filter (where status in ('late','delinquent')) as overdue_count
    from finance.receivable r
    where r.is_demo = ${demo}
      and exists (select 1 from finance.payment_plan pp where pp.id = r.payment_plan_id and pp.is_current)`;
  return row;
}

export async function receivablesList(demo: boolean) {
  return sql`
    select r.id, r.installment_no, r.due_date, r.amount_minor, r.status, r.paid_at,
           ct.full_name as contact_name, pp.plan_type, d.deal_close_date
    from finance.receivable r
    join finance.payment_plan pp on pp.id = r.payment_plan_id and pp.is_current
    join sales.deal d on d.id = r.deal_id
    join core.contact ct on ct.id = d.contact_id
    where r.is_demo = ${demo} and r.status <> 'paid'
    order by r.due_date asc limit 100`;
}

// Projected cash: scheduled receivables on current plan versions, bucketed by
// due month for the next 6 calendar months (current month first). Months with
// nothing due still return a zero row.
export async function projectedCashByMonth(demo: boolean) {
  return sql`
    with months as (
      select generate_series(
        date_trunc('month', current_date),
        date_trunc('month', current_date) + interval '5 months',
        interval '1 month')::date as month
    )
    select m.month,
      (select coalesce(sum(r.amount_minor), 0)
        from finance.receivable r
        where r.is_demo = ${demo} and r.status = 'scheduled'
          and date_trunc('month', r.due_date)::date = m.month
          and exists (select 1 from finance.payment_plan pp
                      where pp.id = r.payment_plan_id and pp.is_current)) as amount_minor
    from months m
    order by m.month`;
}

export async function repPerformance({ demo, days }: Omit<Params, "tz">) {
  return sql`
    with taken as (
      select c.rep_id, count(*) as n
      from sales.call c join sales.appointment a on a.call_id = c.id and a.status = 'taken'
      where c.is_demo = ${demo} and c.type = 'strategy'
        and a.scheduled_for >= now() - make_interval(days => ${days})
      group by c.rep_id),
    won as (
      select d.closer_rep_id as rep_id, count(*) as n, coalesce(sum(d.total_contract_value_minor), 0) as tcv
      from sales.deal d
      where d.is_demo = ${demo} and d.deal_close_date >= (now() - make_interval(days => ${days}))::date
      group by d.closer_rep_id),
    cash as (
      select p.rep_id, coalesce(sum(p.amount_minor), 0) as collected
      from finance.successful_payment p
      where p.is_demo = ${demo} and p.type <> 'booking_25'
        and p.occurred_at >= now() - make_interval(days => ${days})
      group by p.rep_id),
    tier as (
      -- rolling 14d close rate decides the tier (10% base / 15% at 33.3%+)
      select c.rep_id,
        count(*) filter (where c.disposition = 'closed')::numeric / nullif(count(*), 0) as close_rate_14d
      from sales.call c join sales.appointment a on a.call_id = c.id and a.status = 'taken'
      where c.is_demo = ${demo} and c.type = 'strategy' and a.scheduled_for >= now() - interval '14 days'
      group by c.rep_id)
    select rep.id, rep.full_name, rep.role,
      coalesce(t.n, 0) as taken, coalesce(w.n, 0) as closed, coalesce(w.tcv, 0) as tcv_minor,
      coalesce(ch.collected, 0) as cash_minor,
      coalesce(tr.close_rate_14d, 0) as close_rate_14d,
      case when coalesce(tr.close_rate_14d, 0) >= 0.333 then 0.15 else 0.10 end as commission_rate,
      (coalesce(ch.collected, 0) * case when coalesce(tr.close_rate_14d, 0) >= 0.333 then 0.15 else 0.10 end)::bigint as est_commission_minor
    from sales.rep rep
    left join taken t on t.rep_id = rep.id
    left join won w on w.rep_id = rep.id
    left join cash ch on ch.rep_id = rep.id
    left join tier tr on tr.rep_id = rep.id
    where rep.active and rep.role in ('closer','hybrid','setter')
      and (coalesce(t.n,0) + coalesce(w.n,0) + coalesce(ch.collected,0)) > 0
    order by cash_minor desc`;
}

export async function campaignTable({ demo, days }: Omit<Params, "tz">) {
  return sql`
    select s.campaign_name, sum(s.spend_minor) as spend_minor, sum(s.leads) as meta_leads,
           sum(s.clicks) as clicks, sum(s.impressions) as impressions,
           (sum(s.spend_minor)::numeric / nullif(sum(s.leads), 0))::bigint as cpl_minor
    from marketing.ad_spend s
    where s.is_demo = ${demo} and s.date >= current_date - ${days}::int
    group by s.campaign_name order by spend_minor desc`;
}

export async function objectionBreakdown({ demo, days }: Omit<Params, "tz">) {
  return sql`
    select ot.name, count(*) as n, count(*) filter (where ob.led_to_loss) as led_to_loss
    from sales.objection ob
    join core.objection_type ot on ot.id = ob.objection_type_id
    join sales.call c on c.id = ob.strategy_call_id
    where c.is_demo = ${demo} and c.created_at >= now() - make_interval(days => ${days})
    group by ot.name order by n desc`;
}
