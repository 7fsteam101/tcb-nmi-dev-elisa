import { overviewKpis, dailySeries, leakage, leadershipCloseRate } from "@/lib/kpi";
import { overviewComparison, deltaPct } from "@/lib/kpi-series";
import { isDemoMode, reportTimezone } from "@/lib/settings";
import { money, num, pct } from "@/lib/format";
import { Card, SectionTitle, MiniBars } from "@/components/ui";
import { StatSpark } from "@/components/stat-spark";
import { DateRangeBar } from "@/components/date-range";
import { LineChart, ProgressRing } from "@/components/charts";
import { resolveRange, previousWindow } from "@/lib/range";
import { requireAccess } from "@/lib/access";
import { goalProgress, METRIC_LABEL, isMoneyMetric } from "@/lib/goals";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function Overview({ searchParams }: { searchParams: Promise<{ days?: string; from?: string; to?: string }> }) {
  await requireAccess("overview");
  const demo = await isDemoMode();
  const tz = await reportTimezone();
  const range = resolveRange(await searchParams);
  const days = range.days;
  const until = range.custom ? range.until : null;
  const pw = previousWindow(range);
  const [k, prev, series, leak, lcr] = await Promise.all([
    overviewKpis({ demo, days, tz, since: range.since, until }),
    overviewComparison({ demo, days, tz, prevSince: pw.since, prevUpto: pw.until }),
    dailySeries({ demo, days, tz, from: range.from, to: range.to }),
    leakage({ demo, days, since: range.since, until }),
    leadershipCloseRate({ demo, days, since: range.since, until }),
  ]);
  // Kept out of the Promise.all above to hold concurrency at 4 or fewer.
  const companyGoals = await goalProgress(demo, "company");

  const n = (v: unknown) => Number(v ?? 0);
  const showRate = n(k.taken) + n(k.no_shows) > 0 ? n(k.taken) / (n(k.taken) + n(k.no_shows)) : 0;
  const prevShowRate = n(prev.taken) + n(prev.no_shows) > 0 ? n(prev.taken) / (n(prev.taken) + n(prev.no_shows)) : 0;
  const closeRate = n(k.taken) > 0 ? n(k.deals_won) / n(k.taken) : 0;
  const prevCloseRate = n(prev.taken) > 0 ? n(prev.deals_won) / n(prev.taken) : 0;
  const closeRateCalendar = n(lcr.booked) > 0 ? n(lcr.deals_won) / n(lcr.booked) : 0;
  const bookedToTaken = n(leak.bookings) > 0 ? n(leak.taken) / n(leak.bookings) : 0;
  const netCash = n(k.cash_collected_minor) - n(k.reversals_minor);
  const prevNetCash = n(prev.cash_collected_minor) - n(prev.reversals_minor);
  const roas = n(k.ad_spend_minor) > 0 ? netCash / n(k.ad_spend_minor) : 0;
  const dayLabels = series.map((d: any) => new Date(d.day).toLocaleDateString("en-US", { month: "short", day: "numeric" }));
  const s = (key: string) => series.map((d: any) => Number(d[key] ?? 0));
  const rq = range.custom ? `from=${range.from}&to=${range.to}` : `days=${days}`;

  return (
    <div>
      <h1 className="text-xl font-semibold">Overview</h1>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {range.label}, vs the {range.custom ? "prior period" : `${days} before`}
        </p>
        <DateRangeBar />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatSpark label="Leads (unique opt-ins)" value={num(k.leads)} series={s("leads")}
          deltaPct={deltaPct(n(k.leads), n(prev.leads))} href={`/explore/leads?${rq}`}
          help="Unique lead-form submissions. A returning lead re-counts only after 30 days." />
        <StatSpark label="Calls booked" value={num(k.booked)} series={s("booked")}
          deltaPct={deltaPct(n(k.booked), n(prev.booked))} href={`/explore/booked?${rq}`}
          help="Unique strategy-call bookings on booking calendars, counted once regardless of reschedules. The $25 payment match attaches as Stripe data lands." />
        <StatSpark label="Calls taken" value={num(k.taken)} series={s("taken")}
          deltaPct={deltaPct(n(k.taken), n(prev.taken))} href={`/explore/taken?${rq}`}
          help="Appointment slots that actually happened, by event start date." />
        <StatSpark label="Deals won" value={num(k.deals_won)} series={[]} tone="good"
          deltaPct={deltaPct(n(k.deals_won), n(prev.deals_won))} href={`/explore/deals?${rq}`}
          help="Deals recorded by the closer's Sales Call Report (the moment of record), by deal close date. Close mirrors the pipeline; the report creates the deal." />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatSpark label="Show rate" value={pct(showRate)} series={[]}
          tone={showRate >= 0.7 ? "good" : showRate >= 0.5 ? "warn" : "bad"}
          deltaPct={deltaPct(showRate, prevShowRate)} href={`/explore/no_shows?${rq}`}
          help="Taken / (taken + no-shows), on slots that reached their time." />
        <StatSpark label="Close rate (on taken)" value={pct(closeRate)} series={[]}
          tone={closeRate >= 0.25 ? "good" : "warn"}
          deltaPct={deltaPct(closeRate, prevCloseRate)} href={`/explore/deals?${rq}`}
          help="Deals won / calls taken. The closer-facing variant." />
        <StatSpark label="Close rate (on calendar)" value={pct(closeRateCalendar)} series={[]}
          deltaPct={null} href={`/explore/deals?${rq}`}
          help="Deals won / all bookings on the calendar including no-shows — the leadership variant; the closer variant divides by taken calls only." />
        <StatSpark label="Booked-to-taken" value={pct(bookedToTaken)} series={[]}
          tone={bookedToTaken >= 0.5 ? "good" : "bad"} deltaPct={null} href={`/explore/booked?${rq}`}
          help="Of all bookings, how many have had their call actually happen. THE bottleneck metric." />
        <StatSpark label="Reschedules" value={num(k.reschedules)} series={s("rescheduled")} tone="warn"
          deltaPct={deltaPct(n(k.reschedules), n(prev.reschedules))} href={`/explore/reschedules?${rq}`}
          help="Appointment slots moved to a new time (each move counts once)." />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatSpark label="Cash collected" value={money(k.cash_collected_minor)} series={s("cash_minor")}
          deltaPct={deltaPct(n(k.cash_collected_minor), n(prev.cash_collected_minor))} href={`/explore/cash?${rq}`}
          help="Gross program payments (NMI), excluding the $25 booking fees, before reversals." />
        <StatSpark label="Net of reversals" value={money(netCash)} series={[]}
          tone={n(k.reversals_minor) > 0 ? "warn" : "good"}
          deltaPct={deltaPct(netCash, prevNetCash)} href={`/explore/reversals?${rq}`}
          help="Cash collected minus refunds and chargebacks." />
        <StatSpark label="Booked revenue" value={money(k.booked_revenue_minor)} series={[]}
          deltaPct={deltaPct(n(k.booked_revenue_minor), n(prev.booked_revenue_minor))} href={`/explore/deals?${rq}`}
          help="Total contract value of deals won (excludes refunded deals)." />
        <StatSpark label="Ad spend / ROAS" value={`${money(k.ad_spend_minor)} / ${roas.toFixed(1)}x`} series={s("spend_minor")}
          deltaPct={deltaPct(n(k.ad_spend_minor), n(prev.ad_spend_minor))} href={`/explore/adspend?${rq}`}
          help="Meta spend, and net cash collected divided by spend." />
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

      <SectionTitle>Daily activity</SectionTitle>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card href={`/explore/leads?${rq}`}>
          <div className="mb-2 text-xs" style={{ color: "var(--muted)" }}>Leads per day</div>
          <MiniBars data={s("leads")} labels={dayLabels} />
        </Card>
        <Card href={`/explore/taken?${rq}`}>
          <div className="mb-2 text-xs" style={{ color: "var(--muted)" }}>Calls booked vs taken per day</div>
          <LineChart height={96} area={false}
            series={[{ label: "Booked", points: s("booked"), color: "#4f8ef7" }, { label: "Taken", points: s("taken"), color: "#34d399" }]} />
        </Card>
        <Card href={`/explore/cash?${rq}`}>
          <div className="mb-2 text-xs" style={{ color: "var(--muted)" }}>Cash collected per day</div>
          <MiniBars data={s("cash_minor")} labels={dayLabels} color="var(--good)" />
        </Card>
      </div>
    </div>
  );
}
