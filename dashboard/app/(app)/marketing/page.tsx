import Link from "next/link";
import { dailySeries, overviewKpis } from "@/lib/kpi";
import { campaignFunnel, metaReport, normalizeGrain, leadsBySource, bookedBySource } from "@/lib/kpi-campaign";
import { isDemoMode, reportTimezone } from "@/lib/settings";
import { money, num, pct } from "@/lib/format";
import { label, Card, Stat, SectionTitle, InfoTip } from "@/components/ui";
import { DateRangeBar } from "@/components/date-range";
import { GranularityToggle } from "@/components/granularity";
import { LineChart, DonutChart, BarChart, HBarList } from "@/components/charts";
import { resolveRange } from "@/lib/range";
import { requireAccess } from "@/lib/access";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function Marketing({ searchParams }: { searchParams: Promise<{ days?: string; from?: string; to?: string; grain?: string }> }) {
  await requireAccess("marketing");
  const sp = await searchParams;
  const demo = await isDemoMode();
  const tz = await reportTimezone();
  const range = resolveRange(sp);
  const grain = normalizeGrain(sp.grain);
  const days = range.days;
  const until = range.custom ? range.until : null;
  const rq = range.custom ? `from=${range.from}&to=${range.to}` : `days=${days}`;
  // Batch 1 (<=4 concurrent, matching db.ts max:4). campaignFunnel + overviewKpis
  // each fan out internally but run as a single SQL statement = one connection each.
  const [campaigns, series, k, report] = await Promise.all([
    campaignFunnel({ demo, days, since: range.since, until }),
    dailySeries({ demo, days, tz, from: range.from, to: range.to }),
    overviewKpis({ demo, days, tz, since: range.since, until }),
    metaReport({ demo, grain, since: range.since, until }),
  ]);
  // Batch 2 (2 more single-statement queries) runs after batch 1 resolves, so we
  // never exceed 4 concurrent connections on the pooler.
  const [leadSources, bookedSources] = await Promise.all([
    leadsBySource({ demo, since: range.since, until }),
    bookedBySource({ demo, since: range.since, until }),
  ]);

  const spend = Number(k.ad_spend_minor);
  const leads = Number(k.leads);
  const booked = Number(k.booked);
  const netCash = Number(k.cash_collected_minor) - Number(k.reversals_minor);
  const bookedRevenue = Number(k.booked_revenue_minor);

  // Window totals for CPC / CTR, summed from the report buckets (same window).
  const totalSpend = report.reduce((s: number, r: any) => s + Number(r.spend_minor), 0);
  const totalClicks = report.reduce((s: number, r: any) => s + Number(r.clicks), 0);
  const totalImpr = report.reduce((s: number, r: any) => s + Number(r.impressions), 0);

  const leadSourceRows = leadSources.map((r: any) => ({ label: label(r.source), value: Number(r.leads) }));
  const bookedSourceRows = bookedSources.map((r: any) => ({ label: label(r.source), value: Number(r.booked) }));

  const spendSeries = series.map((d: any) => Number(d.spend_minor) / 100);
  const dayLabels = series.map((d: any) => new Date(d.day).toLocaleDateString("en-US", { month: "short", day: "numeric" }));
  const withSpend = campaigns.filter((c: any) => Number(c.spend_minor) > 0);
  const campaignDonut = (withSpend.length ? withSpend : campaigns).slice(0, 6)
    .map((c: any) => ({ label: c.campaign, value: Math.round(Number(c.spend_minor) / 100) || Number(c.leads) }));

  // Report section: spend / leads / clicks bucketed by the selected grain.
  const bucketLabel = (d: string) => {
    const dt = new Date(String(d) + "T12:00:00");
    if (grain === "month") return dt.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
    return dt.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  };
  const reportRows = report.map((r: any) => ({
    key: String(r.bucket),
    label: grain === "week" ? `wk ${bucketLabel(r.bucket)}` : bucketLabel(r.bucket),
    spend: Number(r.spend_minor),
    leads: Number(r.leads),
    clicks: Number(r.clicks),
    impressions: Number(r.impressions),
  }));
  const spendBars = reportRows.map((r) => ({ label: r.label, value: Math.round(r.spend / 100) }));
  const leadBars = reportRows.map((r) => ({ label: r.label, value: r.leads }));
  const clickBars = reportRows.map((r) => ({ label: r.label, value: r.clicks }));
  const grainWord = label(grain === "day" ? "daily" : grain === "month" ? "monthly" : "weekly");

  return (
    <div>
      <h1 className="text-xl font-semibold">Meta Ads</h1>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {range.label}. Spend restates for 48h — yesterday's numbers can shift slightly.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <GranularityToggle />
          <DateRangeBar />
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-5">
        <Stat label="Ad spend" value={money(spend)} href={`/explore/adspend?${rq}`} />
        <Stat label="Cost per lead" value={leads ? money(Math.round(spend / leads)) : "—"} href={`/explore/leads?${rq}`}
          help="Spend / unique opt-ins (our count, not Meta's)." />
        <Stat label="Cost per booked call" value={booked ? money(Math.round(spend / booked)) : "—"} href={`/explore/booked?${rq}`}
          help="Spend / unique bookings on booking calendars. The number that matters most before close rate." />
        <Stat label="ROAS (net cash)" value={spend ? `${(netCash / spend).toFixed(2)}x` : "—"}
          tone={spend && netCash / spend >= 2 ? "good" : "warn"} href={`/explore/cash?${rq}`}
          help="Net cash collected / ad spend, same window. Cash-basis, not booked revenue." />
        <Stat label="ROAS (invoiced)" value={spend ? `${(bookedRevenue / spend).toFixed(2)}x` : "—"}
          tone={spend && bookedRevenue / spend >= 2 ? "good" : "warn"} href={`/explore/deals?${rq}`}
          help="Booked revenue (won deals' total contract value, non-refunded) / ad spend, same window. Accrual-basis, not cash." />
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

      <div className="mt-4 grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div>
          <SectionTitle>Leads by source</SectionTitle>
          <p className="mb-2 text-xs" style={{ color: "var(--muted)" }}>
            Unique opt-ins in this window, grouped by acquisition channel.
          </p>
          <Card href={`/explore/leads?${rq}`}>
            <HBarList data={leadSourceRows} format={(v) => num(v)} />
          </Card>
        </div>
        <div>
          <SectionTitle>Booked calls by source</SectionTitle>
          <p className="mb-2 text-xs" style={{ color: "var(--muted)" }}>
            Unique strategy-call bookings in this window, by the contact's first-touch channel.
          </p>
          <Card href={`/explore/booked?${rq}`}>
            <HBarList data={bookedSourceRows} format={(v) => num(v)} />
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

      <SectionTitle right={<GranularityToggle />}>Report</SectionTitle>
      <p className="mb-2 text-xs" style={{ color: "var(--muted)" }}>
        Spend, leads and clicks bucketed {grainWord.toLowerCase()}. Switch the grain with the toggle. Populates as Meta connects.
      </p>
      <div className="mb-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Clicks" value={num(totalClicks)} help="Total link clicks in this window (from Meta)." />
        <Stat label="Impressions" value={num(totalImpr)} help="Total ad impressions in this window (from Meta)." />
        <Stat label="CPC" value={totalClicks ? money(Math.round(totalSpend / totalClicks), { cents: true }) : "—"}
          href={`/explore/adspend?${rq}`} help="Cost per click: ad spend / link clicks, same window." />
        <Stat label="CTR" value={totalImpr ? pct(totalClicks / totalImpr, 2) : "—"}
          help="Click-through rate: link clicks / impressions, same window." />
      </div>
      <div className="grid grid-cols-1 gap-3 lg:grid-cols-3">
        <div>
          <div className="mb-2 text-xs font-medium" style={{ color: "var(--muted)" }}>Spend ($)</div>
          <Card><BarChart data={spendBars} color="var(--accent)" format={(v) => money(v * 100)} height={160} /></Card>
        </div>
        <div>
          <div className="mb-2 text-xs font-medium" style={{ color: "var(--muted)" }}>Leads</div>
          <Card><BarChart data={leadBars} color="var(--good)" format={(v) => num(v)} height={160} /></Card>
        </div>
        <div>
          <div className="mb-2 text-xs font-medium" style={{ color: "var(--muted)" }}>Clicks</div>
          <Card><BarChart data={clickBars} color="var(--warn)" format={(v) => num(v)} height={160} /></Card>
        </div>
      </div>

      <Card className="mt-3">
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>{grainWord}</th>
                <th className="text-right">Spend</th>
                <th className="text-right">Leads</th>
                <th className="text-right">Clicks</th>
                <th className="text-right">CPL <InfoTip text="Spend / leads in this bucket" /></th>
                <th className="text-right">CPC <InfoTip text="Spend / clicks in this bucket" /></th>
                <th className="text-right">CTR <InfoTip text="Clicks / impressions in this bucket" /></th>
              </tr>
            </thead>
            <tbody>
              {reportRows.map((r) => (
                <tr key={r.key}>
                  <td>{r.label}</td>
                  <td className="text-right">{r.spend ? money(r.spend) : "—"}</td>
                  <td className="text-right">{r.leads ? num(r.leads) : "—"}</td>
                  <td className="text-right">{r.clicks ? num(r.clicks) : "—"}</td>
                  <td className="text-right">{r.spend && r.leads ? money(Math.round(r.spend / r.leads)) : "—"}</td>
                  <td className="text-right">{r.spend && r.clicks ? money(Math.round(r.spend / r.clicks), { cents: true }) : "—"}</td>
                  <td className="text-right">{r.impressions && r.clicks ? pct(r.clicks / r.impressions, 2) : "—"}</td>
                </tr>
              ))}
              {reportRows.length === 0 && <tr><td colSpan={7} style={{ color: "var(--muted)" }}>No spend in this window yet — connect Meta in Connections</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
