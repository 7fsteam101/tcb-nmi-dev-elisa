import { sql } from "@/lib/db";
import { isDemoMode } from "@/lib/settings";
import { requireAccess } from "@/lib/access";
import { num } from "@/lib/format";
import { Card, SectionTitle, InfoTip } from "@/components/ui";
import { EodReportForm } from "./form";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Today in the report timezone (ET) as YYYY-MM-DD, for the date-input default.
function todayET(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit", day: "2-digit",
  }).format(new Date());
}

// report_date arrives as a plain YYYY-MM-DD string (cast to text in SQL). Format
// it as UTC so a calendar date never shifts back a day through a local timezone.
function fmtReportDate(d: string): string {
  return new Date(d + "T12:00:00Z").toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" });
}

type ReportRow = {
  id: string;
  rep_name: string;
  report_date: string;
  dials: number;
  conversations: number;
  appointments_set: number;
  follow_ups: number;
  notes: string | null;
};

export default async function SetterReports() {
  const user = await requireAccess("calls");
  const demo = await isDemoMode();
  const isPrivileged = user.role === "admin" || user.role === "leadership";
  // A setter only ever sees and files their own report; anyone else (admin /
  // leadership) sees the whole team. A setter with no linked rep sees nothing.
  const ownRepId = isPrivileged ? null : user.repId;

  // Setter reporting roster: active setters and hybrids.
  const reps = await sql`
    select id, full_name, role
    from sales.rep
    where active and role in ('setter', 'hybrid')
    order by full_name` as unknown as { id: string; full_name: string; role: string }[];

  // Recent reports: everyone's for admin/leadership, only the setter's own otherwise.
  const repFilter = ownRepId ? sql`and e.rep_id = ${ownRepId}` : sql``;
  const reports = (isPrivileged || ownRepId)
    ? (await sql`
        select e.id, r.full_name as rep_name, e.report_date::text as report_date,
          e.dials, e.conversations, e.appointments_set, e.follow_ups, e.notes
        from sales.eod_report e
        join sales.rep r on r.id = e.rep_id
        where e.is_demo = ${demo} ${repFilter}
        order by e.report_date desc, r.full_name
        limit 100` as unknown as ReportRow[])
    : [];

  const repOptions = reps.map((r) => ({ id: r.id, label: `${r.full_name} (${r.role})` }));
  const lockedRepId = ownRepId ?? null;

  return (
    <div>
      <h1 className="text-xl font-semibold">Setter Reports</h1>
      <p className="mb-6 text-sm" style={{ color: "var(--muted)" }}>
        Appointment setters log their end-of-day activity here. One report per rep per day; resubmitting the same day updates it.
      </p>

      <EodReportForm reps={repOptions} lockedRepId={lockedRepId} today={todayET()} />

      <SectionTitle>Recent Reports</SectionTitle>
      <Card>
        <table>
          <thead>
            <tr>
              <th>Rep</th>
              <th>Date</th>
              <th className="text-right">Dials</th>
              <th className="text-right">Conversations</th>
              <th className="text-right">Appointments Set</th>
              <th className="text-right">Follow Ups</th>
              <th>Notes <InfoTip text="Free-text summary the setter left for the day." /></th>
            </tr>
          </thead>
          <tbody>
            {reports.map((r) => (
              <tr key={r.id}>
                <td>{r.rep_name}</td>
                <td>{fmtReportDate(r.report_date)}</td>
                <td className="text-right">{num(r.dials)}</td>
                <td className="text-right">{num(r.conversations)}</td>
                <td className="text-right">{num(r.appointments_set)}</td>
                <td className="text-right">{num(r.follow_ups)}</td>
                <td style={{ color: r.notes ? "var(--text)" : "var(--muted)" }}>{r.notes ?? "—"}</td>
              </tr>
            ))}
            {reports.length === 0 && (
              <tr><td colSpan={7} style={{ color: "var(--muted)" }}>No reports yet</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
