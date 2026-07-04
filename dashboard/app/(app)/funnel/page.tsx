import Link from "next/link";
import { pipelineByStage, leakage, cancellationReasons, dailySeries, objectionBreakdown } from "@/lib/kpi";
import { isDemoMode, reportTimezone } from "@/lib/settings";
import { num, pct } from "@/lib/format";
import { Card, Stat, SectionTitle, MiniBars, Badge, label } from "@/components/ui";
import { DateRangeBar } from "@/components/date-range";
import { DonutChart, HBarList } from "@/components/charts";
import { resolveRange } from "@/lib/range";
import { requireAccess } from "@/lib/access";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function Funnel({ searchParams }: { searchParams: Promise<{ days?: string; from?: string; to?: string }> }) {
  await requireAccess("funnel");
  const demo = await isDemoMode();
  const tz = await reportTimezone();
  const range = resolveRange(await searchParams);
  const days = range.days;
  const until = range.custom ? range.until : null;
  const rq = range.custom ? `from=${range.from}&to=${range.to}` : `days=${days}`;
  const [stages, leak, reasons, series, objections] = await Promise.all([
    pipelineByStage(demo),
    leakage({ demo, days, since: range.since, until }),
    cancellationReasons({ demo, days }),
    dailySeries({ demo, days, tz, from: range.from, to: range.to }),
    objectionBreakdown({ demo, days }),
  ]);
  const bookings = Number(leak.bookings);
  const taken = Number(leak.taken);
  const noShowOnly = Math.max(0, Number(leak.with_no_show) - Number(leak.no_show_recovered));
  const cancelled = Number(leak.cancelled);
  const openStill = Math.max(0, bookings - taken - noShowOnly - cancelled);
  const outcomeSplit = [
    { label: "Taken", value: taken, color: "#34d399" },
    { label: "No-show (lost)", value: noShowOnly, color: "#f87171" },
    { label: "Cancelled", value: cancelled, color: "#fbbf24" },
    { label: "Still upcoming", value: openStill, color: "#4f8ef7" },
  ];
  const stageBars = stages.map((s: any) => ({ label: label(s.stage), value: Number(s.n), href: `/explore/stage?arg=${s.stage}&${rq}` }));

  return (
    <div>
      <h1 className="text-xl font-semibold">Funnel & Leakage</h1>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          {range.label}. The booked-to-taken gap is where the money leaks.
        </p>
        <DateRangeBar />
      </div>

      <div className="mb-4 grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <SectionTitle>What happened to bookings</SectionTitle>
          <Card>
            <DonutChart data={outcomeSplit} centerValue={num(bookings)} centerLabel="bookings" />
          </Card>
        </div>
        <div>
          <SectionTitle>Pipeline by stage</SectionTitle>
          <Card><HBarList data={stageBars} format={(v) => num(v)} /></Card>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Bookings" value={num(leak.bookings)} href={`/explore/booked?${rq}`} help="Unique strategy-call bookings on booking calendars in range." />
        <Stat label="Reached a taken call" value={`${num(leak.taken)} (${pct(bookings ? Number(leak.taken) / bookings : 0)})`}
          tone={bookings && Number(leak.taken) / bookings >= 0.5 ? "good" : "bad"} href={`/explore/taken?${rq}`}
          help="Bookings whose call has actually happened, however many reschedules it took." />
        <Stat label="Rescheduled at least once" value={`${num(leak.with_reschedule)} (${pct(bookings ? Number(leak.with_reschedule) / bookings : 0)})`}
          tone="warn" href={`/explore/reschedules?${rq}`} help="Bookings that moved their slot one or more times." />
        <Stat label="Avg reschedules per booking" value={Number(leak.avg_reschedules).toFixed(2)} href={`/explore/reschedules?${rq}`}
          help="Across all bookings in range, including the ones that never moved." />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Rescheduled 2+ times" value={num(leak.with_multi_reschedule)} tone="warn" href={`/explore/reschedules?${rq}`} />
        <Stat label="Hit a no-show" value={num(leak.with_no_show)} tone="bad" href={`/explore/no_shows?${rq}`} help="Bookings with at least one no-show slot." />
        <Stat label="No-show recovered" value={num(leak.no_show_recovered)} tone="good" href={`/explore/no_shows?${rq}`}
          help="No-showed bookings that later rebooked and took the call. The saved ones." />
        <Stat label="Cancelled" value={num(leak.cancelled)} tone="bad" href={`/explore/cancellations?${rq}`} help="Bookings with a cancelled slot (by lead or team)." />
      </div>

      <SectionTitle>Reschedules per day</SectionTitle>
      <Card href={`/explore/reschedules?${rq}`}>
        <MiniBars data={series.map((d: any) => Number(d.rescheduled))} color="var(--warn)"
          labels={series.map((d: any) => new Date(d.day).toLocaleDateString("en-US", { month: "short", day: "numeric" }))} />
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <SectionTitle>Cancellation & reschedule reasons</SectionTitle>
          <Card>
            <table>
              <thead><tr><th>Reason</th><th className="text-right">Count</th></tr></thead>
              <tbody>
                {reasons.map((r: any) => (
                  <tr key={r.reason}><td><Link href={`/explore/cancellations?${rq}`} style={{ color: "var(--accent)" }}>{r.reason}</Link></td><td className="text-right">{num(r.n)}</td></tr>
                ))}
                {reasons.length === 0 && <tr><td colSpan={2} style={{ color: "var(--muted)" }}>Nothing recorded yet</td></tr>}
              </tbody>
            </table>
          </Card>
        </div>
        <div>
          <SectionTitle>Objections raised on calls</SectionTitle>
          <Card>
            <table>
              <thead><tr><th>Objection</th><th className="text-right">Raised</th><th className="text-right">Led to loss</th></tr></thead>
              <tbody>
                {objections.map((o: any) => (
                  <tr key={o.name}><td><Link href={`/explore/objections?${rq}`} style={{ color: "var(--accent)" }}>{o.name}</Link></td><td className="text-right">{num(o.n)}</td>
                    <td className="text-right">{Number(o.led_to_loss) > 0 ? <Badge tone="bad">{num(o.led_to_loss)}</Badge> : "0"}</td></tr>
                ))}
                {objections.length === 0 && <tr><td colSpan={3} style={{ color: "var(--muted)" }}>Captured from the Sales Call form as reps submit</td></tr>}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </div>
  );
}
