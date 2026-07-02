import Link from "next/link";
import { campaignTable, dailySeries, overviewKpis } from "@/lib/kpi";
import { isDemoMode, reportTimezone } from "@/lib/settings";
import { money, num, pct } from "@/lib/format";
import { Card, Stat, SectionTitle, MiniBars } from "@/components/ui";
import { RangePicker } from "@/components/range-picker";
import { requireAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function Marketing({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireAccess("marketing");
  const demo = await isDemoMode();
  const tz = await reportTimezone();
  const { days: daysRaw } = await searchParams;
  const days = Math.min(Math.max(parseInt(daysRaw ?? "30", 10) || 30, 7), 365);
  const p = { demo, days, tz };
  const [campaigns, series, k] = await Promise.all([campaignTable(p), dailySeries(p), overviewKpis(p)]);

  const spend = Number(k.ad_spend_minor);
  const leads = Number(k.leads);
  const booked = Number(k.booked);
  const netCash = Number(k.cash_collected_minor) - Number(k.reversals_minor);

  return (
    <div>
      <h1 className="text-xl font-semibold">Marketing</h1>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Last {days} days. Spend restates for 48h — yesterday's numbers can shift slightly.
        </p>
        <RangePicker />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Ad spend" value={money(spend)} href={`/explore/adspend?days=${days}`} />
        <Stat label="Cost per lead" value={leads ? money(Math.round(spend / leads)) : "—"} href={`/explore/leads?days=${days}`}
          help="Spend / unique opt-ins (our count, not Meta's)." />
        <Stat label="Cost per booked call" value={booked ? money(Math.round(spend / booked)) : "—"} href={`/explore/booked?days=${days}`}
          help="Spend / unique bookings on booking calendars. The number that matters most before close rate." />
        <Stat label="ROAS (net cash)" value={spend ? `${(netCash / spend).toFixed(2)}x` : "—"}
          tone={spend && netCash / spend >= 2 ? "good" : "warn"} href={`/explore/cash?days=${days}`}
          help="Net cash collected / ad spend, same window. Cash-basis, not booked revenue." />
      </div>

      <SectionTitle>Spend per day</SectionTitle>
      <Card href={`/explore/adspend?days=${days}`}>
        <MiniBars data={series.map((d: any) => Number(d.spend_minor))}
          labels={series.map((d: any) => new Date(d.day).toLocaleDateString("en-US", { month: "short", day: "numeric" }))} />
      </Card>

      <SectionTitle>Campaigns</SectionTitle>
      <Card>
        <table>
          <thead>
            <tr><th>Campaign</th><th className="text-right">Spend</th><th className="text-right">Meta leads</th>
            <th className="text-right">CPL (Meta)</th><th className="text-right">Clicks</th><th className="text-right">Impressions</th></tr>
          </thead>
          <tbody>
            {campaigns.map((c: any) => (
              <tr key={c.campaign_name}>
                <td>
                  <Link href={`/explore/adspend?arg=${encodeURIComponent(c.campaign_name)}&days=${days}`} style={{ color: "var(--accent)" }}>
                    {c.campaign_name}
                  </Link>
                </td>
                <td className="text-right">{money(c.spend_minor)}</td>
                <td className="text-right">{num(c.meta_leads)}</td>
                <td className="text-right">{c.cpl_minor ? money(c.cpl_minor) : "—"}</td>
                <td className="text-right">{num(c.clicks)}</td>
                <td className="text-right">{num(c.impressions)}</td>
              </tr>
            ))}
            {campaigns.length === 0 && <tr><td colSpan={6} style={{ color: "var(--muted)" }}>No spend data — connect Meta in Connections</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
