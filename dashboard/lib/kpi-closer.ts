import { sql } from "./db";

// Closer-analytics / revenue / weekly-snapshot queries. Same conventions as
// lib/kpi.ts: every query filters is_demo, money is integer minor units, dates
// bucket in the report timezone. This module is additive — lib/kpi.ts untouched.

type RangeParams = { demo: boolean; days: number };
type TzRangeParams = RangeParams & { tz: string };

export type PeriodTotals = {
  booked: number;
  onCalendar: number;
  taken: number;
  noShows: number;
  won: number;
  invoicedMinor: number;
  cashMinor: number;
  refundsMinor: number;
};

/** Per active closer/hybrid rep, over the range: volume, conversion, cash and
 *  the commission tier (10% base / 15% while trailing-14d close rate >= 33.3%).
 *  Zero-activity reps are included so the leaderboard can mute them. */
export async function closerAnalytics({ demo, days }: RangeParams) {
  return sql`
    with taken as (
      select c.rep_id, count(*) as n
      from sales.call c join sales.appointment a on a.call_id = c.id and a.status = 'taken'
      where c.is_demo = ${demo} and c.type = 'strategy'
        and a.scheduled_for >= now() - make_interval(days => ${days})
      group by c.rep_id),
    oncal as (
      -- live calendar volume: the booking's CURRENT slot landing in range, any status
      select c.rep_id, count(*) as n
      from sales.call c join sales.appointment a on a.call_id = c.id and a.is_current
      where c.is_demo = ${demo} and c.type = 'strategy'
        and a.scheduled_for >= now() - make_interval(days => ${days})
      group by c.rep_id),
    noshow as (
      select c.rep_id, count(*) as n
      from sales.call c join sales.appointment a on a.call_id = c.id and a.status = 'no_show'
      where c.is_demo = ${demo} and c.type = 'strategy'
        and a.scheduled_for >= now() - make_interval(days => ${days})
      group by c.rep_id),
    won as (
      select d.closer_rep_id as rep_id, count(*) as n,
             coalesce(sum(d.total_contract_value_minor), 0) as tcv
      from sales.deal d
      where d.is_demo = ${demo} and d.status <> 'refunded'
        and d.deal_close_date >= (now() - make_interval(days => ${days}))::date
      group by d.closer_rep_id),
    cash as (
      select p.rep_id, coalesce(sum(p.amount_minor), 0) as collected
      from finance.successful_payment p
      where p.is_demo = ${demo} and p.type <> 'booking_25'
        and p.occurred_at >= now() - make_interval(days => ${days})
      group by p.rep_id),
    tier as (
      -- trailing 14d close rate (closed dispositions / taken calls) decides the tier
      select c.rep_id,
        count(*) filter (where c.disposition = 'closed')::numeric / nullif(count(*), 0) as close_rate_14d
      from sales.call c join sales.appointment a on a.call_id = c.id and a.status = 'taken'
      where c.is_demo = ${demo} and c.type = 'strategy' and a.scheduled_for >= now() - interval '14 days'
      group by c.rep_id)
    select rep.id, rep.full_name, rep.role,
      coalesce(t.n, 0) as taken,
      coalesce(oc.n, 0) as on_calendar,
      coalesce(w.n, 0) as won,
      coalesce(w.tcv, 0) as tcv_minor,
      coalesce(ch.collected, 0) as cash_minor,
      coalesce(w.n, 0)::numeric / nullif(coalesce(t.n, 0), 0) as close_rate,
      coalesce(t.n, 0)::numeric / nullif(coalesce(t.n, 0) + coalesce(ns.n, 0), 0) as show_rate,
      coalesce(ch.collected, 0)::numeric / nullif(coalesce(t.n, 0), 0) as cash_per_taken_minor,
      coalesce(w.tcv, 0)::numeric / nullif(coalesce(w.n, 0), 0) as aov_minor,
      coalesce(tr.close_rate_14d, 0) as close_rate_14d,
      case when coalesce(tr.close_rate_14d, 0) >= 0.333 then 0.15 else 0.10 end as commission_rate,
      (coalesce(ch.collected, 0) * case when coalesce(tr.close_rate_14d, 0) >= 0.333 then 0.15 else 0.10 end)::bigint as est_commission_minor
    from sales.rep rep
    left join taken t on t.rep_id = rep.id
    left join oncal oc on oc.rep_id = rep.id
    left join noshow ns on ns.rep_id = rep.id
    left join won w on w.rep_id = rep.id
    left join cash ch on ch.rep_id = rep.id
    left join tier tr on tr.rep_id = rep.id
    where rep.active and rep.role in ('closer','hybrid')
    order by coalesce(ch.collected, 0) desc, coalesce(t.n, 0) desc, rep.full_name asc`;
}

/** Team-wide totals for the current window vs the immediately-preceding window
 *  of the same length. Both windows are bounded on both sides so deltas compare
 *  like with like. */
export async function overviewComparison({ demo, days }: RangeParams): Promise<{ current: PeriodTotals; previous: PeriodTotals }> {
  const [r] = await sql`
    with w as (
      select now() - make_interval(days => ${days}) as cur_start,
             now() - make_interval(days => ${days * 2}) as prev_start,
             now() as cur_end
    )
    select
      (select count(*) from sales.call c, w where c.is_demo = ${demo} and c.type = 'strategy' and c.is_primary and c.is_booking
        and not coalesce(c.is_duplicate, false)
        and coalesce(c.current_scheduled_at, c.scheduled_at) >= w.cur_start
        and coalesce(c.current_scheduled_at, c.scheduled_at) < w.cur_end) as booked_cur,
      (select count(*) from sales.call c, w where c.is_demo = ${demo} and c.type = 'strategy' and c.is_primary and c.is_booking
        and not coalesce(c.is_duplicate, false)
        and coalesce(c.current_scheduled_at, c.scheduled_at) >= w.prev_start
        and coalesce(c.current_scheduled_at, c.scheduled_at) < w.cur_start) as booked_prev,
      (select count(*) from sales.call c join sales.appointment a on a.call_id = c.id and a.is_current, w
        where c.is_demo = ${demo} and c.type = 'strategy'
        and a.scheduled_for >= w.cur_start and a.scheduled_for < w.cur_end) as on_calendar_cur,
      (select count(*) from sales.call c join sales.appointment a on a.call_id = c.id and a.is_current, w
        where c.is_demo = ${demo} and c.type = 'strategy'
        and a.scheduled_for >= w.prev_start and a.scheduled_for < w.cur_start) as on_calendar_prev,
      (select count(*) from sales.call c join sales.appointment a on a.call_id = c.id and a.status = 'taken', w
        where c.is_demo = ${demo} and c.type = 'strategy'
        and a.scheduled_for >= w.cur_start and a.scheduled_for < w.cur_end) as taken_cur,
      (select count(*) from sales.call c join sales.appointment a on a.call_id = c.id and a.status = 'taken', w
        where c.is_demo = ${demo} and c.type = 'strategy'
        and a.scheduled_for >= w.prev_start and a.scheduled_for < w.cur_start) as taken_prev,
      (select count(*) from sales.call c join sales.appointment a on a.call_id = c.id and a.status = 'no_show', w
        where c.is_demo = ${demo} and c.type = 'strategy'
        and a.scheduled_for >= w.cur_start and a.scheduled_for < w.cur_end) as no_shows_cur,
      (select count(*) from sales.call c join sales.appointment a on a.call_id = c.id and a.status = 'no_show', w
        where c.is_demo = ${demo} and c.type = 'strategy'
        and a.scheduled_for >= w.prev_start and a.scheduled_for < w.cur_start) as no_shows_prev,
      (select count(*) from sales.deal d, w where d.is_demo = ${demo} and d.status <> 'refunded'
        and d.deal_close_date >= w.cur_start::date and d.deal_close_date <= w.cur_end::date) as won_cur,
      (select count(*) from sales.deal d, w where d.is_demo = ${demo} and d.status <> 'refunded'
        and d.deal_close_date >= w.prev_start::date and d.deal_close_date < w.cur_start::date) as won_prev,
      (select coalesce(sum(d.total_contract_value_minor), 0) from sales.deal d, w where d.is_demo = ${demo} and d.status <> 'refunded'
        and d.deal_close_date >= w.cur_start::date and d.deal_close_date <= w.cur_end::date) as invoiced_cur,
      (select coalesce(sum(d.total_contract_value_minor), 0) from sales.deal d, w where d.is_demo = ${demo} and d.status <> 'refunded'
        and d.deal_close_date >= w.prev_start::date and d.deal_close_date < w.cur_start::date) as invoiced_prev,
      (select coalesce(sum(p.amount_minor), 0) from finance.successful_payment p, w where p.is_demo = ${demo} and p.type <> 'booking_25'
        and p.occurred_at >= w.cur_start and p.occurred_at < w.cur_end) as cash_cur,
      (select coalesce(sum(p.amount_minor), 0) from finance.successful_payment p, w where p.is_demo = ${demo} and p.type <> 'booking_25'
        and p.occurred_at >= w.prev_start and p.occurred_at < w.cur_start) as cash_prev,
      (select coalesce(sum(v.amount_minor), 0) from finance.reversal v, w where v.is_demo = ${demo}
        and v.occurred_at >= w.cur_start and v.occurred_at < w.cur_end) as refunds_cur,
      (select coalesce(sum(v.amount_minor), 0) from finance.reversal v, w where v.is_demo = ${demo}
        and v.occurred_at >= w.prev_start and v.occurred_at < w.cur_start) as refunds_prev`;
  const shape = (sfx: "cur" | "prev"): PeriodTotals => ({
    booked: Number(r[`booked_${sfx}`]),
    onCalendar: Number(r[`on_calendar_${sfx}`]),
    taken: Number(r[`taken_${sfx}`]),
    noShows: Number(r[`no_shows_${sfx}`]),
    won: Number(r[`won_${sfx}`]),
    invoicedMinor: Number(r[`invoiced_${sfx}`]),
    cashMinor: Number(r[`cash_${sfx}`]),
    refundsMinor: Number(r[`refunds_${sfx}`]),
  });
  return { current: shape("cur"), previous: shape("prev") };
}

/** Cash collected per day (program payments, no $25 booking fees) for the
 *  current period, aligned index-by-index with the same day of the previous
 *  period (day minus `days`). */
export async function dailyCashSeries({ demo, days, tz }: TzRangeParams) {
  return sql`
    with d as (select generate_series(0, ${days - 1}) as i)
    select (current_date - ${days - 1}::int + d.i) as day,
      (select coalesce(sum(p.amount_minor), 0) from finance.successful_payment p
        where p.is_demo = ${demo} and p.type <> 'booking_25'
          and (p.occurred_at at time zone ${tz})::date = current_date - ${days - 1}::int + d.i) as current_minor,
      (select coalesce(sum(p.amount_minor), 0) from finance.successful_payment p
        where p.is_demo = ${demo} and p.type <> 'booking_25'
          and (p.occurred_at at time zone ${tz})::date = current_date - ${days - 1}::int + d.i - ${days}::int) as previous_minor
    from d order by d.i`;
}

/** Per-day activity arrays for the spark charts on the closer/revenue pages:
 *  bookings, live calendar slots, taken, no-shows, deals won, invoiced TCV,
 *  cash collected, refunds. Current period only. */
export async function dailyCloserSeries({ demo, days, tz }: TzRangeParams) {
  return sql`
    with d as (
      select generate_series(current_date - ${days - 1}::int, current_date, interval '1 day')::date as day
    )
    select d.day,
      (select count(*) from sales.call c where c.is_demo = ${demo} and c.type = 'strategy' and c.is_primary
        and c.is_booking and not coalesce(c.is_duplicate, false)
        and (coalesce(c.current_scheduled_at, c.scheduled_at) at time zone ${tz})::date = d.day) as booked,
      (select count(*) from sales.call c join sales.appointment a on a.call_id = c.id and a.is_current
        where c.is_demo = ${demo} and c.type = 'strategy'
        and (a.scheduled_for at time zone ${tz})::date = d.day) as on_calendar,
      (select count(*) from sales.call c join sales.appointment a on a.call_id = c.id and a.status = 'taken'
        where c.is_demo = ${demo} and c.type = 'strategy'
        and (a.scheduled_for at time zone ${tz})::date = d.day) as taken,
      (select count(*) from sales.call c join sales.appointment a on a.call_id = c.id and a.status = 'no_show'
        where c.is_demo = ${demo} and c.type = 'strategy'
        and (a.scheduled_for at time zone ${tz})::date = d.day) as no_shows,
      (select count(*) from sales.deal x where x.is_demo = ${demo} and x.status <> 'refunded'
        and x.deal_close_date = d.day) as won,
      (select coalesce(sum(x.total_contract_value_minor), 0) from sales.deal x where x.is_demo = ${demo}
        and x.status <> 'refunded' and x.deal_close_date = d.day) as invoiced_minor,
      (select coalesce(sum(p.amount_minor), 0) from finance.successful_payment p where p.is_demo = ${demo}
        and p.type <> 'booking_25' and (p.occurred_at at time zone ${tz})::date = d.day) as cash_minor,
      (select coalesce(sum(v.amount_minor), 0) from finance.reversal v where v.is_demo = ${demo}
        and (v.occurred_at at time zone ${tz})::date = d.day) as refunds_minor
    from d order by d.day`;
}

/** Monthly revenue view, oldest month first, zero rows included:
 *  invoiced = TCV of deals by close month (refunded deals excluded),
 *  cash = program payments (no $25 fees), refunds = all reversals. */
export async function revenueByMonth(demo: boolean, months = 12, tz = "America/New_York") {
  return sql`
    with m as (
      select generate_series(
        date_trunc('month', current_date) - make_interval(months => ${months - 1}),
        date_trunc('month', current_date),
        interval '1 month')::date as month
    )
    select m.month,
      (select coalesce(sum(d.total_contract_value_minor), 0) from sales.deal d
        where d.is_demo = ${demo} and d.status <> 'refunded'
          and date_trunc('month', d.deal_close_date)::date = m.month) as invoiced_minor,
      (select coalesce(sum(p.amount_minor), 0) from finance.successful_payment p
        where p.is_demo = ${demo} and p.type <> 'booking_25'
          and date_trunc('month', p.occurred_at at time zone ${tz})::date = m.month) as cash_minor,
      (select coalesce(sum(v.amount_minor), 0) from finance.reversal v
        where v.is_demo = ${demo}
          and date_trunc('month', v.occurred_at at time zone ${tz})::date = m.month) as refunds_minor
    from m order by m.month`;
}

/** PIF vs payment-plan split of deals won in range (refunded excluded).
 *  Multi-pay = every plan type that is not pif (3/6/7/12/13pay, zero_down).
 *  `total` includes deals with no plan snapshot recorded yet, so the page can
 *  tell "no deals" apart from "deals without plan data". */
export async function planSplit({ demo, days }: RangeParams): Promise<{ pif: number; multi: number; total: number }> {
  const [r] = await sql`
    select
      count(*) filter (where d.plan_type_snapshot = 'pif') as pif,
      count(*) filter (where d.plan_type_snapshot <> 'pif') as multi,
      count(*) as total
    from sales.deal d
    where d.is_demo = ${demo} and d.status <> 'refunded'
      and d.deal_close_date >= (now() - make_interval(days => ${days}))::date`;
  return { pif: Number(r.pif), multi: Number(r.multi), total: Number(r.total) };
}

/** Scheduled receivables on current plan versions, grouped by due month for the
 *  next 12 calendar months (current month first). Zero months included. */
export async function installmentStack(demo: boolean) {
  return sql`
    with m as (
      select generate_series(
        date_trunc('month', current_date),
        date_trunc('month', current_date) + interval '11 months',
        interval '1 month')::date as month
    )
    select m.month,
      (select count(*) from finance.receivable r
        where r.is_demo = ${demo} and r.status = 'scheduled'
          and date_trunc('month', r.due_date)::date = m.month
          and exists (select 1 from finance.payment_plan pp where pp.id = r.payment_plan_id and pp.is_current)) as installments,
      (select coalesce(sum(r.amount_minor), 0) from finance.receivable r
        where r.is_demo = ${demo} and r.status = 'scheduled'
          and date_trunc('month', r.due_date)::date = m.month
          and exists (select 1 from finance.payment_plan pp where pp.id = r.payment_plan_id and pp.is_current)) as amount_minor
    from m order by m.month`;
}

/** Estimated commission owed per active closer/hybrid over the range:
 *  cash collected x current tier rate, minus a 10% clawback on cash collected
 *  against deals that are now refunded. Estimate only — payroll runs off
 *  validated commission reports. */
export async function commissionOwed({ demo, days }: RangeParams) {
  return sql`
    with cash as (
      select p.rep_id, coalesce(sum(p.amount_minor), 0) as collected
      from finance.successful_payment p
      where p.is_demo = ${demo} and p.type <> 'booking_25'
        and p.occurred_at >= now() - make_interval(days => ${days})
      group by p.rep_id),
    refunded as (
      select p.rep_id, coalesce(sum(p.amount_minor), 0) as refunded_cash
      from finance.successful_payment p
      join sales.deal d on d.id = p.deal_id and d.status = 'refunded'
      where p.is_demo = ${demo} and p.type <> 'booking_25'
        and p.occurred_at >= now() - make_interval(days => ${days})
      group by p.rep_id),
    tier as (
      select c.rep_id,
        count(*) filter (where c.disposition = 'closed')::numeric / nullif(count(*), 0) as close_rate_14d
      from sales.call c join sales.appointment a on a.call_id = c.id and a.status = 'taken'
      where c.is_demo = ${demo} and c.type = 'strategy' and a.scheduled_for >= now() - interval '14 days'
      group by c.rep_id)
    select rep.id, rep.full_name,
      coalesce(ch.collected, 0) as cash_minor,
      coalesce(rf.refunded_cash, 0) as refunded_cash_minor,
      coalesce(tr.close_rate_14d, 0) as close_rate_14d,
      case when coalesce(tr.close_rate_14d, 0) >= 0.333 then 0.15 else 0.10 end as commission_rate,
      (coalesce(ch.collected, 0) * case when coalesce(tr.close_rate_14d, 0) >= 0.333 then 0.15 else 0.10 end
        - coalesce(rf.refunded_cash, 0) * 0.10)::bigint as owed_minor
    from sales.rep rep
    left join cash ch on ch.rep_id = rep.id
    left join refunded rf on rf.rep_id = rep.id
    left join tier tr on tr.rep_id = rep.id
    where rep.active and rep.role in ('closer','hybrid')
    order by coalesce(ch.collected, 0) desc, rep.full_name asc`;
}

export type WeekTotals = {
  leads: number;
  bookings: number;
  taken: number;
  closed: number;
  invoicedMinor: number;
  cashMinor: number;
};

/** Current ISO week (Monday start, report timezone) vs the previous week.
 *  Bookings count on the current-slot date; deals by close date. */
export async function weeklySnapshot({ demo, tz }: { demo: boolean; tz: string }): Promise<{ weekStart: string; current: WeekTotals; previous: WeekTotals }> {
  const [r] = await sql`
    with wk as (select date_trunc('week', (now() at time zone ${tz}))::date as start)
    select wk.start::text as week_start,
      (select count(*) from sales.opt_in o where o.is_demo = ${demo} and o.counts_as_unique and o.counted
        and (o.submitted_at at time zone ${tz})::date >= wk.start
        and (o.submitted_at at time zone ${tz})::date < wk.start + 7) as leads_cur,
      (select count(*) from sales.opt_in o where o.is_demo = ${demo} and o.counts_as_unique and o.counted
        and (o.submitted_at at time zone ${tz})::date >= wk.start - 7
        and (o.submitted_at at time zone ${tz})::date < wk.start) as leads_prev,
      (select count(*) from sales.call c where c.is_demo = ${demo} and c.type = 'strategy' and c.is_primary and c.is_booking
        and not coalesce(c.is_duplicate, false)
        and (coalesce(c.current_scheduled_at, c.scheduled_at) at time zone ${tz})::date >= wk.start
        and (coalesce(c.current_scheduled_at, c.scheduled_at) at time zone ${tz})::date < wk.start + 7) as bookings_cur,
      (select count(*) from sales.call c where c.is_demo = ${demo} and c.type = 'strategy' and c.is_primary and c.is_booking
        and not coalesce(c.is_duplicate, false)
        and (coalesce(c.current_scheduled_at, c.scheduled_at) at time zone ${tz})::date >= wk.start - 7
        and (coalesce(c.current_scheduled_at, c.scheduled_at) at time zone ${tz})::date < wk.start) as bookings_prev,
      (select count(*) from sales.call c join sales.appointment a on a.call_id = c.id and a.status = 'taken'
        where c.is_demo = ${demo} and c.type = 'strategy'
        and (a.scheduled_for at time zone ${tz})::date >= wk.start
        and (a.scheduled_for at time zone ${tz})::date < wk.start + 7) as taken_cur,
      (select count(*) from sales.call c join sales.appointment a on a.call_id = c.id and a.status = 'taken'
        where c.is_demo = ${demo} and c.type = 'strategy'
        and (a.scheduled_for at time zone ${tz})::date >= wk.start - 7
        and (a.scheduled_for at time zone ${tz})::date < wk.start) as taken_prev,
      (select count(*) from sales.deal d where d.is_demo = ${demo} and d.status <> 'refunded'
        and d.deal_close_date >= wk.start and d.deal_close_date < wk.start + 7) as closed_cur,
      (select count(*) from sales.deal d where d.is_demo = ${demo} and d.status <> 'refunded'
        and d.deal_close_date >= wk.start - 7 and d.deal_close_date < wk.start) as closed_prev,
      (select coalesce(sum(d.total_contract_value_minor), 0) from sales.deal d where d.is_demo = ${demo} and d.status <> 'refunded'
        and d.deal_close_date >= wk.start and d.deal_close_date < wk.start + 7) as invoiced_cur,
      (select coalesce(sum(d.total_contract_value_minor), 0) from sales.deal d where d.is_demo = ${demo} and d.status <> 'refunded'
        and d.deal_close_date >= wk.start - 7 and d.deal_close_date < wk.start) as invoiced_prev,
      (select coalesce(sum(p.amount_minor), 0) from finance.successful_payment p where p.is_demo = ${demo} and p.type <> 'booking_25'
        and (p.occurred_at at time zone ${tz})::date >= wk.start
        and (p.occurred_at at time zone ${tz})::date < wk.start + 7) as cash_cur,
      (select coalesce(sum(p.amount_minor), 0) from finance.successful_payment p where p.is_demo = ${demo} and p.type <> 'booking_25'
        and (p.occurred_at at time zone ${tz})::date >= wk.start - 7
        and (p.occurred_at at time zone ${tz})::date < wk.start) as cash_prev
    from wk`;
  const shape = (sfx: "cur" | "prev"): WeekTotals => ({
    leads: Number(r[`leads_${sfx}`]),
    bookings: Number(r[`bookings_${sfx}`]),
    taken: Number(r[`taken_${sfx}`]),
    closed: Number(r[`closed_${sfx}`]),
    invoicedMinor: Number(r[`invoiced_${sfx}`]),
    cashMinor: Number(r[`cash_${sfx}`]),
  });
  return { weekStart: String(r.week_start), current: shape("cur"), previous: shape("prev") };
}

/** Contracted money still to collect: scheduled + late + delinquent receivables
 *  on current plan versions of ACTIVE deals. */
export async function pipelineValue(demo: boolean): Promise<number> {
  const [r] = await sql`
    select coalesce(sum(r.amount_minor), 0) as pipeline_minor
    from finance.receivable r
    join finance.payment_plan pp on pp.id = r.payment_plan_id and pp.is_current
    join sales.deal d on d.id = r.deal_id and d.status = 'active'
    where r.is_demo = ${demo} and r.status in ('scheduled','late','delinquent')`;
  return Number(r.pipeline_minor);
}

/** Projected 30-day cash: scheduled receivables on current plan versions with a
 *  due date within the next 30 days. Matches the Receivables "next 30 days" tile. */
export async function projected30d(demo: boolean): Promise<number> {
  const [r] = await sql`
    select coalesce(sum(r.amount_minor), 0) as projected_minor
    from finance.receivable r
    join finance.payment_plan pp on pp.id = r.payment_plan_id and pp.is_current
    where r.is_demo = ${demo} and r.status = 'scheduled' and r.due_date <= current_date + 30`;
  return Number(r.projected_minor);
}
