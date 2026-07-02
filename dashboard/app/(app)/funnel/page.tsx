import { pipelineByStage, leakage, cancellationReasons, dailySeries, objectionBreakdown } from "@/lib/kpi";
import { isDemoMode, reportTimezone } from "@/lib/settings";
import { num, pct } from "@/lib/format";
import { Card, Stat, SectionTitle, MiniBars, Badge, label } from "@/components/ui";
import { requireAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function Funnel() {
  await requireAccess("funnel");
  const demo = await isDemoMode();
  const tz = await reportTimezone();
  const [stages, leak, reasons, series, objections] = await Promise.all([
    pipelineByStage(demo),
    leakage({ demo, days: 30 }),
    cancellationReasons({ demo, days: 30 }),
    dailySeries({ demo, days: 30, tz }),
    objectionBreakdown({ demo, days: 30 }),
  ]);
  const bookings = Number(leak.bookings);
  const maxStage = Math.max(...stages.map((s: any) => Number(s.n)), 1);

  return (
    <div>
      <h1 className="text-xl font-semibold">Funnel & Leakage</h1>
      <p className="mb-6 text-sm" style={{ color: "var(--muted)" }}>
        Last 30 days. The booked-to-taken gap is where the money leaks.
      </p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Bookings" value={num(leak.bookings)} help="Unique paid strategy-call bookings in range." />
        <Stat label="Reached a taken call" value={`${num(leak.taken)} (${pct(bookings ? Number(leak.taken) / bookings : 0)})`}
          tone={bookings && Number(leak.taken) / bookings >= 0.5 ? "good" : "bad"}
          help="Bookings whose call has actually happened, however many reschedules it took." />
        <Stat label="Rescheduled at least once" value={`${num(leak.with_reschedule)} (${pct(bookings ? Number(leak.with_reschedule) / bookings : 0)})`}
          tone="warn" help="Bookings that moved their slot one or more times." />
        <Stat label="Avg reschedules per booking" value={Number(leak.avg_reschedules).toFixed(2)}
          help="Across all bookings in range, including the ones that never moved." />
      </div>
      <div className="mt-3 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Rescheduled 2+ times" value={num(leak.with_multi_reschedule)} tone="warn" />
        <Stat label="Hit a no-show" value={num(leak.with_no_show)} tone="bad" help="Bookings with at least one no-show slot." />
        <Stat label="No-show recovered" value={num(leak.no_show_recovered)} tone="good"
          help="No-showed bookings that later rebooked and took the call. The saved ones." />
        <Stat label="Cancelled" value={num(leak.cancelled)} tone="bad" help="Bookings with a cancelled slot (by lead or team)." />
      </div>

      <SectionTitle>Reschedules per day</SectionTitle>
      <Card>
        <MiniBars data={series.map((d: any) => Number(d.rescheduled))} color="var(--warn)"
          labels={series.map((d: any) => new Date(d.day).toLocaleDateString("en-US", { month: "short", day: "numeric" }))} />
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <SectionTitle>Pipeline by stage (all open + closed)</SectionTitle>
          <Card>
            {stages.map((s: any) => (
              <div key={s.stage} className="mb-2 flex items-center gap-2">
                <div className="w-44 shrink-0 text-xs capitalize" style={{ color: "var(--muted)" }}>{label(s.stage)}</div>
                <div className="h-3 rounded" style={{ width: `${(Number(s.n) / maxStage) * 100}%`, minWidth: 4, background: "var(--accent)" }} />
                <div className="text-xs">{num(s.n)}</div>
              </div>
            ))}
          </Card>
        </div>
        <div>
          <SectionTitle>Cancellation & reschedule reasons</SectionTitle>
          <Card>
            <table>
              <thead><tr><th>Reason</th><th className="text-right">Count</th></tr></thead>
              <tbody>
                {reasons.map((r: any) => (
                  <tr key={r.reason}><td>{r.reason}</td><td className="text-right">{num(r.n)}</td></tr>
                ))}
                {reasons.length === 0 && <tr><td colSpan={2} style={{ color: "var(--muted)" }}>Nothing recorded yet</td></tr>}
              </tbody>
            </table>
          </Card>
          <SectionTitle>Objections raised on calls</SectionTitle>
          <Card>
            <table>
              <thead><tr><th>Objection</th><th className="text-right">Raised</th><th className="text-right">Led to loss</th></tr></thead>
              <tbody>
                {objections.map((o: any) => (
                  <tr key={o.name}><td>{o.name}</td><td className="text-right">{num(o.n)}</td>
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
