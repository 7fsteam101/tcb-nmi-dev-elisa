import { overviewKpis, dailySeries, leakage } from "@/lib/kpi";
import { isDemoMode, reportTimezone } from "@/lib/settings";
import { money, num, pct } from "@/lib/format";
import { Card, Stat, SectionTitle, MiniBars } from "@/components/ui";

export const dynamic = "force-dynamic";

export default async function Overview() {
  const demo = await isDemoMode();
  const tz = await reportTimezone();
  const p = { demo, days: 30, tz };
  const [k, series, leak] = await Promise.all([overviewKpis(p), dailySeries(p), leakage(p)]);

  const showRate = Number(k.taken) + Number(k.no_shows) > 0 ? Number(k.taken) / (Number(k.taken) + Number(k.no_shows)) : 0;
  const closeRate = Number(k.taken) > 0 ? Number(k.deals_won) / Number(k.taken) : 0;
  const bookedToTaken = Number(leak.bookings) > 0 ? Number(leak.taken) / Number(leak.bookings) : 0;
  const netCash = Number(k.cash_collected_minor) - Number(k.reversals_minor);
  const roas = Number(k.ad_spend_minor) > 0 ? netCash / Number(k.ad_spend_minor) : 0;
  const days = series.map((d: any) => new Date(d.day).toLocaleDateString("en-US", { month: "short", day: "numeric" }));

  return (
    <div>
      <h1 className="text-xl font-semibold">Overview</h1>
      <p className="mb-6 text-sm" style={{ color: "var(--muted)" }}>Last 30 days</p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Leads (unique opt-ins)" value={num(k.leads)} href="/marketing"
          help="Unique lead-form submissions. A returning lead re-counts only after 30 days." />
        <Stat label="Calls booked" value={num(k.booked)}
          help="Unique $25-paid strategy-call bookings, counted once per booking regardless of reschedules." href="/calls" />
        <Stat label="Calls taken" value={num(k.taken)} href="/calls"
          help="Appointment slots that actually happened, by event start date." />
        <Stat label="Deals won" value={num(k.deals_won)} tone="good" href="/reps"
          help="Opportunities marked Won (PIF or payment plan), by deal close date." />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Show rate" value={pct(showRate)} tone={showRate >= 0.7 ? "good" : showRate >= 0.5 ? "warn" : "bad"}
          help="Taken / (taken + no-shows), on slots that reached their time." />
        <Stat label="Close rate (on taken)" value={pct(closeRate)} tone={closeRate >= 0.25 ? "good" : "warn"}
          help="Deals won / calls taken. The closer-facing variant." />
        <Stat label="Booked-to-taken" value={pct(bookedToTaken)} tone={bookedToTaken >= 0.5 ? "good" : "bad"} href="/funnel"
          help="Of all bookings, how many have had their call actually happen. THE bottleneck metric." />
        <Stat label="Reschedules" value={num(k.reschedules)} tone="warn" href="/funnel"
          help="Appointment slots moved to a new time (each move counts once)." />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Cash collected" value={money(k.cash_collected_minor)}
          help="Gross program payments (NMI), excluding the $25 booking fees, before reversals." href="/receivables" />
        <Stat label="Net of reversals" value={money(netCash)} tone={Number(k.reversals_minor) > 0 ? "warn" : "good"}
          help="Cash collected minus refunds and chargebacks." />
        <Stat label="Booked revenue" value={money(k.booked_revenue_minor)}
          help="Total contract value of deals won (excludes refunded deals)." />
        <Stat label="Ad spend / ROAS" value={`${money(k.ad_spend_minor)} / ${roas.toFixed(1)}x`} href="/marketing"
          help="Meta spend, and net cash collected divided by spend." />
      </div>

      <SectionTitle>Daily activity</SectionTitle>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card>
          <div className="mb-2 text-xs" style={{ color: "var(--muted)" }}>Leads per day</div>
          <MiniBars data={series.map((d: any) => Number(d.leads))} labels={days} />
        </Card>
        <Card>
          <div className="mb-2 text-xs" style={{ color: "var(--muted)" }}>Calls booked vs taken per day</div>
          <MiniBars data={series.map((d: any) => Number(d.booked))} labels={days} color="var(--accent)" height={28} />
          <MiniBars data={series.map((d: any) => Number(d.taken))} labels={days} color="var(--good)" height={28} />
        </Card>
        <Card>
          <div className="mb-2 text-xs" style={{ color: "var(--muted)" }}>Cash collected per day</div>
          <MiniBars data={series.map((d: any) => Number(d.cash_minor))} labels={days} color="var(--good)" />
        </Card>
      </div>
    </div>
  );
}
