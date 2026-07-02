import { overviewKpis, dailySeries, leakage, leadershipCloseRate } from "@/lib/kpi";
import { isDemoMode, reportTimezone } from "@/lib/settings";
import { money, num, pct } from "@/lib/format";
import { Card, Stat, SectionTitle, MiniBars } from "@/components/ui";
import { RangePicker } from "@/components/range-picker";
import { requireAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function Overview({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireAccess("overview");
  const demo = await isDemoMode();
  const tz = await reportTimezone();
  const { days: daysRaw } = await searchParams;
  const days = Math.min(Math.max(parseInt(daysRaw ?? "30", 10) || 30, 7), 365);
  const p = { demo, days, tz };
  const [k, series, leak, lcr] = await Promise.all([overviewKpis(p), dailySeries(p), leakage(p), leadershipCloseRate(p)]);

  const showRate = Number(k.taken) + Number(k.no_shows) > 0 ? Number(k.taken) / (Number(k.taken) + Number(k.no_shows)) : 0;
  const closeRate = Number(k.taken) > 0 ? Number(k.deals_won) / Number(k.taken) : 0;
  const closeRateCalendar = Number(lcr.booked) > 0 ? Number(lcr.deals_won) / Number(lcr.booked) : 0;
  const bookedToTaken = Number(leak.bookings) > 0 ? Number(leak.taken) / Number(leak.bookings) : 0;
  const netCash = Number(k.cash_collected_minor) - Number(k.reversals_minor);
  const roas = Number(k.ad_spend_minor) > 0 ? netCash / Number(k.ad_spend_minor) : 0;
  const dayLabels = series.map((d: any) => new Date(d.day).toLocaleDateString("en-US", { month: "short", day: "numeric" }));

  return (
    <div>
      <h1 className="text-xl font-semibold">Overview</h1>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm" style={{ color: "var(--muted)" }}>Last {days} days</p>
        <RangePicker />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Leads (unique opt-ins)" value={num(k.leads)} href={`/explore/leads?days=${days}`}
          help="Unique lead-form submissions. A returning lead re-counts only after 30 days." />
        <Stat label="Calls booked" value={num(k.booked)}
          help="Unique $25-paid strategy-call bookings, counted once per booking regardless of reschedules." href={`/explore/booked?days=${days}`} />
        <Stat label="Calls taken" value={num(k.taken)} href={`/explore/taken?days=${days}`}
          help="Appointment slots that actually happened, by event start date." />
        <Stat label="Deals won" value={num(k.deals_won)} tone="good" href={`/explore/deals?days=${days}`}
          help="Opportunities marked Won (PIF or payment plan), by deal close date." />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-5">
        <Stat label="Show rate" value={pct(showRate)} tone={showRate >= 0.7 ? "good" : showRate >= 0.5 ? "warn" : "bad"} href={`/explore/no_shows?days=${days}`}
          help="Taken / (taken + no-shows), on slots that reached their time." />
        <Stat label="Close rate (on taken)" value={pct(closeRate)} tone={closeRate >= 0.25 ? "good" : "warn"} href={`/explore/deals?days=${days}`}
          help="Deals won / calls taken. The closer-facing variant." />
        <Stat label="Close rate (on calendar)" value={pct(closeRateCalendar)} href={`/explore/deals?days=${days}`}
          help="Deals won / all bookings on the calendar including no-shows — the leadership variant; the closer variant divides by taken calls only." />
        <Stat label="Booked-to-taken" value={pct(bookedToTaken)} tone={bookedToTaken >= 0.5 ? "good" : "bad"} href={`/explore/booked?days=${days}`}
          help="Of all bookings, how many have had their call actually happen. THE bottleneck metric." />
        <Stat label="Reschedules" value={num(k.reschedules)} tone="warn" href={`/explore/reschedules?days=${days}`}
          help="Appointment slots moved to a new time (each move counts once)." />
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Cash collected" value={money(k.cash_collected_minor)}
          help="Gross program payments (NMI), excluding the $25 booking fees, before reversals." href={`/explore/cash?days=${days}`} />
        <Stat label="Net of reversals" value={money(netCash)} tone={Number(k.reversals_minor) > 0 ? "warn" : "good"} href={`/explore/cash?days=${days}`}
          help="Cash collected minus refunds and chargebacks." />
        <Stat label="Booked revenue" value={money(k.booked_revenue_minor)} href={`/explore/deals?days=${days}`}
          help="Total contract value of deals won (excludes refunded deals)." />
        <Stat label="Ad spend / ROAS" value={`${money(k.ad_spend_minor)} / ${roas.toFixed(1)}x`} href={`/explore/adspend?days=${days}`}
          help="Meta spend, and net cash collected divided by spend." />
      </div>

      <SectionTitle>Daily activity</SectionTitle>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        <Card>
          <div className="mb-2 text-xs" style={{ color: "var(--muted)" }}>Leads per day</div>
          <MiniBars data={series.map((d: any) => Number(d.leads))} labels={dayLabels} />
        </Card>
        <Card>
          <div className="mb-2 text-xs" style={{ color: "var(--muted)" }}>Calls booked vs taken per day</div>
          <MiniBars data={series.map((d: any) => Number(d.booked))} labels={dayLabels} color="var(--accent)" height={28} />
          <MiniBars data={series.map((d: any) => Number(d.taken))} labels={dayLabels} color="var(--good)" height={28} />
        </Card>
        <Card>
          <div className="mb-2 text-xs" style={{ color: "var(--muted)" }}>Cash collected per day</div>
          <MiniBars data={series.map((d: any) => Number(d.cash_minor))} labels={dayLabels} color="var(--good)" />
        </Card>
      </div>
    </div>
  );
}
