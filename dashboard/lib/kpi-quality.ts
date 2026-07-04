import { sql } from "./db";

// Quality / compliance KPIs: disqualification rates, onboarding completion,
// collection rate, and call-report submission compliance. Same conventions as
// lib/kpi.ts: every query filters is_demo, money is integer minor units, dates
// bucket in the report timezone (ET default). Additive module: lib/kpi.ts and
// lib/kpi-closer.ts stay untouched.
//
// Schema notes (verified against the write path in lib/forms.ts):
//   - DQ reasons live ONLY on sales.opportunity.dq_reason_id. There is no
//     sales.call.dq_reason_id, so DQ reasons are always joined through the
//     opportunity, never the call.
//   - dq_stage is 'setting' (before/at a call was booked) or 'closing' (on the
//     strategy call). A closing DQ also sets sales.call.disposition='dq_on_call'.

type RangeParams = { demo: boolean; days: number };

export type DqRates = {
  closingDqd: number;      // strategy calls disqualified on the call, in range
  taken: number;           // strategy calls taken, in range (closing denominator)
  settingDqd: number;      // opportunities disqualified before a call, in range
  totalOpps: number;       // opportunities opened in range (setting denominator)
};

/** DQ rate at setting and DQ rate at closing, one query.
 *  Closing DQ = taken strategy calls whose disposition is dq_on_call, over all
 *  taken strategy calls (by event start time). Setting DQ = opportunities whose
 *  dq_stage is 'setting', over all opportunities opened in range. */
export async function dqRates({ demo, days }: RangeParams): Promise<DqRates> {
  const [r] = await sql`
    with rng as (select now() - make_interval(days => ${days}) as since)
    select
      (select count(*) from sales.call c, rng
        where c.is_demo = ${demo} and c.type = 'strategy' and c.occurred_at is not null
          and c.disposition = 'dq_on_call' and c.occurred_at >= rng.since) as closing_dqd,
      (select count(*) from sales.appointment a, rng
        where a.is_demo = ${demo} and a.status = 'taken' and a.scheduled_for >= rng.since) as taken,
      (select count(*) from sales.opportunity o, rng
        where o.is_demo = ${demo} and o.dq_stage = 'setting'
          and o.opened_at >= rng.since) as setting_dqd,
      (select count(*) from sales.opportunity o, rng
        where o.is_demo = ${demo} and o.opened_at >= rng.since) as total_opps`;
  return {
    closingDqd: Number(r.closing_dqd),
    taken: Number(r.taken),
    settingDqd: Number(r.setting_dqd),
    totalOpps: Number(r.total_opps),
  };
}

/** Top disqualification reasons, split by the stage they were DQ'd at.
 *  Reasons come off sales.opportunity.dq_reason_id (the only place they exist),
 *  joined to core.dq_reason. Opportunities DQ'd without a reason recorded fall
 *  under "No reason recorded". Returns one row per (stage, reason); the page
 *  splits by `stage`. */
export async function dqReasons({ demo, days }: RangeParams): Promise<
  { stage: string; reason: string; n: number }[]
> {
  return sql`
    select o.dq_stage as stage,
           coalesce(dr.name, 'No reason recorded') as reason,
           count(*) as n
    from sales.opportunity o
    left join core.dq_reason dr on dr.id = o.dq_reason_id
    where o.is_demo = ${demo}
      and o.dq_stage in ('setting', 'closing')
      and o.closed_at >= now() - make_interval(days => ${days})
    group by o.dq_stage, coalesce(dr.name, 'No reason recorded')
    order by n desc`;
}

export type OnboardingCollection = {
  onboardingComplete: number;   // fulfilment records with onboarding done
  onboardingTotal: number;      // fulfilment records total (won deals needing onboarding)
  collectedMinor: number;       // paid receivables on current plan versions
  contractedMinor: number;      // all receivables on current plan versions
};

/** Onboarding completion and collection rate, one query.
 *  Onboarding = delivery.fulfilment rows: completed (onboarding_complete) over
 *  all fulfilment records (every won deal gets one, so total = deals needing
 *  onboarding). Collection = paid receivable amount over all receivable amount
 *  on current plan versions (contracted). Both are simple aggregates with no
 *  per-row fan-out, so they are safe to combine. */
export async function onboardingAndCollection(demo: boolean): Promise<OnboardingCollection> {
  const [r] = await sql`
    select
      (select count(*) from delivery.fulfilment f
        where f.is_demo = ${demo} and f.onboarding_complete) as onboarding_complete,
      (select count(*) from delivery.fulfilment f
        where f.is_demo = ${demo}) as onboarding_total,
      (select coalesce(sum(r.amount_minor), 0) from finance.receivable r
        where r.is_demo = ${demo} and r.status = 'paid'
          and exists (select 1 from finance.payment_plan pp
                      where pp.id = r.payment_plan_id and pp.is_current)) as collected_minor,
      (select coalesce(sum(r.amount_minor), 0) from finance.receivable r
        where r.is_demo = ${demo}
          and exists (select 1 from finance.payment_plan pp
                      where pp.id = r.payment_plan_id and pp.is_current)) as contracted_minor`;
  return {
    onboardingComplete: Number(r.onboarding_complete),
    onboardingTotal: Number(r.onboarding_total),
    collectedMinor: Number(r.collected_minor),
    contractedMinor: Number(r.contracted_minor),
  };
}

/** Call-report submission compliance per closer, over the range.
 *  Denominator = taken strategy calls attributed to the closer (rep_id on the
 *  call), by event start time. Numerator = those taken calls whose Sales Call
 *  Report was filed on time (a validated 'sales_call' submission with on_time).
 *  Missing = taken calls with no validated 'sales_call' submission at all.
 *  Only closers/hybrids with at least one taken call in range are returned. */
export async function reportCompliance({ demo, days }: RangeParams): Promise<
  { rep_id: string; full_name: string; taken: number; on_time: number; missing: number; on_time_rate: number | null }[]
> {
  return sql`
    with taken_calls as (
      select c.id as call_id, c.rep_id
      from sales.call c
      join sales.appointment a on a.call_id = c.id and a.status = 'taken'
      where c.is_demo = ${demo} and c.type = 'strategy'
        and a.scheduled_for >= now() - make_interval(days => ${days})
    ),
    graded as (
      select tc.rep_id, tc.call_id,
        exists (select 1 from sales.report_submission rs
                where rs.strategy_call_id = tc.call_id
                  and rs.type = 'sales_call' and rs.status = 'validated') as has_report,
        exists (select 1 from sales.report_submission rs
                where rs.strategy_call_id = tc.call_id
                  and rs.type = 'sales_call' and rs.status = 'validated' and rs.on_time) as on_time
      from taken_calls tc
    )
    select rep.id as rep_id, rep.full_name,
      count(g.call_id) as taken,
      count(*) filter (where g.on_time) as on_time,
      count(*) filter (where not g.has_report) as missing,
      count(*) filter (where g.on_time)::numeric / nullif(count(g.call_id), 0) as on_time_rate
    from sales.rep rep
    join graded g on g.rep_id = rep.id
    where rep.active and rep.role in ('closer','hybrid')
    group by rep.id, rep.full_name
    order by count(g.call_id) desc, rep.full_name asc`;
}
