import Link from "next/link";
import { closerAnalytics, overviewComparison } from "@/lib/kpi-closer";
import { pipelineByStage } from "@/lib/kpi";
import { reportCompliance } from "@/lib/kpi-quality";
import { isDemoMode } from "@/lib/settings";
import { money, num, pct } from "@/lib/format";
import { Card, Stat, SectionTitle, InfoTip, Badge, label } from "@/components/ui";
import { BarChart } from "@/components/charts";
import { DateRangeBar } from "@/components/date-range";
import { resolveRange } from "@/lib/range";
import { requireAccess } from "@/lib/access";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);
// Percentage-point delta of the current period over the previous one. Used only
// to colour the five headline Stat boxes by direction of change.
const delta = (cur: number, prev: number) => (prev > 0 ? ((cur - prev) / prev) * 100 : null);

// Tone follows the DIRECTION of change: up is an improvement (green), down a
// regression (red), flat/no-baseline stays on the default accent. Every headline
// metric here is "higher is better", so the sign of the delta is the honest signal.
const deltaTone = (deltaPct: number | null): "good" | "bad" | undefined => {
  if (deltaPct == null || deltaPct === 0) return undefined;
  return deltaPct > 0 ? "good" : "bad";
};

// Rank heat: the top third of active closers get a blue (accent) row tint that is
// strongest at #1, the bottom third get a red (bad) tint strongest at last place,
// the middle stays neutral. color-mix over var() tokens so it reads in dark + light.
function rankRowStyle(rank: number, activeCount: number): React.CSSProperties {
  if (activeCount < 2) return {};
  const third = activeCount / 3;
  if (rank < third) {
    const strength = 16 - (rank / Math.max(third - 1, 1)) * 10; // ~16% down to ~6%
    return { background: `color-mix(in srgb, var(--accent) ${strength.toFixed(1)}%, transparent)` };
  }
  if (rank >= activeCount - third) {
    const fromBottom = activeCount - 1 - rank;
    const strength = 16 - (fromBottom / Math.max(third - 1, 1)) * 10;
    return { background: `color-mix(in srgb, var(--bad) ${strength.toFixed(1)}%, transparent)` };
  }
  return {};
}

export default async function Reps({ searchParams }: { searchParams: Promise<{ days?: string; from?: string; to?: string }> }) {
  await requireAccess("reps");
  const demo = await isDemoMode();
  const days = resolveRange(await searchParams).days;
  const [closers, cmp, stages] = await Promise.all([
    closerAnalytics({ demo, days }),
    overviewComparison({ demo, days }),
    pipelineByStage(demo),
  ]);
  const compliance = await reportCompliance({ demo, days });
  // Report-compliance rows keyed by rep id for the leaderboard column.
  const complianceByRep = new Map(compliance.map((c) => [c.rep_id, c]));

  const cur = cmp.current;
  const prev = cmp.previous;
  const curShow = ratio(cur.taken, cur.taken + cur.noShows);
  const prevShow = ratio(prev.taken, prev.taken + prev.noShows);
  const curClose = ratio(cur.won, cur.taken);
  const prevClose = ratio(prev.won, prev.taken);

  // Deltas drive the Stat tone so a decline never gets painted green.
  const dTaken = delta(cur.taken, prev.taken);
  const dWon = delta(cur.won, prev.won);
  const dCash = delta(cur.cashMinor, prev.cashMinor);
  const dShow = delta(curShow, prevShow);
  const dClose = delta(curClose, prevClose);

  // Count of closers with real activity — drives the rank-heat gradient bounds so
  // idle placeholder rows do not distort the top/bottom bands.
  const activeCount = closers.filter((r: any) =>
    Number(r.taken) + Number(r.on_calendar) + Number(r.won) + Number(r.cash_minor) > 0).length;

  // Team-wide opportunity stage distribution (counts per stage), stage order set by
  // the pipeline query. Empty stages are dropped so the chart stays readable.
  const stageBars = stages
    .map((s: any) => ({ label: label(s.stage), value: Number(s.n) }))
    .filter((s: { value: number }) => s.value > 0);

  // Focused per-closer bars: only reps with real activity, so no empty columns.
  const activeClosers = closers.filter((r: any) =>
    Number(r.taken) + Number(r.on_calendar) + Number(r.won) + Number(r.cash_minor) > 0);
  const firstName = (name: string) => String(name).split(/\s+/)[0] || name;
  const cashBars = activeClosers
    .filter((r: any) => Number(r.cash_minor) > 0)
    .map((r: any) => ({ label: firstName(r.full_name), value: Number(r.cash_minor) }));
  // Close rate is a 0..1 fraction; the bar chart rounds its Y-axis ticks to
  // whole numbers, so feed percentage points (0..100) and format with a plain
  // "%" suffix. Otherwise ticks like 0.25 would round to 0% and read wrong.
  const closeRateBars = activeClosers
    .filter((r: any) => r.close_rate != null && Number(r.taken) > 0)
    .map((r: any) => ({ label: firstName(r.full_name), value: Number(r.close_rate) * 100 }));

  return (
    <div>
      <h1 className="text-xl font-semibold">Closer Analytics</h1>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Last {days} days vs the {days} days before. Commission tier: 10% base, 15% while the trailing 2-week close rate holds 33.3%+.
        </p>
        <DateRangeBar />
      </div>

      {/* The five metrics that matter, as compact colored Stat boxes. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <Stat label="Calls taken" value={num(cur.taken)} tone={deltaTone(dTaken)}
          href={`/explore/taken?days=${days}`}
          help="Strategy-call slots that actually happened, by event start time." />
        <Stat label="Show rate" value={pct(curShow)} tone={deltaTone(dShow)}
          href={`/explore/no_shows?days=${days}`}
          help="Taken / (taken + no-shows) on slots that reached their time." />
        <Stat label="Close rate" value={pct(curClose)} tone={deltaTone(dClose)}
          href={`/explore/deals?days=${days}`}
          help="Deals won / calls taken. 33.3%+ on the trailing 2 weeks unlocks the 15% commission tier." />
        <Stat label="Cash collected" value={money(cur.cashMinor)} tone={deltaTone(dCash)}
          href={`/explore/cash?days=${days}`}
          help="Gross program payments (NMI), excluding the $25 booking fees, before reversals." />
        <Stat label="Deals" value={num(cur.won)} tone={deltaTone(dWon)}
          href={`/explore/deals?days=${days}`}
          help="Deals won by deal close date. Refunded deals are excluded." />
      </div>

      <SectionTitle>Opportunities by stage</SectionTitle>
      <Card>
        <p className="mb-4 text-xs" style={{ color: "var(--muted)" }}>
          Where every open and closed opportunity sits across the team, ordered along the pipeline.
        </p>
        <BarChart data={stageBars} format={(v) => num(v)} height={200} highlightLast={false} />
      </Card>

      <div className="mt-2 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div>
          <SectionTitle>Cash collected by closer</SectionTitle>
          <Card>
            <BarChart data={cashBars} format={(v) => money(v)} height={190} highlightLast={false} color="var(--good)" />
          </Card>
        </div>
        <div>
          <SectionTitle>Close rate by closer</SectionTitle>
          <Card>
            <BarChart data={closeRateBars} format={(v) => `${Math.round(v)}%`} height={190} highlightLast={false} />
          </Card>
        </div>
      </div>

      <SectionTitle>Closer leaderboard</SectionTitle>
      <Card>
        <table>
          <thead>
            <tr>
              <th>#</th>
              <th>Closer</th>
              <th className="text-right">Taken <InfoTip text="Taken strategy calls in range" /></th>
              <th className="text-right">Deals</th>
              <th className="text-right">CR% <InfoTip text="Deals won / calls taken" /></th>
              <th className="text-right">SR% <InfoTip text="Taken / (taken + no-shows) on this closer's slots" /></th>
              <th className="text-right">Cash <InfoTip text="Cash collected attributed to this closer" /></th>
            </tr>
          </thead>
          <tbody>
            {closers.map((r: any, i: number) => {
              const hasActivity =
                Number(r.taken) + Number(r.on_calendar) + Number(r.won) + Number(r.cash_minor) > 0;
              return (
                <tr key={r.id} style={hasActivity ? rankRowStyle(i, activeCount) : { opacity: 0.45 }}>
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
                  <td className="text-right">{money(r.cash_minor)}</td>
                </tr>
              );
            })}
            {closers.length === 0 && (
              <tr><td colSpan={7} style={{ color: "var(--muted)" }}>No active closers</td></tr>
            )}
          </tbody>
        </table>
      </Card>

      <SectionTitle>Report compliance</SectionTitle>
      <Card>
        <p className="mb-3 text-xs" style={{ color: "var(--muted)" }}>
          Sales Call Reports are due the same day the call happens. On-time rate = reports filed on time / taken calls, over the last {days} days.
        </p>
        <table>
          <thead>
            <tr>
              <th>Closer</th>
              <th className="text-right">Taken <InfoTip text="Taken strategy calls attributed to this closer in range" /></th>
              <th className="text-right">On time <InfoTip text="Taken calls whose Sales Call Report was filed the same ET day" /></th>
              <th className="text-right">Missing <InfoTip text="Taken calls with no validated Sales Call Report filed at all" /></th>
              <th className="text-right">On-time %</th>
            </tr>
          </thead>
          <tbody>
            {closers.map((r: any) => {
              const c = complianceByRep.get(r.id);
              if (!c || Number(c.taken) === 0) return null;
              const rate = c.on_time_rate != null ? Number(c.on_time_rate) : null;
              const tone = rate == null ? "neutral" : rate >= 0.9 ? "good" : rate >= 0.7 ? "warn" : "bad";
              return (
                <tr key={r.id}>
                  <td>
                    <Link href={`/explore/rep?arg=${r.id}&title=${encodeURIComponent(r.full_name)}&days=${days}`}
                      style={{ color: "var(--accent)" }}>
                      {r.full_name}
                    </Link>
                  </td>
                  <td className="text-right">{num(c.taken)}</td>
                  <td className="text-right">{num(c.on_time)}</td>
                  <td className="text-right" style={Number(c.missing) > 0 ? { color: "var(--bad)" } : undefined}>
                    {num(c.missing)}
                  </td>
                  <td className="text-right">
                    {rate != null ? <Badge tone={tone}>{pct(rate, 0)}</Badge> : <span style={{ color: "var(--muted)" }}>—</span>}
                  </td>
                </tr>
              );
            })}
            {compliance.length === 0 && (
              <tr><td colSpan={5} style={{ color: "var(--muted)" }}>No taken calls to grade in this range</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
