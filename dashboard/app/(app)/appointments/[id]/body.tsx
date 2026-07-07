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
  closed: "good", follow_up: "warn", dq_on_call: "bad", no_decision: "neutral",
};
const tone = (s: string | null | undefined) => STATUS_TONE[s ?? ""] ?? EXTRA_TONE[s ?? ""] ?? "neutral";

function None({ children = "Nothing yet" }: { children?: ReactNode }) {
  return <p className="py-2 text-sm" style={{ color: "var(--muted)" }}>{children}</p>;
}

function Detail({ label: l, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-36 shrink-0 text-xs" style={{ color: "var(--muted)" }}>{l}</span>
      <span className="min-w-0 truncate text-sm" style={{ color: "var(--text)" }}>{value || "—"}</span>
    </div>
  );
}

// Small bordered form shortcut. Carries the appointment + contact ids so the
// target form can prefill.
function FormLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <Link
      href={href}
      className="inline-block rounded-md border px-2.5 py-1 text-xs font-medium"
      style={{ borderColor: "var(--line)", color: "var(--text)", background: "var(--panel)" }}
    >
      {children}
    </Link>
  );
}

// Full-page appointment detail. A call and its appointment are the same thing,
// so this is the unified view (opened from the call log): the appointment slot
// details PLUS the folded-in call details (type / disposition / rep / booking /
// primary / counts-as-booked + objections) and the opportunity stage, with form
// shortcuts and links back to the opportunity and contact.
export async function AppointmentBody({ id }: { id: string }) {
  await requireAccess("calls");
  if (!UUID.test(id)) notFound();
  const tz = await reportTimezone();

  const [appt] = await sql`
    select a.id, a.call_id, a.seq, a.scheduled_for, a.status, a.is_current,
           a.moved_by, a.rescheduled_at, r.name as reason,
           c.opportunity_id, c.type as call_type, c.disposition, c.is_booking, c.is_primary,
           c.booking_source_channel, rep.full_name as rep_name,
           o.stage, o.contact_id, ct.full_name as contact_name
    from sales.appointment a
    left join core.cancellation_reason r on r.id = a.reason_id
    left join sales.call c on c.id = a.call_id
    left join sales.rep rep on rep.id = c.rep_id
    left join sales.opportunity o on o.id = c.opportunity_id
    left join core.contact ct on ct.id = o.contact_id
    where a.id = ${id}`;
  if (!appt) notFound();

  // pooler-safe: objections for the folded-in call (single query, <= 4 concurrent)
  const objections = appt.call_id
    ? await sql`select ob.id, ob.led_to_loss, ob.source, ot.name as objection_type
        from sales.objection ob left join core.objection_type ot on ot.id = ob.objection_type_id
        where ob.strategy_call_id = ${appt.call_id}
        order by ob.created_at`
    : [];

  return (
    <EntityShell
      kicker="Appointment"
      title={`Slot #${`${appt.seq ?? null}`}`}
      subtitle={appt.contact_name
        ? <Link href={`/contacts/${appt.contact_id}`} style={{ color: "var(--accent)" }}>{appt.contact_name} →</Link>
        : undefined}
      badges={<>
        <Badge tone={tone(appt.status)}>{label(appt.status)}</Badge>
        {appt.stage && <Badge tone={STATUS_TONE[appt.stage] ?? "neutral"}>{label(appt.stage)}</Badge>}
      </>}
    >
      <div className="mb-5 flex flex-wrap gap-2">
        <FormLink href={`/forms/sales-call?appointmentId=${appt.id}&contactId=${appt.contact_id ?? ""}`}>Sales Call Report</FormLink>
        <FormLink href={`/forms/post-call?appointmentId=${appt.id}&contactId=${appt.contact_id ?? ""}`}>Post-Call Notes</FormLink>
        <FormLink href={`/forms/missed-call?appointmentId=${appt.id}&contactId=${appt.contact_id ?? ""}`}>Missed Call Report</FormLink>
      </div>

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

        {appt.call_id && (
          <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--line)" }}>
            <div className="mb-2 text-xs" style={{ color: "var(--muted)" }}>Call details</div>
            <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
              <Detail label="Type" value={label(appt.call_type)} />
              <Detail label="Disposition" value={appt.disposition ? <Badge tone={tone(appt.disposition)}>{label(appt.disposition)}</Badge> : "—"} />
              <Detail label="Rep" value={appt.rep_name} />
              <Detail label="Booking source" value={label(appt.booking_source_channel)} />
              <Detail label="Primary call" value={<Badge tone={appt.is_primary ? "accent" : "neutral"}>{appt.is_primary ? "Yes" : "No"}</Badge>} />
              <Detail label="Counts as booked" value={<Badge tone={appt.is_booking ? "good" : "neutral"}>{appt.is_booking ? "Yes" : "No"}</Badge>} />
            </div>
          </div>
        )}

        <div className="mt-3 flex flex-wrap gap-4 border-t pt-3" style={{ borderColor: "var(--line)" }}>
          {appt.opportunity_id && <Link href={`/opportunities/${appt.opportunity_id}`} className="text-sm" style={{ color: "var(--accent)" }}>View opportunity →</Link>}
          {appt.contact_id && <Link href={`/contacts/${appt.contact_id}`} className="text-sm" style={{ color: "var(--accent)" }}>View contact →</Link>}
        </div>
      </Card>

      <SectionTitle>Objections</SectionTitle>
      {objections.length === 0 ? <None>No objections logged</None> : (
        <Card>
          <div className="overflow-x-auto">
            <table>
              <thead><tr><th>Objection</th><th>Led to loss</th><th>Source</th></tr></thead>
              <tbody>
                {objections.map((ob: any) => (
                  <tr key={ob.id}>
                    <td>{ob.objection_type ?? "—"}</td>
                    <td>{ob.led_to_loss == null ? "—" : <Badge tone={ob.led_to_loss ? "bad" : "neutral"}>{ob.led_to_loss ? "Yes" : "No"}</Badge>}</td>
                    <td style={{ color: "var(--muted)" }}>{label(ob.source)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </EntityShell>
  );
}
