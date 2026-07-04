import Link from "next/link";
import { campaignTable, dailySeries, overviewKpis } from "@/lib/kpi";
import { isDemoMode, reportTimezone } from "@/lib/settings";
import { money, num } from "@/lib/format";
import { Card, Stat, SectionTitle } from "@/components/ui";
import { DateRangeBar } from "@/components/date-range";
import { LineChart, DonutChart } from "@/components/charts";
import { resolveRange } from "@/lib/range";
import { requireAccess } from "@/lib/access";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function Marketing({ searchParams }: { searchParams: Promise<{ days?: string; from?: string; to?: string }> }) {
  await requireAccess("marketing");
  const demo = await isDemoMode();
  const tz = await reportTimezone();
  const range = resolveRange(await searchParams);
  const days = range.days;
  const until = range.custom ? range.until : null;
  const rq = range.custom ? `from=${range.from}&to=${range.to}` : `days=${days}`;
  const [campaigns, series, k] = await Promise.all([
    campaignTable({ demo, days }),
    dailySeries({ demo, days, tz, from: range.from, to: range.to }),
    overviewKpis({ demo, days, tz, since: range.since, until }),
  ]);

  const spend = Number(k.ad_spend_minor);
  const leads = Number(k.leads);
  const booked = Number(k.booked);
  const netCash = Number(k.cash_collected_minor) - Number(k.reversals_minor);

  const spendSeries = series.map((d: any) => Number(d.spend_minor) / 100);
  const dayLabels = series.map((d: any) => new Date(d.day).toLocaleDateString("en-US", { month: "short", day: "numeric" }));
  const campaignDonut = campaigns.slice(0, 6).map((c: any) => ({ label: c.campaign_name, value: Math.round(Number(c.spend_minor) / 100) }));

  return (
    <div>
      <h1 className="text-xl font-semibold">Meta Ads</h1>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {range.label}. Spend restates for 48h — yesterday's numbers can shift slightly.
        </p>
        <DateRangeBar />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Ad spend" value={money(spend)} href={`/explore/adspend?${rq}`} />
        <Stat label="Cost per lead" value={leads ? money(Math.round(spend / leads)) : "—"} href={`/explore/leads?${rq}`}
          help="Spend / unique opt-ins (our count, not Meta's)." />
        <Stat label="Cost per booked call" value={booked ? money(Math.round(spend / booked)) : "—"} href={`/explore/booked?${rq}`}
          help="Spend / unique bookings on booking calendars. The number that matters most before close rate." />
        <Stat label="ROAS (net cash)" value={spend ? `${(netCash / spend).toFixed(2)}x` : "—"}
          tone={spend && netCash / spend >= 2 ? "good" : "warn"} href={`/explore/cash?${rq}`}
          help="Net cash collected / ad spend, same window. Cash-basis, not booked revenue." />
      </div>

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div>
          <SectionTitle>Spend trend</SectionTitle>
          <Card href={`/explore/adspend?${rq}`}>
            <LineChart series={[{ label: "Spend ($)", points: spendSeries }]} labels={dayLabels} height={170} />
          </Card>
        </div>
        <div>
          <SectionTitle>Spend by campaign</SectionTitle>
          <Card>
            <DonutChart data={campaignDonut} centerValue={money(spend)} centerLabel="total" />
          </Card>
        </div>
      </div>

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
                  <Link href={`/explore/adspend?arg=${encodeURIComponent(c.campaign_name)}&${rq}`} style={{ color: "var(--accent)" }}>
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
            {campaigns.length === 0 && <tr><td colSpan={6} style={{ color: "var(--muted)" }}>No spend data yet — connect Meta in Connections</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
