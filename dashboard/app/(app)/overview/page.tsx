import { overviewKpis, dailySeries, leakage, leadershipCloseRate } from "@/lib/kpi";
import { overviewComparison, deltaPct } from "@/lib/kpi-series";
import { isDemoMode, reportTimezone } from "@/lib/settings";
import { money, num, pct } from "@/lib/format";
import { Card, Stat, SectionTitle, InfoTip } from "@/components/ui";
import { DateRangeBar } from "@/components/date-range";
import { BarChart, ProgressRing } from "@/components/charts";
import { resolveRange, previousWindow } from "@/lib/range";
import { requireAccess } from "@/lib/access";
import { getSession } from "@/lib/auth";
import { needsAttention } from "@/lib/attention";
import { AttentionBanner } from "@/components/attention-banner";
import { goalProgress, METRIC_LABEL, isMoneyMetric } from "@/lib/goals";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Roll the day-grained series into ISO weeks (Mon-anchored) in JS so the weekly
// bar charts need no extra query, so the pooler stays at <= 4 concurrent.
function toWeeks(series: { day: string; booked: number; taken: number; cash_minor: number }[]) {
  const buckets = new Map<string, { label: string; booked: number; taken: number; cash_minor: number }>();
  for (const d of series) {
    // d.day comes back from postgres as a Date (or an ISO string); parse either safely.
    const dt = new Date(d.day);
    if (Number.isNaN(dt.getTime())) continue;
    const dow = (dt.getUTCDay() + 6) % 7; // 0 = Monday
    const monday = new Date(dt.getTime() - dow * 86400000);
    const key = monday.toISOString().slice(0, 10);
    const label = monday.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
    const cur = buckets.get(key) ?? { label, booked: 0, taken: 0, cash_minor: 0 };
    cur.booked += Number(d.booked ?? 0);
    cur.taken += Number(d.taken ?? 0);
    cur.cash_minor += Number(d.cash_minor ?? 0);
    buckets.set(key, cur);
  }
  return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([, v]) => v);
}

export default async function Overview({ searchParams }: { searchParams: Promise<{ days?: string; from?: string; to?: string }> }) {
  await requireAccess("overview");
  const demo = await isDemoMode();
  const tz = await reportTimezone();
  const range = resolveRange(await searchParams);
  const days = range.days;
  const until = range.custom ? range.until : null;
  const pw = previousWindow(range);
  // 4 queries, run together, matching the free-tier pooler ceiling (max 4).
  const [k, prev, series, leak] = await Promise.all([
    overviewKpis({ demo, days, tz, since: range.since, until }),
    overviewComparison({ demo, days, tz, prevSince: pw.since, prevUpto: pw.until }),
    dailySeries({ demo, days, tz, from: range.from, to: range.to }),
    leakage({ demo, days, since: range.since, until }),
  ]);
  // Held out of the Promise.all above so concurrency stays at 4 or fewer.
  const lcr = await leadershipCloseRate({ demo, days, since: range.since, until });
  const companyGoals = await goalProgress(demo, "company");
  const session = await getSession();
  const attention = session && ["admin", "leadership"].includes(session.role) ? await needsAttention() : null;

  const n = (v: unknown) => Number(v ?? 0);

  // Core funnel counts (all sourced from lib/kpi.ts, no invented numbers).
  const leads = n(k.leads);
  const booked = n(k.booked);
  const taken = n(k.taken);
  const deals = n(k.deals_won);
  const cash = n(k.cash_collected_minor);

  // Rates (spec section 4.2 / 4.4).
  const showRate = taken + n(k.no_shows) > 0 ? taken / (taken + n(k.no_shows)) : 0;
  const prevShowRate = n(prev.taken) + n(prev.no_shows) > 0 ? n(prev.taken) / (n(prev.taken) + n(prev.no_shows)) : 0;
  const closeRate = taken > 0 ? deals / taken : 0;
  const prevCloseRate = n(prev.taken) > 0 ? n(prev.deals_won) / n(prev.taken) : 0;
  const closeRateCalendar = n(lcr.booked) > 0 ? n(lcr.deals_won) / n(lcr.booked) : 0;
  // Utilization = calls actually taken / calls booked. THE bottleneck (booked to taken).
  const utilization = booked > 0 ? taken / booked : 0;
  const prevUtilization = n(prev.booked) > 0 ? n(prev.taken) / n(prev.booked) : 0;

  // Health tones for the rate stats.
  const showTone = showRate >= 0.7 ? "good" : showRate >= 0.5 ? "warn" : "bad";
  const closeTone = closeRate >= 0.25 ? "good" : closeRate >= 0.15 ? "warn" : "bad";
  const utilTone = utilization >= 0.6 ? "good" : utilization >= 0.4 ? "warn" : "bad";

  // Weekly rollups for the bar charts (no extra query).
  const weeks = toWeeks(series as unknown as { day: string; booked: number; taken: number; cash_minor: number }[]);
  const bookedTakenRows = weeks.map((w) => ({ label: w.label, value: w.booked, compare: w.taken }));
  const cashRows = weeks.map((w) => ({ label: w.label, value: w.cash_minor }));

  // Funnel visualization: each stage as a bar, so the drop-off is visible.
  const funnelRows = [
    { label: "Leads", value: leads },
    { label: "Booked", value: booked },
    { label: "Taken", value: taken },
    { label: "Won", value: deals },
  ];
  // Step-to-step conversion, shown under the funnel.
  const funnelSteps = [
    { from: "Leads", to: "Booked", rate: leads > 0 ? booked / leads : 0 },
    { from: "Booked", to: "Taken", rate: booked > 0 ? taken / booked : 0 },
    { from: "Taken", to: "Won", rate: taken > 0 ? deals / taken : 0 },
  ];

  const rq = range.custom ? `from=${range.from}&to=${range.to}` : `days=${days}`;

  return (
    <div>
      <h1 className="text-xl font-semibold">Overview</h1>
      {attention && <AttentionBanner a={attention} />}
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {range.label}, vs the {range.custom ? "prior period" : `${days} before`}. Times in {tz}.
        </p>
        <DateRangeBar />
      </div>

      {/* Headline KPIs as colored Stat boxes, in funnel order left to right. */}
      <SectionTitle>Headline metrics</SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Leads" value={num(leads)} tone="accent" href={`/explore/leads?${rq}`}
          sub={deltaSub(deltaPct(leads, n(prev.leads)))}
          help="Unique lead-form opt-ins. A returning lead re-counts only after 30 days." />
        <Stat label="Calls booked" value={num(booked)} tone="accent" href={`/explore/booked?${rq}`}
          sub={deltaSub(deltaPct(booked, n(prev.booked)))}
          help="Unique strategy-call bookings on tracked calendars, free and paid alike, counted once regardless of reschedules. The drill-down shows which are paid." />
        <Stat label="Calls taken" value={num(taken)} tone="accent" href={`/explore/taken?${rq}`}
          sub={deltaSub(deltaPct(taken, n(prev.taken)))}
          help="Strategy-call slots that actually happened, by event start date." />
        <Stat label="Deals won" value={num(deals)} tone="good" href={`/explore/deals?${rq}`}
          sub={deltaSub(deltaPct(deals, n(prev.deals_won)))}
          help="Deals recorded by the closer's Sales Call Report, by deal close date. Refunded deals excluded." />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Show rate" value={pct(showRate, 0)} tone={showTone} href={`/explore/no_shows?${rq}`}
          sub={deltaSub(deltaPct(showRate, prevShowRate))}
          help="Taken / (taken + no-shows), on slots that reached their time." />
        <Stat label="Utilization rate" value={pct(utilization, 0)} tone={utilTone} href={`/explore/booked?${rq}`}
          sub={deltaSub(deltaPct(utilization, prevUtilization))}
          help="Calls taken / calls booked. The share of bookings that actually happen as a call. THE bottleneck metric (booked to taken); good is 60% and up." />
        <Stat label="Close rate" value={pct(closeRate, 0)} tone={closeTone} href={`/explore/deals?${rq}`}
          sub={deltaSub(deltaPct(closeRate, prevCloseRate))}
          help="Deals won / calls taken. The closer-facing variant." />
        <Stat label="Cash collected" value={money(cash)} tone="good" href={`/explore/cash?${rq}`}
          sub={deltaSub(deltaPct(cash, n(prev.cash_collected_minor)))}
          help="Gross program payments (NMI), excluding the $25 booking fees, before reversals." />
      </div>

      {/* Funnel visualization + step conversions. */}
      <SectionTitle>Funnel</SectionTitle>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <Card className="lg:col-span-2">
          <div className="mb-2 flex items-center gap-1.5 text-xs" style={{ color: "var(--muted)" }}>
            Leads to Booked to Taken to Won, in the selected window
            <InfoTip text="Each bar is one funnel stage's count. The narrowing bars show where volume is lost between stages." />
          </div>
          <BarChart data={funnelRows} height={200} color="#4f8ef7" highlightLast={false} />
        </Card>
        <Card>
          <div className="mb-3 text-xs" style={{ color: "var(--muted)" }}>Step conversion</div>
          <div className="space-y-3">
            {funnelSteps.map((s) => (
              <div key={s.from} className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 text-sm" style={{ color: "var(--text)" }}>
                  {s.from} <span style={{ color: "var(--muted)" }}>&rarr;</span> {s.to}
                </div>
                <span className="text-sm font-semibold tabular-nums"
                  style={{ color: s.rate >= 0.5 ? "var(--good)" : s.rate >= 0.3 ? "var(--warn)" : "var(--bad)" }}>
                  {pct(s.rate, 0)}
                </span>
              </div>
            ))}
            <div className="flex items-center justify-between gap-3 border-t pt-3" style={{ borderColor: "var(--line)" }}>
              <div className="flex items-center gap-1.5 text-sm font-medium" style={{ color: "var(--text)" }}>
                Full funnel
                <InfoTip text="Deals won / calls booked: the end-to-end conversion from a paid booking to a closed deal." />
              </div>
              <span className="text-sm font-semibold tabular-nums"
                style={{ color: booked > 0 && deals / booked >= 0.07 ? "var(--good)" : "var(--warn)" }}>
                {pct(booked > 0 ? deals / booked : 0, 0)}
              </span>
            </div>
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-1.5 text-sm" style={{ color: "var(--text)" }}>
                Close rate (on calendar)
                <InfoTip text="Deals won / all bookings on the calendar including no-shows: the leadership variant; the closer variant divides by taken calls only." />
              </div>
              <span className="text-sm font-semibold tabular-nums" style={{ color: "var(--muted)" }}>{pct(closeRateCalendar, 0)}</span>
            </div>
          </div>
        </Card>
      </div>

      {/* Weekly trend bar charts. */}
      <SectionTitle>Weekly trend</SectionTitle>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <Card href={`/explore/taken?${rq}`}>
          <div className="mb-2 flex items-center justify-between">
            <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--muted)" }}>
              Booked vs taken by week
              <InfoTip text="Solid bar = calls booked; the faint bar behind = calls taken. The gap is the booked-to-taken leak." />
            </div>
            <div className="flex gap-3 text-[10px]" style={{ color: "var(--muted)" }}>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: "#4f8ef7" }} />Booked</span>
              <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm" style={{ background: "var(--line)" }} />Taken</span>
            </div>
          </div>
          <BarChart data={bookedTakenRows} height={190} color="#4f8ef7" />
        </Card>
        <Card href={`/explore/cash?${rq}`}>
          <div className="mb-2 flex items-center gap-1.5 text-xs" style={{ color: "var(--muted)" }}>
            Cash collected by week
            <InfoTip text="Gross program payments (NMI) per week, excluding the $25 booking fees." />
          </div>
          <BarChart data={cashRows} height={190} color="#34d399" format={(v) => money(v)} />
        </Card>
      </div>

      <SectionTitle>Company goals &amp; projections</SectionTitle>
      {companyGoals.length === 0 ? (
        <Card href="/admin/goals">
          <div className="flex flex-col items-start gap-1 py-2">
            <div className="text-sm font-medium" style={{ color: "var(--text)" }}>Set company goals</div>
            <div className="text-xs" style={{ color: "var(--muted)" }}>
              No company targets yet. Add weekly, monthly, or quarterly goals to track pace here.
            </div>
          </div>
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {companyGoals.map((g) => {
            const fmt = (v: number) => (isMoneyMetric(g.metric) ? money(v) : num(v));
            return (
              <Card key={g.id}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="truncate text-sm font-medium" style={{ color: "var(--text)" }}>
                      {METRIC_LABEL[g.metric]}
                    </div>
                    <div className="mt-0.5 text-xs capitalize" style={{ color: "var(--muted)" }}>{g.period}</div>
                  </div>
                  <ProgressRing value={Math.min(1, g.pct)} label={pct(g.pct, 0)} size={78} />
                </div>
                <div className="mt-2 flex items-baseline justify-between text-sm">
                  <span style={{ color: "var(--text)" }}>{fmt(g.actual)}</span>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>of {fmt(g.target_value)}</span>
                </div>
                <div className="mt-1 text-xs" style={{ color: g.onPace ? "var(--good)" : "var(--warn)" }}>
                  On pace for {fmt(g.projected)}
                </div>
              </Card>
            );
          })}
        </div>
      )}
    </div>
  );
}

// Compact "up/down X% vs prior" line for a Stat's sub slot. Null baseline = flat.
function deltaSub(d: number | null): string {
  if (d === null || d === 0) return "flat vs prior";
  return `${d > 0 ? "▲" : "▼"} ${Math.abs(d).toFixed(0)}% vs prior`;
}
