import { pipelineValue, projected30d } from "@/lib/kpi-closer";
import { overviewComparison } from "@/lib/kpi-series";
import { periodSeries, reasonSeries, bucketLabel, type Grain } from "@/lib/kpi-weekly";
import { isDemoMode, reportTimezone } from "@/lib/settings";
import { money, num, pct } from "@/lib/format";
import { Card, Stat, SectionTitle, Badge, InfoTip } from "@/components/ui";
import { BarChart, GroupedBars } from "@/components/charts";
import { GranularityTabs } from "./granularity-tabs";
import { DateRangeBar } from "@/components/date-range";
import { ReasonMultiSelect } from "@/components/reason-multiselect";
import { resolveRange } from "@/lib/range";
import { requireAccess } from "@/lib/access";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// How many buckets the "vs previous periods" bar charts span.
const PERIODS = 8;

// Report granularity: what the tabs select and the comparison section compares.
type G = "day" | "week" | "month" | "quarter" | "year";
const asG = (v: string | undefined): G =>
  v === "day" || v === "month" || v === "quarter" || v === "year" ? v : "week";

// Comparison copy per granularity: section title, period names, and the
// "previous period is complete" note.
const CMP: Record<G, { title: string; cur: string; prev: string; tail: string }> = {
  day: { title: "Today vs yesterday", cur: "Today", prev: "yesterday", tail: "Yesterday is complete; today is still filling in." },
  week: { title: "This week vs last week", cur: "This week", prev: "last week", tail: "Last week is complete; this week is still filling in, so expect it to run behind until Sunday night." },
  month: { title: "This month vs last month", cur: "This month", prev: "last month", tail: "Last month is complete; this month is still filling in." },
  quarter: { title: "This quarter vs last quarter", cur: "This quarter", prev: "last quarter", tail: "Last quarter is complete; this quarter is still filling in." },
  year: { title: "This year vs last year", cur: "This year", prev: "last year", tail: "Last year is complete; this year is still filling in." },
};

// Distinct grain wording so the chart copy reads right for day / week / month.
const GRAIN_NOUN: Record<Grain, string> = { day: "day", week: "week", month: "month" };
const GRAIN_ADJ: Record<Grain, string> = { day: "daily", week: "weekly", month: "monthly" };

// ---- Report-timezone period windows -----------------------------------------
// The comparison compares the CURRENT calendar period against the PREVIOUS one
// of the same granularity (today vs yesterday, this month vs last month, ...).
// Bucket starts are calendar dates in the report timezone; each start is then
// converted to the exact UTC instant of local midnight so the timestamptz
// bounds in overviewComparison line up with the tz-date bucketing the rest of
// the report uses. Weeks start Monday, matching Postgres date_trunc('week').

/** Calendar date (y, m 1-12, d) of `now` in the given timezone. */
function tzToday(now: Date, tz: string): { y: number; m: number; d: number } {
  const s = new Intl.DateTimeFormat("en-CA", { timeZone: tz, year: "numeric", month: "2-digit", day: "2-digit" }).format(now);
  const [y, m, d] = s.split("-").map(Number);
  return { y, m, d };
}

/** Milliseconds the timezone is ahead of UTC at the given instant. */
function tzOffsetMs(at: Date, tz: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz, hourCycle: "h23",
    year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit",
  }).formatToParts(at);
  const p: Record<string, string> = {};
  for (const x of parts) if (x.type !== "literal") p[x.type] = x.value;
  const asUtc = Date.UTC(+p.year, +p.month - 1, +p.day, +p.hour, +p.minute, +p.second);
  return asUtc - at.getTime();
}

/** The UTC instant of local midnight on (y, m, d) in the timezone. Two offset
 *  passes so dates on either side of a DST switch resolve correctly. */
function zonedMidnight(y: number, m: number, d: number, tz: string): Date {
  const naive = Date.UTC(y, m - 1, d);
  let ts = naive - tzOffsetMs(new Date(naive), tz);
  ts = naive - tzOffsetMs(new Date(ts), tz);
  return new Date(ts);
}

/** [curStart, curEnd) and prevStart for the granularity, as UTC instants of the
 *  period boundaries in the report timezone. previous window = [prevStart, curStart). */
function periodWindows(g: G, now: Date, tz: string): { curStart: Date; curEnd: Date; prevStart: Date } {
  const { y, m, d } = tzToday(now, tz);
  // Date.UTC rolls overflowing day/month values, so "month 0" or "day -3" land
  // on the right calendar date; read the parts back out normalized.
  const roll = (yy: number, mm: number, dd: number): [number, number, number] => {
    const t = new Date(Date.UTC(yy, mm - 1, dd));
    return [t.getUTCFullYear(), t.getUTCMonth() + 1, t.getUTCDate()];
  };
  let cur: [number, number, number], prev: [number, number, number], next: [number, number, number];
  if (g === "day") {
    cur = roll(y, m, d); prev = roll(y, m, d - 1); next = roll(y, m, d + 1);
  } else if (g === "week") {
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay(); // 0 = Sunday
    const monday = d - ((dow + 6) % 7);
    cur = roll(y, m, monday); prev = roll(y, m, monday - 7); next = roll(y, m, monday + 7);
  } else if (g === "month") {
    cur = roll(y, m, 1); prev = roll(y, m - 1, 1); next = roll(y, m + 1, 1);
  } else if (g === "quarter") {
    const qm = m - ((m - 1) % 3); // first month of the current quarter
    cur = roll(y, qm, 1); prev = roll(y, qm - 3, 1); next = roll(y, qm + 3, 1);
  } else {
    cur = roll(y, 1, 1); prev = roll(y - 1, 1, 1); next = roll(y + 1, 1, 1);
  }
  return {
    curStart: zonedMidnight(cur[0], cur[1], cur[2], tz),
    curEnd: zonedMidnight(next[0], next[1], next[2], tz),
    prevStart: zonedMidnight(prev[0], prev[1], prev[2], tz),
  };
}

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
          <span className="num text-sm font-semibold">{pct(last, 0)}</span>
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
    g?: string;
    grain?: string;
    cancelReasons?: string;
    reschedReasons?: string;
  }>;
}) {
  await requireAccess("overview");
  const sp = await searchParams;
  const demo = await isDemoMode();
  const tz = await reportTimezone();
  // ?g= from the tabs; ?grain= kept as a legacy fallback for old links.
  const g = asG(sp.g ?? sp.grain);
  const days = resolveRange(sp).days;

  // The trend charts bucket by day/week/month (periodSeries grains); quarter and
  // year fall back to monthly buckets while the comparison tiles above use the
  // true quarter/year windows.
  const chartGrain: Grain = g === "day" ? "day" : g === "week" ? "week" : "month";

  // Current vs previous period of the SAME granularity, boundaries computed in
  // the report timezone.
  const win = periodWindows(g, new Date(), tz);
  const spanDays = Math.max(1, Math.round((win.curEnd.getTime() - win.curStart.getTime()) / 86400000));

  // Batch 1: the heavy analytics queries (<= 4 concurrent, free-tier pooler).
  const [curRow, prevRow, series] = await Promise.all([
    overviewComparison({ demo, days: spanDays, tz, prevSince: win.curStart.toISOString(), prevUpto: win.curEnd.toISOString() }),
    overviewComparison({ demo, days: spanDays, tz, prevSince: win.prevStart.toISOString(), prevUpto: win.curStart.toISOString() }),
    periodSeries({ demo, grain: chartGrain, periods: PERIODS, tz }),
  ]);
  // Batch 2: reason breakdowns (2 concurrent).
  const [cancelReasonData, reschedReasonData] = await Promise.all([
    reasonSeries({ demo, grain: chartGrain, periods: PERIODS, tz, kind: "cancellation" }),
    reasonSeries({ demo, grain: chartGrain, periods: PERIODS, tz, kind: "reschedule" }),
  ]);
  // Batch 3: money-on-the-books tiles (2 concurrent).
  const [pipeline, projected] = await Promise.all([pipelineValue(demo), projected30d(demo)]);

  // The six headline metrics for one window, off the shared overview-comparison row.
  const shape = (r: Awaited<ReturnType<typeof overviewComparison>>) => ({
    leads: Number(r.leads),
    bookings: Number(r.booked),
    taken: Number(r.taken),
    closed: Number(r.deals_won),
    invoicedMinor: Number(r.booked_revenue_minor),
    cashMinor: Number(r.cash_collected_minor),
  });
  const c = shape(curRow);
  const p = shape(prevRow);

  const kpiRows: { label: string; cur: number; prev: number; fmt: (v: number) => string; href: string; help: string }[] = [
    { label: "Leads", cur: c.leads, prev: p.leads, fmt: num, href: `/explore/leads?days=${days}`,
      help: "Unique lead-form opt-ins by submission date. A returning lead re-counts only after 30 days." },
    { label: "Bookings", cur: c.bookings, prev: p.bookings, fmt: num, href: `/explore/booked?days=${days}`,
      help: "Unique paid strategy-call bookings whose current slot falls in the period, counted once regardless of reschedules." },
    { label: "Calls taken", cur: c.taken, prev: p.taken, fmt: num, href: `/explore/taken?days=${days}`,
      help: "Call slots that actually happened, by event start time." },
    { label: "Closed", cur: c.closed, prev: p.closed, fmt: num, href: `/explore/deals?days=${days}`,
      help: "Deals won by deal close date. Refunded deals are excluded." },
    { label: "Invoiced", cur: c.invoicedMinor, prev: p.invoicedMinor, fmt: money, href: `/explore/deals?days=${days}`,
      help: "Total contract value of the deals closed in the period, signed, not necessarily collected." },
    { label: "Cash collected", cur: c.cashMinor, prev: p.cashMinor, fmt: money, href: `/explore/cash?days=${days}`,
      help: "Gross program payments (NMI) received in the period, excluding the $25 booking fees, before reversals." },
  ];

  // Bar-chart rows per rate, labelled by the bucket start.
  const barRows = (pick: (r: (typeof series)[number]) => number) =>
    series.map((r) => ({ label: bucketLabel(r.bucket, chartGrain), value: pick(r) }));

  const closeRows = barRows((r) => r.close_rate);
  const showRows = barRows((r) => r.show_rate);
  const cancelRows = barRows((r) => r.cancel_rate);
  const reschedRows = barRows((r) => r.reschedule_rate);

  const periodLabels = series.map((r) => bucketLabel(r.bucket, chartGrain));
  const noun = GRAIN_NOUN[chartGrain];
  const adj = GRAIN_ADJ[chartGrain];

  // Period-start labels for the comparison note, in the report timezone. Quarter
  // and year spell out the year since the previous period usually crosses one.
  const withYear = g === "quarter" || g === "year";
  const fmtDay = (d: Date) =>
    d.toLocaleDateString("en-US", withYear
      ? { month: "short", day: "numeric", year: "numeric", timeZone: tz }
      : { month: "short", day: "numeric", timeZone: tz });
  const cmpNote = g === "day"
    ? `Today (${fmtDay(win.curStart)}) vs yesterday (${fmtDay(win.prevStart)}). ${CMP[g].tail}`
    : `${CMP[g].cur} (from ${fmtDay(win.curStart)}) vs ${CMP[g].prev} (from ${fmtDay(win.prevStart)}). ${CMP[g].tail}`;

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
      <div className="mb-4">
        <h1 className="text-xl font-semibold">Performance Report</h1>
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Trends grouped by {noun}, last {PERIODS} {noun === "day" ? "days" : `${noun}s`}. Times in {tz}.
        </p>
      </div>

      <GranularityTabs active={g} />
      <div className="mb-6 mt-3 flex flex-wrap items-center justify-end gap-2">
        <DateRangeBar />
      </div>

      <SectionTitle>{CMP[g].title}</SectionTitle>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {kpiRows.map((r) => (
          <Card key={r.label} href={r.href} className="!p-3">
            <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--muted)" }}>
              {r.label}
              <InfoTip text={r.help} />
            </div>
            <div className="num mt-1 text-xl font-semibold tracking-tight">{r.fmt(r.cur)}</div>
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
        {cmpNote}
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
