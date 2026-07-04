import Link from "next/link";
import { weeklySnapshot, pipelineValue, projected30d } from "@/lib/kpi-closer";
import { isDemoMode, reportTimezone } from "@/lib/settings";
import { money, num, pct } from "@/lib/format";
import { Card, Stat, SectionTitle, Badge, InfoTip } from "@/components/ui";
import { requireAccess } from "@/lib/access";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// week_start is a plain date (YYYY-MM-DD) — format in UTC so the day never shifts.
const dayLabel = (d: string | Date) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function DeltaChip({ cur, prev }: { cur: number; prev: number }) {
  if (prev === 0 && cur === 0) return <Badge tone="neutral">—</Badge>;
  if (prev === 0) return <Badge tone="good">new</Badge>;
  const d = (cur - prev) / prev;
  const tone = cur > prev ? "good" : cur < prev ? "bad" : "neutral";
  return <Badge tone={tone}>{`${d >= 0 ? "+" : ""}${pct(d, 0)}`}</Badge>;
}

export default async function Weekly({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireAccess("overview");
  const demo = await isDemoMode();
  const tz = await reportTimezone();
  const { days: daysRaw } = await searchParams;
  const days = Math.min(Math.max(parseInt(daysRaw ?? "30", 10) || 30, 1), 365);
  const [snap, pipeline, projected] = await Promise.all([
    weeklySnapshot({ demo, tz }),
    pipelineValue(demo),
    projected30d(demo),
  ]);

  const weekStart = new Date(`${String(snap.weekStart).slice(0, 10)}T00:00:00Z`);
  const prevWeekStart = new Date(weekStart.getTime() - 7 * 86400000);
  const c = snap.current;
  const p = snap.previous;

  const rows: { label: string; cur: number; prev: number; fmt: (v: number) => string; href: string; help: string }[] = [
    { label: "Leads", cur: c.leads, prev: p.leads, fmt: num, href: `/explore/leads?days=${days}`,
      help: "Unique lead-form opt-ins by submission date. A returning lead re-counts only after 30 days." },
    { label: "Bookings", cur: c.bookings, prev: p.bookings, fmt: num, href: `/explore/booked?days=${days}`,
      help: "Unique paid strategy-call bookings whose current slot falls in the week — counted once regardless of reschedules." },
    { label: "Calls taken", cur: c.taken, prev: p.taken, fmt: num, href: `/explore/taken?days=${days}`,
      help: "Strategy-call slots that actually happened, by event start time." },
    { label: "Closed", cur: c.closed, prev: p.closed, fmt: num, href: `/explore/deals?days=${days}`,
      help: "Deals won by deal close date. Refunded deals are excluded." },
    { label: "Invoiced", cur: c.invoicedMinor, prev: p.invoicedMinor, fmt: money, href: `/explore/deals?days=${days}`,
      help: "Total contract value of the deals closed that week — signed, not necessarily collected." },
    { label: "Cash collected", cur: c.cashMinor, prev: p.cashMinor, fmt: money, href: `/explore/cash?days=${days}`,
      help: "Gross program payments (NMI) received that week, excluding the $25 booking fees, before reversals." },
  ];

  return (
    <div>
      <h1 className="text-xl font-semibold">Weekly Snapshot</h1>
      <p className="mb-6 text-sm" style={{ color: "var(--muted)" }}>Week starts Monday, {tz}.</p>

      <SectionTitle>This week vs last week</SectionTitle>
      <Card>
        <table>
          <thead>
            <tr>
              <th>Metric</th>
              <th className="text-right">This week <span className="font-normal">(from {dayLabel(weekStart)})</span></th>
              <th className="text-right">Last week <span className="font-normal">(from {dayLabel(prevWeekStart)})</span></th>
              <th className="text-right">Change <InfoTip text="This week vs last week. Last week is complete; this week is still filling in — expect it to run behind until Sunday night." /></th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.label}>
                <td>
                  <span className="flex items-center gap-1.5">
                    <Link href={r.href} style={{ color: "var(--accent)" }}>{r.label}</Link>
                    <InfoTip text={r.help} />
                  </span>
                </td>
                <td className="text-right font-semibold">{r.fmt(r.cur)}</td>
                <td className="text-right" style={{ color: "var(--muted)" }}>{r.fmt(r.prev)}</td>
                <td className="text-right"><DeltaChip cur={r.cur} prev={r.prev} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <SectionTitle>Money on the books</SectionTitle>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Stat label="Pipeline value" value={money(pipeline)} href={`/explore/receivables?arg=open&days=${days}`}
          help="Contracted money not yet collected: scheduled + late + delinquent installments on current plan versions of active deals." />
        <Stat label="Projected 30-day cash" value={money(projected)} tone="good" href={`/explore/receivables?arg=next30&days=${days}`}
          help="Scheduled installments due within the next 30 days on current plan versions." />
      </div>
    </div>
  );
}
