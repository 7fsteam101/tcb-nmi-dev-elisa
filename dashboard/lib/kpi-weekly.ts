import { sql } from "./db";

// Weekly-snapshot analytics: period-bucketed series for the bar charts and the
// reason-comparison grouped bars. Same conventions as lib/kpi.ts and
// lib/kpi-closer.ts: every query filters is_demo, money is integer minor units,
// dates bucket in the report timezone. This module is additive.
//
// `grain` is always one of day/week/month. It is validated to that literal set
// before it reaches SQL, then passed as a TEXT parameter to date_trunc() and
// the interval builder (never interpolated as an identifier), so there is no
// injection surface. Buckets come from generate_series over date_trunc(grain,
// ...), so day, week, and month all share one code path.

export type Grain = "day" | "week" | "month";
export type ReasonKind = "cancellation" | "reschedule";

/** Coerce arbitrary input to a safe grain literal (default week). */
export function asGrain(v: string | undefined | null): Grain {
  return v === "day" || v === "month" ? v : "week";
}

const GRAIN_LABEL: Record<Grain, Intl.DateTimeFormatOptions> = {
  day: { month: "short", day: "numeric" },
  week: { month: "short", day: "numeric" },
  month: { month: "short", year: "2-digit" },
};

/** Human label for a bucket start date, keyed to the grain. Buckets are plain
 *  dates already truncated in the report tz, so format in UTC to avoid a shift. */
export function bucketLabel(d: string | Date, grain: Grain): string {
  return new Date(typeof d === "string" ? `${d.slice(0, 10)}T00:00:00Z` : d)
    .toLocaleDateString("en-US", { ...GRAIN_LABEL[grain], timeZone: "UTC" });
}

export type PeriodRow = {
  bucket: string;          // ISO date (bucket start) in the report tz
  bookings: number;
  taken: number;
  no_shows: number;
  deals_won: number;
  cash_minor: number;
  cancellations: number;
  reschedules: number;
  close_rate: number;      // won / taken
  show_rate: number;       // taken / (taken + no_show)
  cancel_rate: number;     // cancellations / bookings
  reschedule_rate: number; // reschedules / bookings
};

type SeriesParams = { demo: boolean; grain: Grain; periods: number; tz: string };

/** The last N period buckets (oldest first), each with volume + derived rates.
 *  Drives the "vs previous periods" bar charts. One row per bucket, including
 *  empty buckets (zero rows) so the axis is stable. */
export async function periodSeries({ demo, grain, periods, tz }: SeriesParams): Promise<PeriodRow[]> {
  const n = Math.min(Math.max(periods, 1), 52);
  const rows = await sql`
    with anchor as (
      select date_trunc(${grain}, (now() at time zone ${tz}))::date as cur
    ),
    buckets as (
      select (a.cur - (g.i || ' ' || ${grain})::interval)::date as bucket_start,
             (a.cur - ((g.i - 1) || ' ' || ${grain})::interval)::date as bucket_end
      from anchor a, generate_series(${n - 1}, 0, -1) as g(i)
    )
    select b.bucket_start::text as bucket,
      (select count(*) from sales.call c
        where c.is_demo = ${demo} and c.type = 'strategy' and c.is_primary and c.is_booking
          and not coalesce(c.is_duplicate, false)
          and (coalesce(c.current_scheduled_at, c.scheduled_at) at time zone ${tz})::date >= b.bucket_start
          and (coalesce(c.current_scheduled_at, c.scheduled_at) at time zone ${tz})::date < b.bucket_end) as bookings,
      (select count(*) from sales.call c join sales.appointment a on a.call_id = c.id and a.status = 'taken'
        where c.is_demo = ${demo} and c.type = 'strategy'
          and (a.scheduled_for at time zone ${tz})::date >= b.bucket_start
          and (a.scheduled_for at time zone ${tz})::date < b.bucket_end) as taken,
      (select count(*) from sales.call c join sales.appointment a on a.call_id = c.id and a.status = 'no_show'
        where c.is_demo = ${demo} and c.type = 'strategy'
          and (a.scheduled_for at time zone ${tz})::date >= b.bucket_start
          and (a.scheduled_for at time zone ${tz})::date < b.bucket_end) as no_shows,
      (select count(*) from sales.deal d
        where d.is_demo = ${demo} and d.status <> 'refunded'
          and d.deal_close_date >= b.bucket_start and d.deal_close_date < b.bucket_end) as deals_won,
      (select coalesce(sum(p.amount_minor), 0) from finance.successful_payment p
        where p.is_demo = ${demo} and p.type <> 'booking_25'
          and (p.occurred_at at time zone ${tz})::date >= b.bucket_start
          and (p.occurred_at at time zone ${tz})::date < b.bucket_end) as cash_minor,
      (select count(*) from sales.call c join sales.appointment a on a.call_id = c.id
          and a.status in ('cancelled_by_lead','cancelled_by_team')
        where c.is_demo = ${demo} and c.type = 'strategy'
          and (a.scheduled_for at time zone ${tz})::date >= b.bucket_start
          and (a.scheduled_for at time zone ${tz})::date < b.bucket_end) as cancellations,
      (select count(*) from sales.call c join sales.appointment a on a.call_id = c.id and a.status = 'rescheduled'
        where c.is_demo = ${demo} and c.type = 'strategy'
          and (a.scheduled_for at time zone ${tz})::date >= b.bucket_start
          and (a.scheduled_for at time zone ${tz})::date < b.bucket_end) as reschedules
    from buckets b order by b.bucket_start`;

  return rows.map((r) => {
    const bookings = Number(r.bookings);
    const taken = Number(r.taken);
    const noShows = Number(r.no_shows);
    const dealsWon = Number(r.deals_won);
    const cancellations = Number(r.cancellations);
    const reschedules = Number(r.reschedules);
    return {
      bucket: String(r.bucket),
      bookings,
      taken,
      no_shows: noShows,
      deals_won: dealsWon,
      cash_minor: Number(r.cash_minor),
      cancellations,
      reschedules,
      close_rate: taken > 0 ? dealsWon / taken : 0,
      show_rate: taken + noShows > 0 ? taken / (taken + noShows) : 0,
      cancel_rate: bookings > 0 ? cancellations / bookings : 0,
      reschedule_rate: bookings > 0 ? reschedules / bookings : 0,
    };
  });
}

export type ReasonSeries = {
  periods: string[];                              // bucket start ISO dates, oldest first
  reasons: { name: string; values: number[] }[];  // one entry per reason, indexed by period
  totals: number[];                               // per-period total across all reasons
};

type ReasonParams = SeriesParams & { kind: ReasonKind };

/** Per-period counts of cancellation OR reschedule reasons, shaped for GroupedBars.
 *  Cancellations = status in (cancelled_by_lead, cancelled_by_team); reschedules
 *  = status 'rescheduled'. Both group by core.cancellation_reason.name via
 *  sales.appointment.reason_id (null reason -> "No reason recorded"). Reasons are
 *  ordered by overall frequency so the busiest are first; totals is the per-period
 *  sum so the caller can always plot a Total bar. */
export async function reasonSeries({ demo, grain, periods, tz, kind }: ReasonParams): Promise<ReasonSeries> {
  const n = Math.min(Math.max(periods, 1), 52);
  const statuses =
    kind === "cancellation" ? ["cancelled_by_lead", "cancelled_by_team"] : ["rescheduled"];

  const rows = await sql`
    with anchor as (
      select date_trunc(${grain}, (now() at time zone ${tz}))::date as cur
    ),
    buckets as (
      select g.i as idx,
             (a.cur - (g.i || ' ' || ${grain})::interval)::date as bucket_start,
             (a.cur - ((g.i - 1) || ' ' || ${grain})::interval)::date as bucket_end
      from anchor a, generate_series(${n - 1}, 0, -1) as g(i)
    ),
    events as (
      select coalesce(cr.name, 'No reason recorded') as reason,
             (a.scheduled_for at time zone ${tz})::date as event_date
      from sales.appointment a
      join sales.call c on c.id = a.call_id
      left join core.cancellation_reason cr on cr.id = a.reason_id
      where a.is_demo = ${demo} and c.type = 'strategy'
        and a.status in ${sql(statuses)}
    )
    select b.bucket_start::text as bucket, b.idx, e.reason, count(e.reason) as n
    from buckets b
    left join events e
      on e.event_date >= b.bucket_start and e.event_date < b.bucket_end
    group by b.bucket_start, b.idx, e.reason
    order by b.idx desc`;

  // Ordered list of buckets (oldest -> newest) and their index in the output arrays.
  const bucketList = Array.from(
    new Map(rows.map((r) => [String(r.bucket), Number(r.idx)])).entries(),
  ).sort((a, b) => b[1] - a[1]); // idx counts down to 0 = newest, so descending idx = oldest first
  const periodDates = bucketList.map(([bucket]) => bucket);
  const posByBucket = new Map(periodDates.map((bucket, i) => [bucket, i]));

  // Accumulate per-reason arrays and the per-period totals.
  const reasonMap = new Map<string, number[]>();
  const totals = new Array<number>(periodDates.length).fill(0);
  for (const r of rows) {
    if (r.reason == null) continue; // empty bucket (left-join miss) -> no reason row
    const reason = String(r.reason);
    const pos = posByBucket.get(String(r.bucket));
    if (pos == null) continue;
    const count = Number(r.n);
    if (!reasonMap.has(reason)) reasonMap.set(reason, new Array<number>(periodDates.length).fill(0));
    reasonMap.get(reason)![pos] += count;
    totals[pos] += count;
  }

  const reasons = Array.from(reasonMap.entries())
    .map(([name, values]) => ({ name, values, sum: values.reduce((s, v) => s + v, 0) }))
    .sort((a, b) => b.sum - a.sum)
    .map(({ name, values }) => ({ name, values }));

  return { periods: periodDates, reasons, totals };
}
