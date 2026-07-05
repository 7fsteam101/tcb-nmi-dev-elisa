import Link from "next/link";
import { ReactNode } from "react";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { requireAccess } from "@/lib/access";
import { reportTimezone } from "@/lib/settings";
import { dateTime } from "@/lib/format";
import { Card, SectionTitle, Badge, STATUS_TONE, label } from "@/components/ui";
import { EntityShell } from "@/components/entity-shell";

const UUID = /^[0-9a-f-]{36}$/i;

const EXTRA_TONE: Record<string, "good" | "warn" | "bad" | "neutral" | "accent"> = {
  taken: "good", confirmed: "accent", scheduled: "neutral", rescheduled: "warn",
  no_show: "bad", cancelled_by_lead: "bad", cancelled_by_team: "warn", pending: "warn",
};
const tone = (s: string | null | undefined) => STATUS_TONE[s ?? ""] ?? EXTRA_TONE[s ?? ""] ?? "neutral";

function Detail({ label: l, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-36 shrink-0 text-xs" style={{ color: "var(--muted)" }}>{l}</span>
      <span className="min-w-0 truncate text-sm" style={{ color: "var(--text)" }}>{value || "—"}</span>
    </div>
  );
}

// Full-page appointment (slot) detail: schedule / status / attempt + reason,
// linking back to its parent call, opportunity and contact.
export async function AppointmentBody({ id }: { id: string }) {
  await requireAccess("calls");
  if (!UUID.test(id)) notFound();
  const tz = await reportTimezone();

  const [appt] = await sql`
    select a.id, a.call_id, a.seq, a.scheduled_for, a.status, a.is_current,
           a.moved_by, a.rescheduled_at, r.name as reason,
           c.opportunity_id, o.contact_id, ct.full_name as contact_name
    from sales.appointment a
    left join core.cancellation_reason r on r.id = a.reason_id
    left join sales.call c on c.id = a.call_id
    left join sales.opportunity o on o.id = c.opportunity_id
    left join core.contact ct on ct.id = o.contact_id
    where a.id = ${id}`;
  if (!appt) notFound();

  return (
    <EntityShell
      kicker="Appointment"
      title={`Slot #${`${appt.seq ?? null}`}`}
      subtitle={appt.contact_name
        ? <Link href={`/contacts/${appt.contact_id}`} style={{ color: "var(--accent)" }}>{appt.contact_name} →</Link>
        : undefined}
      badges={<Badge tone={tone(appt.status)}>{label(appt.status)}</Badge>}
    >
      <SectionTitle>Details</SectionTitle>
      <Card>
        <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
          <Detail label="Scheduled for" value={dateTime(appt.scheduled_for, tz)} />
          <Detail label="Status" value={<Badge tone={tone(appt.status)}>{label(appt.status)}</Badge>} />
          <Detail label="Attempt" value={<Badge tone={appt.seq > 1 ? "warn" : "neutral"}>#{`${appt.seq ?? null}`}</Badge>} />
          <Detail label="Current slot" value={<Badge tone={appt.is_current ? "good" : "neutral"}>{appt.is_current ? "Yes" : "No"}</Badge>} />
          <Detail label="Moved by" value={label(appt.moved_by)} />
          <Detail label="Reason" value={appt.reason ?? "—"} />
          <Detail label="Rescheduled at" value={dateTime(appt.rescheduled_at, tz)} />
        </div>
        <div className="mt-3 flex flex-wrap gap-4 border-t pt-3" style={{ borderColor: "var(--line)" }}>
          {appt.call_id && <Link href={`/calls/${appt.call_id}`} className="text-sm" style={{ color: "var(--accent)" }}>View call →</Link>}
          {appt.opportunity_id && <Link href={`/opportunities/${appt.opportunity_id}`} className="text-sm" style={{ color: "var(--accent)" }}>View opportunity →</Link>}
          {appt.contact_id && <Link href={`/contacts/${appt.contact_id}`} className="text-sm" style={{ color: "var(--accent)" }}>View contact →</Link>}
        </div>
      </Card>
    </EntityShell>
  );
}
