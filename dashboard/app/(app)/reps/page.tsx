import Link from "next/link";
import { closerAnalytics, dailyCashSeries, dailyCloserSeries, overviewComparison } from "@/lib/kpi-closer";
import { isDemoMode, reportTimezone } from "@/lib/settings";
import { money, num, pct } from "@/lib/format";
import { Card, SectionTitle, InfoTip, Badge } from "@/components/ui";
import { StatSpark } from "@/components/stat-spark";
import { DateRangeBar } from "@/components/date-range";
import { ProgressRing } from "@/components/charts";
import { resolveRange } from "@/lib/range";
import { requireAccess } from "@/lib/access";
import { commissionForReps } from "@/lib/commission";
import { goalProgress } from "@/lib/goals";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);
// StatSpark's chip expects percentage points (12.5 = +12.5%), not a fraction.
const delta = (cur: number, prev: number) => (prev > 0 ? ((cur - prev) / prev) * 100 : null);

/** Dependency-free two-line SVG chart: current period (green) vs previous (muted). */
function TwoLineChart({ current, previous, titles, height = 130 }: {
  current: number[]; previous: number[]; titles: string[]; height?: number;
}) {
  const max = Math.max(...current, ...previous, 1);
  const n = Math.max(current.length, 2);
  const pt = (v: number, i: number) => `${(i / (n - 1)) * 100},${(height - 6 - (v / max) * (height - 12)).toFixed(2)}`;
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      <polyline points={previous.map(pt).join(" ")} fill="none" stroke="var(--muted)"
        strokeOpacity={0.55} strokeWidth={1.25} vectorEffect="non-scaling-stroke" />
      <polyline points={current.map(pt).join(" ")} fill="none" stroke="var(--good)"
        strokeWidth={1.75} vectorEffect="non-scaling-stroke" />
      {current.map((_, i) => (
        <rect key={i} x={(i / n) * 100} y={0} width={100 / n} height={height} fill="transparent">
          <title>{titles[i]}</title>
        </rect>
      ))}
    </svg>
  );
}

export default async function Reps({ searchParams }: { searchParams: Promise<{ days?: string; from?: string; to?: string }> }) {
  await requireAccess("reps");
  const demo = await isDemoMode();
  const tz = await reportTimezone();
  const days = resolveRange(await searchParams).days;
  const [closers, cashCmp, daily, cmp] = await Promise.all([
    closerAnalytics({ demo, days }),
    dailyCashSeries({ demo, days, tz }),
    dailyCloserSeries({ demo, days, tz }),
    overviewComparison({ demo, days }),
  ]);
  // Separate batch so the page never exceeds 4 concurrent queries.
  const [commission, repGoals] = await Promise.all([
    commissionForReps(demo, days),
    goalProgress(demo, "rep"),
  ]);
  // A rep's cash_collected goal, keyed by rep id, for the commission table rings.
  const cashGoalByRep = new Map(
    repGoals.filter((g) => g.metric === "cash_collected" && g.rep_id).map((g) => [g.rep_id as string, g]),
  );

  const cur = cmp.current;
  const prev = cmp.previous;
  const curShow = ratio(cur.taken, cur.taken + cur.noShows);
  const prevShow = ratio(prev.taken, prev.taken + prev.noShows);
  const curClose = ratio(cur.won, cur.taken);
  const prevClose = ratio(prev.won, prev.taken);
  const curCashPerCall = ratio(cur.cashMinor, cur.taken);
  const prevCashPerCall = ratio(prev.cashMinor, prev.taken);
  const curAov = ratio(cur.invoicedMinor, cur.won);
  const prevAov = ratio(prev.invoicedMinor, prev.won);

  const s = {
    booked: daily.map((d: any) => Number(d.booked)),
    onCalendar: daily.map((d: any) => Number(d.on_calendar)),
    taken: daily.map((d: any) => Number(d.taken)),
    won: daily.map((d: any) => Number(d.won)),
    cash: daily.map((d: any) => Number(d.cash_minor)),
    cashPerCall: daily.map((d: any) => ratio(Number(d.cash_minor), Number(d.taken))),
    aov: daily.map((d: any) => ratio(Number(d.invoiced_minor), Number(d.won))),
    show: daily.map((d: any) => ratio(Number(d.taken), Number(d.taken) + Number(d.no_shows))),
    close: daily.map((d: any) => ratio(Number(d.won), Number(d.taken))),
  };

  const cashCurrent = cashCmp.map((d: any) => Number(d.current_minor));
  const cashPrevious = cashCmp.map((d: any) => Number(d.previous_minor));
  const cashTitles = cashCmp.map((d: any) => {
    const label = new Date(d.day).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    return `${label}: ${money(d.current_minor)} (prev period: ${money(d.previous_minor)})`;
  });
  const cashCurTotal = cashCurrent.reduce((a, b) => a + b, 0);
  const cashPrevTotal = cashPrevious.reduce((a, b) => a + b, 0);

  return (
    <div>
      <h1 className="text-xl font-semibold">Closer Analytics</h1>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Last {days} days vs the {days} days before. Commission tier: 10% base, 15% while the trailing 2-week close rate holds 33.3%+.
        </p>
        <DateRangeBar />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <StatSpark label="Total booked calls" value={num(cur.booked)} series={s.booked}
          deltaPct={delta(cur.booked, prev.booked)} href={`/explore/booked?days=${days}`}
          help="Unique paid strategy-call bookings whose current slot lands in range — counted once no matter how often they reschedule." />
        <StatSpark label="Calls on calendar" value={num(cur.onCalendar)} series={s.onCalendar}
          deltaPct={delta(cur.onCalendar, prev.onCalendar)} href={`/explore/booked?days=${days}`}
          help="Live calendar volume: current appointment slots in range, any status (scheduled, confirmed, taken, no-show, cancelled)." />
        <StatSpark label="Live (taken) calls" value={num(cur.taken)} series={s.taken}
          deltaPct={delta(cur.taken, prev.taken)} href={`/explore/taken?days=${days}`}
          help="Strategy-call slots that actually happened, by event start time." />
        <StatSpark label="Closed won" value={num(cur.won)} series={s.won} tone="good"
          deltaPct={delta(cur.won, prev.won)} href={`/explore/deals?days=${days}`}
          help="Deals won by deal close date. Refunded deals are excluded." />
        <StatSpark label="Cash collected" value={money(cur.cashMinor)} series={s.cash} tone="good"
          deltaPct={delta(cur.cashMinor, prev.cashMinor)} href={`/explore/cash?days=${days}`}
          help="Gross program payments (NMI), excluding the $25 booking fees, before reversals." />
        <StatSpark label="Cash per live call" value={money(curCashPerCall)} series={s.cashPerCall}
          deltaPct={delta(curCashPerCall, prevCashPerCall)} href={`/explore/cash?days=${days}`}
          help="Cash collected divided by taken calls — what a seat on the calendar is worth." />
        <StatSpark label="AOV" value={money(curAov)} series={s.aov}
          deltaPct={delta(curAov, prevAov)} href={`/explore/deals?days=${days}`}
          help="Average order value: total contract value of won deals divided by deals won." />
        <StatSpark label="Show rate" value={pct(curShow)} series={s.show}
          tone={curShow >= 0.7 ? "good" : curShow >= 0.5 ? "warn" : "bad"}
          deltaPct={delta(curShow, prevShow)} href={`/explore/no_shows?days=${days}`}
          help="Taken / (taken + no-shows) on slots that reached their time." />
        <StatSpark label="Close rate" value={pct(curClose)} series={s.close}
          tone={curClose >= 0.333 ? "good" : curClose >= 0.2 ? "warn" : "bad"}
          deltaPct={delta(curClose, prevClose)} href={`/explore/deals?days=${days}`}
          help="Deals won / calls taken (the closer variant). 33.3%+ on the trailing 2 weeks unlocks the 15% commission tier." />
      </div>

      <div className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div>
          <SectionTitle>Cash collected (daily)</SectionTitle>
          <Card href={`/explore/cash?days=${days}`}>
            <div className="mb-2 flex items-center justify-between text-xs" style={{ color: "var(--muted)" }}>
              <span className="flex items-center gap-1.5">
                This period vs previous
                <InfoTip text={`Program cash per day (no $25 booking fees). Green = last ${days} days; grey = the ${days} days before, aligned day-for-day.`} />
              </span>
              <span>
                <span style={{ color: "var(--good)" }}>{money(cashCurTotal)}</span>
                {" vs "}
                {money(cashPrevTotal)}
              </span>
            </div>
            <TwoLineChart current={cashCurrent} previous={cashPrevious} titles={cashTitles} />
            <div className="mt-2 flex items-center gap-4 text-[11px]" style={{ color: "var(--muted)" }}>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 rounded" style={{ background: "var(--good)" }} />
                This period
              </span>
              <span className="flex items-center gap-1.5">
                <span className="inline-block h-0.5 w-4 rounded" style={{ background: "var(--muted)", opacity: 0.55 }} />
                Previous period
              </span>
            </div>
          </Card>
        </div>

        <div>
          <SectionTitle>Closer leaderboard</SectionTitle>
          <Card>
            <table>
              <thead>
                <tr>
                  <th>#</th>
                  <th>Closer</th>
                  <th className="text-right">Live <InfoTip text="Taken strategy calls in range" /></th>
                  <th className="text-right">Won</th>
                  <th className="text-right">CR% <InfoTip text="Deals won / calls taken" /></th>
                  <th className="text-right">SR% <InfoTip text="Taken / (taken + no-shows) on this closer's slots" /></th>
                  <th className="text-right">Cash <InfoTip text="Cash collected attributed to this closer, with cash per taken call underneath" /></th>
                  <th className="text-right">Est. comm. <InfoTip text="Cash x current tier rate (10% base, 15% while trailing 14-day close rate is 33.3%+). Indicative — payroll runs off validated commission reports." /></th>
                </tr>
              </thead>
              <tbody>
                {closers.map((r: any, i: number) => {
                  const hasActivity =
                    Number(r.taken) + Number(r.on_calendar) + Number(r.won) + Number(r.cash_minor) > 0;
                  return (
                    <tr key={r.id} style={{
                      ...(i === 0 && hasActivity ? { background: "rgba(212,175,55,.12)" } : {}),
                      ...(hasActivity ? {} : { opacity: 0.45 }),
                    }}>
                      <td>{i + 1}</td>
                      <td>
                        <Link href={`/explore/rep?arg=${r.id}&title=${encodeURIComponent(r.full_name)}&days=${days}`}
                          style={{ color: "var(--accent)" }}>
                          {r.full_name}
                        </Link>
                      </td>
                      <td className="text-right">{num(r.taken)}</td>
                      <td className="text-right">{num(r.won)}</td>
                      <td className="text-right">{r.close_rate != null ? pct(r.close_rate) : "—"}</td>
                      <td className="text-right">{r.show_rate != null ? pct(r.show_rate) : "—"}</td>
                      <td className="text-right">
                        {money(r.cash_minor)}
                        <div className="text-[11px]" style={{ color: "var(--muted)" }}>
                          {r.cash_per_taken_minor != null ? `${money(r.cash_per_taken_minor)}/call` : "—"}
                        </div>
                      </td>
                      <td className="text-right">{money(r.est_commission_minor)}</td>
                    </tr>
                  );
                })}
                {closers.length === 0 && (
                  <tr><td colSpan={8} style={{ color: "var(--muted)" }}>No active closers</td></tr>
                )}
              </tbody>
            </table>
          </Card>
        </div>
      </div>

      <SectionTitle>Commission (estimate)</SectionTitle>
      <Card>
        <div className="mb-3 flex items-center gap-1.5 text-xs" style={{ color: "var(--muted)" }}>
          Rule-driven estimate
          <InfoTip text="Computed from the commission rules enabled per member (base rate, tier bonus, refund clawback). Toggle a rule per member in Admin -> Commission. Estimate only; payroll runs off validated commission reports." />
        </div>
        <table>
          <thead>
            <tr>
              <th>Closer</th>
              <th className="text-right">Cash collected</th>
              <th className="text-right">Effective rate</th>
              <th className="text-right">Tier active</th>
              <th className="text-right">Est. owed</th>
              <th className="text-right">Goal</th>
            </tr>
          </thead>
          <tbody>
            {commission.map((r) => {
              const goal = cashGoalByRep.get(r.rep_id);
              return (
                <tr key={r.rep_id}>
                  <td>{r.full_name}</td>
                  <td className="text-right">{money(r.cash_minor)}</td>
                  <td className="text-right">{pct(r.effective_rate)}</td>
                  <td className="text-right">
                    {r.tier_active ? <Badge tone="good">Active</Badge> : <Badge>Base</Badge>}
                  </td>
                  <td className="text-right">{money(r.owed_minor)}</td>
                  <td className="text-right">
                    {goal ? (
                      <div className="flex justify-end">
                        <ProgressRing value={Math.min(1, goal.pct)} label={pct(goal.pct, 0)} size={62} />
                      </div>
                    ) : (
                      <span style={{ color: "var(--muted)" }}>—</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {commission.length === 0 && (
              <tr><td colSpan={6} style={{ color: "var(--muted)" }}>No active closers</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
