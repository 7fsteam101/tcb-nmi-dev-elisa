import { overviewKpis, dailySeries, leakage, leadershipCloseRate } from "@/lib/kpi";
import { overviewComparison, deltaPct } from "@/lib/kpi-series";
import { isDemoMode, reportTimezone } from "@/lib/settings";
import { money, num, pct } from "@/lib/format";
import { Card, SectionTitle, MiniBars } from "@/components/ui";
import { StatSpark } from "@/components/stat-spark";
import { PresetBar } from "@/components/preset-bar";
import { requireAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function Overview({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireAccess("overview");
  const demo = await isDemoMode();
  const tz = await reportTimezone();
  const { days: daysRaw } = await searchParams;
  const days = Math.min(Math.max(parseInt(daysRaw ?? "30", 10) || 30, 1), 365);
  const p = { demo, days, tz };
  const [k, prev, series, leak, lcr] = await Promise.all([
    overviewKpis(p), overviewComparison(p), dailySeries(p), leakage(p), leadershipCloseRate(p),
  ]);

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

  return (
    <div>
      <h1 className="text-xl font-semibold">Overview</h1>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Last {days} day{days === 1 ? "" : "s"}, vs the {days} before
        </p>
        <PresetBar />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatSpark label="Leads (unique opt-ins)" value={num(k.leads)} series={s("leads")}
          deltaPct={deltaPct(n(k.leads), n(prev.leads))} href={`/explore/leads?days=${days}`}
          help="Unique lead-form submissions. A returning lead re-counts only after 30 days." />
        <StatSpark label="Calls booked" value={num(k.booked)} series={s("booked")}
          deltaPct={deltaPct(n(k.booked), n(prev.booked))} href={`/explore/booked?days=${days}`}
          help="Unique strategy-call bookings on booking calendars, counted once regardless of reschedules. The $25 payment match attaches as Stripe data lands." />
        <StatSpark label="Calls taken" value={num(k.taken)} series={s("taken")}
          deltaPct={deltaPct(n(k.taken), n(prev.taken))} href={`/explore/taken?days=${days}`}
          help="Appointment slots that actually happened, by event start date." />
        <StatSpark label="Deals won" value={num(k.deals_won)} series={[]} tone="good"
          deltaPct={deltaPct(n(k.deals_won), n(prev.deals_won))} href={`/explore/deals?days=${days}`}
          help="Deals recorded by the closer's Sales Call Report (the moment of record), by deal close date. Close mirrors the pipeline; the report creates the deal." />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
        <StatSpark label="Show rate" value={pct(showRate)} series={[]}
          tone={showRate >= 0.7 ? "good" : showRate >= 0.5 ? "warn" : "bad"}
          deltaPct={deltaPct(showRate, prevShowRate)} href={`/explore/no_shows?days=${days}`}
          help="Taken / (taken + no-shows), on slots that reached their time." />
        <StatSpark label="Close rate (on taken)" value={pct(closeRate)} series={[]}
          tone={closeRate >= 0.25 ? "good" : "warn"}
          deltaPct={deltaPct(closeRate, prevCloseRate)} href={`/explore/deals?days=${days}`}
          help="Deals won / calls taken. The closer-facing variant." />
        <StatSpark label="Close rate (on calendar)" value={pct(closeRateCalendar)} series={[]}
          deltaPct={null} href={`/explore/deals?days=${days}`}
          help="Deals won / all bookings on the calendar including no-shows — the leadership variant; the closer variant divides by taken calls only." />
        <StatSpark label="Booked-to-taken" value={pct(bookedToTaken)} series={[]}
          tone={bookedToTaken >= 0.5 ? "good" : "bad"} deltaPct={null} href={`/explore/booked?days=${days}`}
          help="Of all bookings, how many have had their call actually happen. THE bottleneck metric." />
        <StatSpark label="Reschedules" value={num(k.reschedules)} series={s("rescheduled")} tone="warn"
          deltaPct={deltaPct(n(k.reschedules), n(prev.reschedules))} href={`/explore/reschedules?days=${days}`}
          help="Appointment slots moved to a new time (each move counts once)." />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <StatSpark label="Cash collected" value={money(k.cash_collected_minor)} series={s("cash_minor")}
          deltaPct={deltaPct(n(k.cash_collected_minor), n(prev.cash_collected_minor))} href={`/explore/cash?days=${days}`}
          help="Gross program payments (NMI), excluding the $25 booking fees, before reversals." />
        <StatSpark label="Net of reversals" value={money(netCash)} series={[]}
          tone={n(k.reversals_minor) > 0 ? "warn" : "good"}
          deltaPct={deltaPct(netCash, prevNetCash)} href={`/explore/reversals?days=${days}`}
          help="Cash collected minus refunds and chargebacks." />
        <StatSpark label="Booked revenue" value={money(k.booked_revenue_minor)} series={[]}
          deltaPct={deltaPct(n(k.booked_revenue_minor), n(prev.booked_revenue_minor))} href={`/explore/deals?days=${days}`}
          help="Total contract value of deals won (excludes refunded deals)." />
        <StatSpark label="Ad spend / ROAS" value={`${money(k.ad_spend_minor)} / ${roas.toFixed(1)}x`} series={s("spend_minor")}
          deltaPct={deltaPct(n(k.ad_spend_minor), n(prev.ad_spend_minor))} href={`/explore/adspend?days=${days}`}
          help="Meta spend, and net cash collected divided by spend." />
      </div>

      <SectionTitle>Daily activity</SectionTitle>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card href={`/explore/leads?days=${days}`}>
          <div className="mb-2 text-xs" style={{ color: "var(--muted)" }}>Leads per day</div>
          <MiniBars data={s("leads")} labels={dayLabels} />
        </Card>
        <Card href={`/explore/taken?days=${days}`}>
          <div className="mb-2 text-xs" style={{ color: "var(--muted)" }}>Calls booked vs taken per day</div>
          <MiniBars data={s("booked")} labels={dayLabels} color="var(--accent)" height={28} />
          <MiniBars data={s("taken")} labels={dayLabels} color="var(--good)" height={28} />
        </Card>
        <Card href={`/explore/cash?days=${days}`}>
          <div className="mb-2 text-xs" style={{ color: "var(--muted)" }}>Cash collected per day</div>
          <MiniBars data={s("cash_minor")} labels={dayLabels} color="var(--good)" />
        </Card>
      </div>
    </div>
  );
}
