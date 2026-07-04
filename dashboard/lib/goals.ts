import { sql } from "./db";
import type { Metric, Period } from "./goals-shared";

// Goals + projections. A goal is a target for a metric over a period (weekly /
// monthly / quarterly), company-wide or per rep. Progress = actual-in-window /
// target. Projection paces the actual over the elapsed fraction of the period.
// Client-safe constants (METRIC_LABEL, isMoneyMetric) + the types live in
// goals-shared.ts so client components can import them without pulling in postgres.
export type { Metric, Period };

export type GoalRow = {
  id: string; scope: "company" | "rep"; rep_id: string | null; rep_name?: string;
  metric: Metric; period: Period; target_value: number;
};
export type GoalProgress = GoalRow & {
  actual: number; pct: number; projected: number; elapsed: number; onPace: boolean;
};

const TZ = "America/New_York";
function nowET() {
  // date parts in ET
  const p = new Intl.DateTimeFormat("en-CA", { timeZone: TZ, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(new Date());
  const y = +p.find((x) => x.type === "year")!.value, m = +p.find((x) => x.type === "month")!.value, d = +p.find((x) => x.type === "day")!.value;
  return { y, m, d };
}

// [since, until] for the current period + the elapsed fraction (0..1).
export function periodWindow(period: Period): { since: string; until: string; elapsed: number } {
  const { y, m, d } = nowET();
  const iso = (yy: number, mm: number, dd: number) => `${yy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
  const daysInMonth = (yy: number, mm: number) => new Date(yy, mm, 0).getDate();
  const untilNow = new Date().toISOString();
  if (period === "weekly") {
    const wd = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(new Date());
    const dow = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(wd); // 0=Mon
    const start = new Date(Date.UTC(y, m - 1, d - (dow < 0 ? 0 : dow)));
    return { since: start.toISOString().slice(0, 10) + "T00:00:00", until: untilNow, elapsed: ((dow < 0 ? 0 : dow) + 1) / 7 };
  }
  if (period === "quarterly") {
    const qStartMonth = Math.floor((m - 1) / 3) * 3 + 1;
    const monthsIn = 3, monthIdx = (m - qStartMonth);
    const totalDays = [0, 1, 2].reduce((s, i) => s + daysInMonth(y, qStartMonth + i), 0);
    const elapsedDays = [...Array(monthIdx).keys()].reduce((s, i) => s + daysInMonth(y, qStartMonth + i), 0) + d;
    return { since: iso(y, qStartMonth, 1) + "T00:00:00", until: untilNow, elapsed: elapsedDays / totalDays };
  }
  // monthly
  return { since: iso(y, m, 1) + "T00:00:00", until: untilNow, elapsed: d / daysInMonth(y, m) };
}

// actual value for each metric over [since, until), company-wide or one rep.
async function actuals(demo: boolean, since: string, until: string, repId: string | null) {
  const repCall = repId ? sql`and c.rep_id = ${repId}` : sql``;
  const repClose = repId ? sql`and d.closer_rep_id = ${repId}` : sql``;
  const repPay = repId ? sql`and p.rep_id = ${repId}` : sql``;
  const [row] = await sql`
    select
      (select count(*) from sales.call c join sales.appointment a on a.call_id = c.id and a.is_current
        where c.is_demo = ${demo} and c.type = 'strategy' and c.is_primary and c.is_booking and not coalesce(c.is_duplicate,false)
          and coalesce(c.current_scheduled_at, c.scheduled_at) >= ${since}::timestamptz and coalesce(c.current_scheduled_at, c.scheduled_at) < ${until}::timestamptz ${repCall}) as calls_booked,
      (select count(*) from sales.appointment a join sales.call c on c.id = a.call_id
        where a.is_demo = ${demo} and a.status = 'taken' and c.type = 'strategy'
          and a.scheduled_for >= ${since}::timestamptz and a.scheduled_for < ${until}::timestamptz ${repCall}) as calls_taken,
      (select coalesce(sum(p.amount_minor),0) from finance.successful_payment p
        where p.is_demo = ${demo} and p.type <> 'booking_25' and p.occurred_at >= ${since}::timestamptz and p.occurred_at < ${until}::timestamptz ${repPay}) as cash_collected,
      (select count(*) from sales.deal d where d.is_demo = ${demo} and d.status <> 'refunded'
        and d.deal_close_date >= ${since}::date and d.deal_close_date < ${until}::date ${repClose}) as deals_won,
      (select count(distinct d.contact_id) from sales.deal d where d.is_demo = ${demo} and d.status <> 'refunded'
        and d.deal_close_date >= ${since}::date and d.deal_close_date < ${until}::date ${repClose}) as clients`;
  return row as Record<Metric, number>;
}

export async function goalProgress(demo: boolean, scope: "company" | "rep"): Promise<GoalProgress[]> {
  const goals = await sql`
    select g.id, g.scope, g.rep_id, g.metric, g.period, g.target_value, r.full_name as rep_name
    from core.goal g left join sales.rep r on r.id = g.rep_id
    where g.scope = ${scope} and (g.effective_to is null or g.effective_to >= current_date)
      and g.effective_from <= current_date
    order by g.metric` as unknown as GoalRow[];
  if (!goals.length) return [];

  // cache actuals per (period, rep) so we do not re-query per goal
  const cache = new Map<string, Record<Metric, number>>();
  const out: GoalProgress[] = [];
  for (const g of goals) {
    const key = `${g.period}|${g.rep_id ?? "co"}`;
    if (!cache.has(key)) {
      const w = periodWindow(g.period);
      cache.set(key, await actuals(demo, w.since, w.until, g.rep_id));
    }
    const w = periodWindow(g.period);
    const actual = Number(cache.get(key)![g.metric] ?? 0);
    const target = Number(g.target_value);
    const pct = target > 0 ? actual / target : 0;
    const projected = w.elapsed > 0 ? Math.round(actual / w.elapsed) : actual;
    out.push({ ...g, target_value: target, actual, pct, projected, elapsed: w.elapsed, onPace: projected >= target });
  }
  return out;
}

export { METRIC_LABEL, isMoneyMetric } from "./goals-shared";
