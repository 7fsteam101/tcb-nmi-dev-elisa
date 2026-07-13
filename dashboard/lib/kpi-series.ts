import { sql } from "./db";

/**
 * Percent change from previous to current (e.g. 12.5 = up 12.5%).
 * Null when there is no baseline (previous period was 0) — render as "flat".
 */
export function deltaPct(current: number, previous: number): number | null {
  if (previous === 0 || !Number.isFinite(previous) || !Number.isFinite(current)) return null;
  return ((current - previous) / previous) * 100;
}

type Params = { demo: boolean; days: number; tz: string; prevSince?: string; prevUpto?: string };

/**
 * Same aggregate shape as overviewKpis (lib/kpi.ts) but over the PREVIOUS
 * window: now()-2*days .. now()-days (or explicit prevSince..prevUpto for a
 * custom range). Every subquery mirrors overviewKpis's filters exactly
 * (counts_as_unique, is_booking, is_duplicate, refunded-deal and booking_25
 * exclusions) with the shifted range — keep the two functions in sync.
 */
export async function overviewComparison({ demo, days, prevSince, prevUpto }: Params) {
  const [row] = await sql`
    with range as (
      select coalesce(${prevSince ?? null}::timestamptz, now() - make_interval(days => ${days * 2})) as since,
             coalesce(${prevUpto ?? null}::timestamptz, now() - make_interval(days => ${days})) as upto
    )
    select
      (select count(*) from sales.opt_in o, range r
        where o.is_demo = ${demo} and o.submitted_at >= r.since and o.submitted_at < r.upto
          and o.counts_as_unique and o.counted) as leads,
      (select count(*) from sales.call c, range r
        where c.is_demo = ${demo} and c.type = 'strategy' and c.is_primary and c.is_booking
          and not coalesce(c.is_duplicate, false)
          and coalesce(c.current_scheduled_at, c.scheduled_at) >= r.since
          and coalesce(c.current_scheduled_at, c.scheduled_at) < r.upto) as booked,
      (select count(*) from sales.appointment a, range r
        where a.is_demo = ${demo} and a.status = 'taken'
          and a.scheduled_for >= r.since and a.scheduled_for < r.upto) as taken,
      (select count(*) from sales.appointment a, range r
        where a.is_demo = ${demo} and a.status = 'no_show'
          and a.scheduled_for >= r.since and a.scheduled_for < r.upto) as no_shows,
      (select count(*) from sales.deal d, range r
        where d.is_demo = ${demo} and d.deal_close_date >= r.since::date
          and d.deal_close_date < r.upto::date and d.status <> 'refunded') as deals_won,
      (select coalesce(sum(d.total_contract_value_minor), 0) from sales.deal d, range r
        where d.is_demo = ${demo} and d.deal_close_date >= r.since::date
          and d.deal_close_date < r.upto::date and d.status <> 'refunded') as booked_revenue_minor,
      (select coalesce(sum(p.amount_minor), 0) from finance.successful_payment p, range r
        where p.is_demo = ${demo} and p.type <> 'booking_25'
          and p.occurred_at >= r.since and p.occurred_at < r.upto) as cash_collected_minor,
      (select coalesce(sum(v.amount_minor), 0) from finance.reversal v, range r
        where v.is_demo = ${demo} and v.occurred_at >= r.since and v.occurred_at < r.upto) as reversals_minor,
      (select coalesce(sum(s.spend_minor), 0) from marketing.ad_spend s, range r
        where s.is_demo = ${demo} and s.date >= r.since::date and s.date < r.upto::date) as ad_spend_minor,
      (select count(*) from sales.appointment a, range r
        where a.is_demo = ${demo} and a.status = 'rescheduled'
          and a.rescheduled_at >= r.since and a.rescheduled_at < r.upto) as reschedules,
      (select count(*) from sales.appointment a, range r
        where a.is_demo = ${demo} and a.status in ('cancelled_by_lead','cancelled_by_team')
          and a.scheduled_for >= r.since and a.scheduled_for < r.upto) as cancellations
  `;
  return row;
}
