import Link from "next/link";
import { dailySeries, overviewKpis } from "@/lib/kpi";
import { campaignFunnel } from "@/lib/kpi-campaign";
import { isDemoMode, reportTimezone } from "@/lib/settings";
import { money, num } from "@/lib/format";
import { Card, Stat, SectionTitle, InfoTip } from "@/components/ui";
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
    campaignFunnel({ demo, days, since: range.since, until }),
    dailySeries({ demo, days, tz, from: range.from, to: range.to }),
    overviewKpis({ demo, days, tz, since: range.since, until }),
  ]);

  const spend = Number(k.ad_spend_minor);
  const leads = Number(k.leads);
  const booked = Number(k.booked);
  const netCash = Number(k.cash_collected_minor) - Number(k.reversals_minor);

  const spendSeries = series.map((d: any) => Number(d.spend_minor) / 100);
  const dayLabels = series.map((d: any) => new Date(d.day).toLocaleDateString("en-US", { month: "short", day: "numeric" }));
  const withSpend = campaigns.filter((c: any) => Number(c.spend_minor) > 0);
  const campaignDonut = (withSpend.length ? withSpend : campaigns).slice(0, 6)
    .map((c: any) => ({ label: c.campaign, value: Math.round(Number(c.spend_minor) / 100) || Number(c.leads) }));

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

      <SectionTitle>Campaign Performance</SectionTitle>
      <p className="mb-2 text-xs" style={{ color: "var(--muted)" }}>
        One row per UTM campaign, joining Meta spend to our funnel. Populates as GHL form opt-ins (with UTMs) and Meta connect.
      </p>
      <Card>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Campaign</th>
                <th className="text-right">Spend</th>
                <th className="text-right">Clicks</th>
                <th className="text-right">Leads</th>
                <th className="text-right">CPL <InfoTip text="Spend / leads from this campaign" /></th>
                <th className="text-right">Booked</th>
                <th className="text-right">Won</th>
                <th className="text-right">CPA <InfoTip text="Spend / deals won" /></th>
                <th className="text-right">Cash</th>
                <th className="text-right">ROAS <InfoTip text="Cash collected / spend" /></th>
              </tr>
            </thead>
            <tbody>
              {campaigns.map((c: any) => {
                const sp = Number(c.spend_minor), ld = Number(c.leads), wn = Number(c.won), csh = Number(c.cash_minor);
                return (
                  <tr key={c.campaign}>
                    <td>
                      <Link href={`/explore/adspend?arg=${encodeURIComponent(c.campaign)}&${rq}`} style={{ color: "var(--accent)" }}>{c.campaign}</Link>
                    </td>
                    <td className="text-right">{sp ? money(sp) : "—"}</td>
                    <td className="text-right">{Number(c.clicks) ? num(c.clicks) : "—"}</td>
                    <td className="text-right">{num(ld)}</td>
                    <td className="text-right">{sp && ld ? money(Math.round(sp / ld)) : "—"}</td>
                    <td className="text-right">{num(c.booked)}</td>
                    <td className="text-right">{num(wn)}</td>
                    <td className="text-right">{sp && wn ? money(Math.round(sp / wn)) : "—"}</td>
                    <td className="text-right">{csh ? money(csh) : "—"}</td>
                    <td className="text-right" style={sp && csh / sp >= 2 ? { color: "var(--good)" } : undefined}>
                      {sp ? `${(csh / sp).toFixed(2)}x` : "—"}
                    </td>
                  </tr>
                );
              })}
              {campaigns.length === 0 && <tr><td colSpan={10} style={{ color: "var(--muted)" }}>No campaign data yet — connect GHL forms (for UTMs) and Meta in Connections</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
