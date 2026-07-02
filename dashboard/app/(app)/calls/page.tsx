import Link from "next/link";
import { upcomingAppointments, recentCallOutcomes } from "@/lib/kpi";
import { isDemoMode, reportTimezone } from "@/lib/settings";
import { dateTime, money } from "@/lib/format";
import { Card, SectionTitle, Badge, STATUS_TONE, label } from "@/components/ui";
import { requireAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function Calls() {
  await requireAccess("calls");
  const demo = await isDemoMode();
  const tz = await reportTimezone();
  const [upcoming, outcomes] = await Promise.all([upcomingAppointments(demo), recentCallOutcomes(demo)]);

  return (
    <div>
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-semibold">Calls</h1>
          <p className="mb-6 text-sm" style={{ color: "var(--muted)" }}>Current slots for the next 7 days, and recent outcomes.</p>
        </div>
        <Link href="/forms/sales-call" className="btn">Log a call outcome</Link>
      </div>

      <SectionTitle>On the calendar</SectionTitle>
      <Card>
        <table>
          <thead>
            <tr><th>When</th><th>Contact</th><th>Closer</th><th>Attempt</th><th>Status</th><th>Pipeline stage</th></tr>
          </thead>
          <tbody>
            {upcoming.map((a: any) => (
              <tr key={a.id}>
                <td>{dateTime(a.scheduled_for, tz)}</td>
                <td>{a.contact_name}</td>
                <td>{a.closer ?? "—"}</td>
                <td>{a.seq > 1 ? <Badge tone="warn">{`#${a.seq}`}</Badge> : "#1"}</td>
                <td><Badge tone={STATUS_TONE[a.status] ?? "neutral"}>{label(a.status)}</Badge></td>
                <td className="capitalize" style={{ color: "var(--muted)" }}>{label(a.stage)}</td>
              </tr>
            ))}
            {upcoming.length === 0 && <tr><td colSpan={6} style={{ color: "var(--muted)" }}>No upcoming appointments</td></tr>}
          </tbody>
        </table>
      </Card>

      <SectionTitle>Recent outcomes</SectionTitle>
      <Card>
        <table>
          <thead>
            <tr><th>Taken</th><th>Contact</th><th>Closer</th><th>Disposition</th><th>Deal</th></tr>
          </thead>
          <tbody>
            {outcomes.map((c: any) => (
              <tr key={c.id}>
                <td>{dateTime(c.occurred_at, tz)}</td>
                <td>{c.contact_name}</td>
                <td>{c.closer ?? "—"}</td>
                <td><Badge tone={STATUS_TONE[c.disposition] ?? "neutral"}>{label(c.disposition)}</Badge></td>
                <td>{c.total_contract_value_minor ? `${money(c.total_contract_value_minor)} (${label(c.plan_type_snapshot)})` : "—"}</td>
              </tr>
            ))}
            {outcomes.length === 0 && <tr><td colSpan={5} style={{ color: "var(--muted)" }}>No taken calls yet</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
