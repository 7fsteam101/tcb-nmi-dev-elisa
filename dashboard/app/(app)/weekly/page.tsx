import Link from "next/link";
import { weeklySnapshot, pipelineValue, projected30d } from "@/lib/kpi-closer";
import { periodSeries, reasonSeries, asGrain, bucketLabel, type Grain } from "@/lib/kpi-weekly";
import { isDemoMode, reportTimezone } from "@/lib/settings";
import { money, num, pct } from "@/lib/format";
import { Card, Stat, SectionTitle, Badge, InfoTip } from "@/components/ui";
import { BarChart, GroupedBars } from "@/components/charts";
import { GranularityToggle } from "@/components/granularity";
import { DateRangeBar } from "@/components/date-range";
import { ReasonMultiSelect } from "@/components/reason-multiselect";
import { resolveRange } from "@/lib/range";
import { requireAccess } from "@/lib/access";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// How many buckets the "vs previous periods" bar charts span.
const PERIODS = 8;

// Distinct grain wording so the copy reads right for day / week / month.
const GRAIN_NOUN: Record<Grain, string> = { day: "day", week: "week", month: "month" };
const GRAIN_ADJ: Record<Grain, string> = { day: "daily", week: "weekly", month: "monthly" };

// week_start is a plain date (YYYY-MM-DD); format in UTC so the day never shifts.
const dayLabel = (d: string | Date) =>
  new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });

function DeltaChip({ cur, prev }: { cur: number; prev: number }) {
  if (prev === 0 && cur === 0) return <Badge tone="neutral">no change</Badge>;
  if (prev === 0) return <Badge tone="good">new</Badge>;
  const d = (cur - prev) / prev;
  const tone = cur > prev ? "good" : cur < prev ? "bad" : "neutral";
  return <Badge tone={tone}>{`${d >= 0 ? "+" : ""}${pct(d, 0)}`}</Badge>;
}

// A small labelled bar-chart tile for one rate metric across the last N periods.
function RateTile({
  title,
  help,
  rows,
  color,
}: {
  title: string;
  help: string;
  rows: { label: string; value: number }[];
  color: string;
}) {
  const last = rows.length ? rows[rows.length - 1].value : 0;
  const prev = rows.length > 1 ? rows[rows.length - 2].value : 0;
  return (
    <Card>
      <div className="mb-2 flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--muted)" }}>
          {title}
          <InfoTip text={help} />
        </div>
        <div className="flex items-center gap-2">
          <span className="text-sm font-semibold tabular-nums">{pct(last, 0)}</span>
          <DeltaChip cur={last} prev={prev} />
        </div>
      </div>
      <BarChart data={rows} height={130} color={color} format={(v) => pct(v, 0)} />
    </Card>
  );
}

const REASON_COLORS = ["#4f8ef7", "#34d399", "#fbbf24", "#f87171", "#a78bfa", "#22d3ee", "#f472b6", "#94a3b8"];

export default async function Weekly({
  searchParams,
}: {
  searchParams: Promise<{
    days?: string;
    from?: string;
    to?: string;
    grain?: string;
    cancelReasons?: string;
    reschedReasons?: string;
  }>;
}) {
  await requireAccess("overview");
  const sp = await searchParams;
  const demo = await isDemoMode();
  const tz = await reportTimezone();
  const grain = asGrain(sp.grain);
  const days = resolveRange(sp).days;

  // Batch 1: the four core analytics queries (<= 4 concurrent, free-tier pooler).
  const [snap, series, cancelReasonData, reschedReasonData] = await Promise.all([
    weeklySnapshot({ demo, tz }),
    periodSeries({ demo, grain, periods: PERIODS, tz }),
    reasonSeries({ demo, grain, periods: PERIODS, tz, kind: "cancellation" }),
    reasonSeries({ demo, grain, periods: PERIODS, tz, kind: "reschedule" }),
  ]);
  // Batch 2: money-on-the-books tiles (2 concurrent).
  const [pipeline, projected] = await Promise.all([pipelineValue(demo), projected30d(demo)]);

  const weekStart = new Date(`${String(snap.weekStart).slice(0, 10)}T00:00:00Z`);
  const prevWeekStart = new Date(weekStart.getTime() - 7 * 86400000);
  const c = snap.current;
  const p = snap.previous;

  const kpiRows: { label: string; cur: number; prev: number; fmt: (v: number) => string; href: string; help: string }[] = [
    { label: "Leads", cur: c.leads, prev: p.leads, fmt: num, href: `/explore/leads?days=${days}`,
      help: "Unique lead-form opt-ins by submission date. A returning lead re-counts only after 30 days." },
    { label: "Bookings", cur: c.bookings, prev: p.bookings, fmt: num, href: `/explore/booked?days=${days}`,
      help: "Unique paid strategy-call bookings whose current slot falls in the week, counted once regardless of reschedules." },
    { label: "Calls taken", cur: c.taken, prev: p.taken, fmt: num, href: `/explore/taken?days=${days}`,
      help: "Strategy-call slots that actually happened, by event start time." },
    { label: "Closed", cur: c.closed, prev: p.closed, fmt: num, href: `/explore/deals?days=${days}`,
      help: "Deals won by deal close date. Refunded deals are excluded." },
    { label: "Invoiced", cur: c.invoicedMinor, prev: p.invoicedMinor, fmt: money, href: `/explore/deals?days=${days}`,
      help: "Total contract value of the deals closed that week, signed, not necessarily collected." },
    { label: "Cash collected", cur: c.cashMinor, prev: p.cashMinor, fmt: money, href: `/explore/cash?days=${days}`,
      help: "Gross program payments (NMI) received that week, excluding the $25 booking fees, before reversals." },
  ];

  // Bar-chart rows per rate, labelled by the bucket start.
  const barRows = (pick: (r: (typeof series)[number]) => number) =>
    series.map((r) => ({ label: bucketLabel(r.bucket, grain), value: pick(r) }));

  const closeRows = barRows((r) => r.close_rate);
  const showRows = barRows((r) => r.show_rate);
  const cancelRows = barRows((r) => r.cancel_rate);
  const reschedRows = barRows((r) => r.reschedule_rate);

  const periodLabels = series.map((r) => bucketLabel(r.bucket, grain));
  const noun = GRAIN_NOUN[grain];
  const adj = GRAIN_ADJ[grain];

  // Build GroupedBars series for a reason comparison: selected reasons plus a
  // Total bar. With nothing selected, Total only. Selection comes from the URL
  // param the multi-select writes (already URL-decoded when read here).
  const buildReasonSeries = (data: Awaited<ReturnType<typeof reasonSeries>>, raw: string | undefined) => {
    const selected = (raw ?? "")
      .split(",")
      .map((s) => s.trim())
      .filter(Boolean)
      .map((s) => decodeURIComponent(s));
    const chosen = selected
      .map((name, i) => {
        const found = data.reasons.find((r) => r.name === name);
        return found ? { label: found.name, color: REASON_COLORS[i % REASON_COLORS.length], values: found.values } : null;
      })
      .filter((x): x is { label: string; color: string; values: number[] } => x != null);
    const total = { label: "Total", color: "#e7edf7", values: data.totals };
    return chosen.length ? [...chosen, total] : [total];
  };

  const cancelSeries = buildReasonSeries(cancelReasonData, sp.cancelReasons);
  const reschedSeries = buildReasonSeries(reschedReasonData, sp.reschedReasons);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Weekly Snapshot</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Week starts Monday, {tz}. Trend charts group by {noun}, last {PERIODS} {noun === "day" ? "days" : `${noun}s`}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <GranularityToggle param="grain" defaultGrain="week" />
          <DateRangeBar />
        </div>
      </div>

      <SectionTitle>This week vs last week</SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {kpiRows.map((r) => (
          <Card key={r.label} href={r.href} className="!p-3">
            <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--muted)" }}>
              {r.label}
              <InfoTip text={r.help} />
            </div>
            <div className="mt-1 text-xl font-semibold tracking-tight">{r.fmt(r.cur)}</div>
            <div className="mt-1 flex items-center gap-1.5">
              <DeltaChip cur={r.cur} prev={r.prev} />
              <span className="text-[11px]" style={{ color: "var(--muted)" }}>
                was {r.fmt(r.prev)}
              </span>
            </div>
          </Card>
        ))}
      </div>
      <p className="mt-2 text-[11px]" style={{ color: "var(--muted)" }}>
        This week (from {dayLabel(weekStart)}) vs last week (from {dayLabel(prevWeekStart)}). Last week is complete;
        this week is still filling in, so expect it to run behind until Sunday night.
      </p>

      <SectionTitle>Close rate trend</SectionTitle>
      <Card>
        <div className="mb-2 flex items-center gap-1.5 text-xs" style={{ color: "var(--muted)" }}>
          Deals won / calls taken, by {noun} ({adj})
          <InfoTip text={`Close rate = deals won divided by calls taken in each ${noun}. The most recent ${noun} is highlighted.`} />
        </div>
        <BarChart data={closeRows} height={200} color="#34d399" format={(v) => pct(v, 0)} />
      </Card>

      <SectionTitle>Conversion and leakage rates</SectionTitle>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <RateTile
          title={`Show rate (${adj})`}
          help={`Taken / (taken + no-shows) per ${noun}, on slots that reached their time.`}
          rows={showRows}
          color="#4f8ef7"
        />
        <RateTile
          title={`Close rate (${adj})`}
          help={`Deals won / calls taken per ${noun}.`}
          rows={closeRows}
          color="#34d399"
        />
        <RateTile
          title={`Cancel rate (${adj})`}
          help={`Cancelled slots (by lead or team) as a share of bookings in each ${noun}.`}
          rows={cancelRows}
          color="#f87171"
        />
        <RateTile
          title={`Reschedule rate (${adj})`}
          help={`Rescheduled slots as a share of bookings in each ${noun}.`}
          rows={reschedRows}
          color="#fbbf24"
        />
      </div>

      <SectionTitle
        right={
          <ReasonMultiSelect param="cancelReasons" options={cancelReasonData.reasons.map((r) => r.name)} label="Compare" />
        }
      >
        Compare cancellation reasons
      </SectionTitle>
      <Card>
        <div className="mb-3 flex items-center gap-1.5 text-xs" style={{ color: "var(--muted)" }}>
          Cancellations by reason across the last {PERIODS} {noun === "day" ? "days" : `${noun}s`}
          <InfoTip text="Pick one or more reasons to compare them side by side against the Total. With none selected, only the Total is shown." />
        </div>
        <GroupedBars periods={periodLabels} series={cancelSeries} height={220} />
      </Card>

      <SectionTitle
        right={
          <ReasonMultiSelect param="reschedReasons" options={reschedReasonData.reasons.map((r) => r.name)} label="Compare" />
        }
      >
        Compare reschedule reasons
      </SectionTitle>
      <Card>
        <div className="mb-3 flex items-center gap-1.5 text-xs" style={{ color: "var(--muted)" }}>
          Reschedules by reason across the last {PERIODS} {noun === "day" ? "days" : `${noun}s`}
          <InfoTip text="Pick one or more reasons to compare them side by side against the Total. With none selected, only the Total is shown." />
        </div>
        <GroupedBars periods={periodLabels} series={reschedSeries} height={220} />
      </Card>

      <SectionTitle>Money on the books</SectionTitle>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Stat
          label="Pipeline value"
          value={money(pipeline)}
          href={`/explore/receivables?arg=open&days=${days}`}
          help="Contracted money not yet collected: scheduled + late + delinquent installments on current plan versions of active deals."
        />
        <Stat
          label="Projected 30-day cash"
          value={money(projected)}
          tone="good"
          href={`/explore/receivables?arg=next30&days=${days}`}
          help="Scheduled installments due within the next 30 days on current plan versions."
        />
      </div>
    </div>
  );
}
