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

// Rank heat: the top third of active closers get a blue (accent) tint that is
// strongest at #1, the bottom third get a red (bad) tint strongest at last place,
// the middle stays neutral. Returned as a color-mix() color string the row sets
// as --row-tint, so the hover style can blend on top of it instead of being
// masked by an inline background. color-mix over var() tokens reads in dark + light.
function rankRowTint(rank: number, activeCount: number): string | null {
  if (activeCount < 2) return null;
  const third = activeCount / 3;
  if (rank < third) {
    const strength = 16 - (rank / Math.max(third - 1, 1)) * 10; // ~16% down to ~6%
    return `color-mix(in srgb, var(--accent) ${strength.toFixed(1)}%, transparent)`;
  }
  if (rank >= activeCount - third) {
    const fromBottom = activeCount - 1 - rank;
    const strength = 16 - (fromBottom / Math.max(third - 1, 1)) * 10;
    return `color-mix(in srgb, var(--bad) ${strength.toFixed(1)}%, transparent)`;
  }
  return null;
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
  const curShow = ratio(cur.taken, cur.taken + cur.noShows);
  const curClose = ratio(cur.won, cur.taken);

  // Close-rate health bands (fractions): 25%+ healthy, 15%+ warning, below bad.
  const closeTone: "good" | "warn" | "bad" = curClose >= 0.25 ? "good" : curClose >= 0.15 ? "warn" : "bad";

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
      {/* Row hover that works WITH the rank tint: the tint arrives as --row-tint
          so hovering blends the standard wash over it instead of being masked by
          an inline background. Scoped to this page's tables. */}
      <style>{`
        tr.rep-row { background-color: var(--row-tint, transparent); transition: background-color 100ms; }
        tr.rep-row:hover { background-color: color-mix(in srgb, var(--panel-2) 55%, var(--row-tint, transparent)); }
      `}</style>

      <h1 className="text-xl font-semibold">Closer Analytics</h1>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Last {days} days. Commission tier: 10% base, 15% while the trailing 2-week close rate holds 33.3%+.
        </p>
        <DateRangeBar />
      </div>

      {/* The five metrics that matter, as tinted Stat boxes: taken/show accent,
          close rate health-toned, cash green. Values render in the tone color so
          they stay saturated (never washed gray) in the light theme. */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <Stat label="Calls taken" value={num(cur.taken)} tone="accent"
          href={`/explore/taken?days=${days}`}
          help="Strategy-call slots that actually happened, by event start time." />
        <Stat label="Show rate" value={pct(curShow)} tone="accent"
          href={`/explore/no_shows?days=${days}`}
          help="Taken / (taken + no-shows) on slots that reached their time." />
        <Stat label="Close rate" value={pct(curClose)} tone={closeTone}
          href={`/explore/deals?days=${days}`}
          help="Deals won / calls taken. Green at 25%+, amber at 15%+. 33.3%+ on the trailing 2 weeks unlocks the 15% commission tier." />
        <Stat label="Cash collected" value={money(cur.cashMinor)} tone="good"
          href={`/explore/cash?days=${days}`}
          help="Gross program payments (NMI), excluding the $25 booking fees, before reversals." />
        <Stat label="Deals" value={num(cur.won)} tone="accent"
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
              const tintColor = hasActivity ? rankRowTint(i, activeCount) : null;
              const rowStyle: React.CSSProperties = {
                ...(tintColor ? ({ "--row-tint": tintColor } as React.CSSProperties) : {}),
                ...(hasActivity ? {} : { opacity: 0.6 }),
              };
              return (
                <tr key={r.id} className="rep-row" style={rowStyle}>
                  <td className="num" style={{ color: "var(--text)" }}>{i + 1}</td>
                  <td>
                    <Link href={`/explore/rep?arg=${r.id}&title=${encodeURIComponent(r.full_name)}&days=${days}`}
                      style={{ color: "var(--accent)" }}>
                      {r.full_name}
                    </Link>
                  </td>
                  <td className="num text-right" style={{ color: "var(--text)" }}>{num(r.taken)}</td>
                  <td className="num text-right" style={{ color: "var(--text)" }}>{num(r.won)}</td>
                  <td className="num text-right" style={{ color: "var(--text)" }}>{r.close_rate != null ? pct(r.close_rate) : "—"}</td>
                  <td className="num text-right" style={{ color: "var(--text)" }}>{r.show_rate != null ? pct(r.show_rate) : "—"}</td>
                  <td className="num text-right" style={{ color: "var(--text)" }}>{money(r.cash_minor)}</td>
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
                <tr key={r.id} className="rep-row">
                  <td>
                    <Link href={`/explore/rep?arg=${r.id}&title=${encodeURIComponent(r.full_name)}&days=${days}`}
                      style={{ color: "var(--accent)" }}>
                      {r.full_name}
                    </Link>
                  </td>
                  <td className="num text-right" style={{ color: "var(--text)" }}>{num(c.taken)}</td>
                  <td className="num text-right" style={{ color: "var(--text)" }}>{num(c.on_time)}</td>
                  <td className="num text-right" style={{ color: Number(c.missing) > 0 ? "var(--bad)" : "var(--text)" }}>
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
