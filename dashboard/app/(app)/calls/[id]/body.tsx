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
  closed: "good", follow_up: "warn", dq_on_call: "bad", no_decision: "neutral",
  taken: "good", confirmed: "accent", scheduled: "neutral", rescheduled: "warn",
  no_show: "bad", cancelled_by_lead: "bad", cancelled_by_team: "warn",
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

// Full-page call detail: type / disposition / schedule + rep, with its
// appointment slots and objections, linking back to the opportunity and contact.
export async function CallBody({ id }: { id: string }) {
  await requireAccess("calls");
  if (!UUID.test(id)) notFound();
  const tz = await reportTimezone();

  const [call] = await sql`
    select c.id, c.opportunity_id, c.type, c.disposition, c.scheduled_at,
           c.current_scheduled_at, c.occurred_at, c.is_booking, c.is_primary,
           c.booking_source_channel, rep.full_name as rep_name,
           o.stage, o.contact_id, ct.full_name as contact_name
    from sales.call c
    left join sales.rep rep on rep.id = c.rep_id
    left join sales.opportunity o on o.id = c.opportunity_id
    left join core.contact ct on ct.id = o.contact_id
    where c.id = ${id}`;
  if (!call) notFound();

  // pooler-safe: one batch of 2 concurrent queries (<= 4)
  const [slots, objections] = await Promise.all([
    sql`select a.id, a.seq, a.scheduled_for, a.status, a.moved_by, r.name as reason
        from sales.appointment a left join core.cancellation_reason r on r.id = a.reason_id
        where a.call_id = ${id}
        order by a.seq, a.scheduled_for desc nulls last`,
    sql`select ob.id, ob.led_to_loss, ob.source, ot.name as objection_type
        from sales.objection ob left join core.objection_type ot on ot.id = ob.objection_type_id
        where ob.strategy_call_id = ${id}
        order by ob.created_at`,
  ]);

  return (
    <EntityShell
      kicker="Call"
      title={`${label(call.type)} call`}
      subtitle={call.contact_name
        ? <Link href={`/contacts/${call.contact_id}`} style={{ color: "var(--accent)" }}>{call.contact_name} →</Link>
        : undefined}
      badges={<>
        <Badge tone="neutral">{label(call.type)}</Badge>
        {call.disposition && <Badge tone={tone(call.disposition)}>{label(call.disposition)}</Badge>}
        {call.stage && <Badge tone={STATUS_TONE[call.stage] ?? "neutral"}>{label(call.stage)}</Badge>}
      </>}
    >
      <SectionTitle>Details</SectionTitle>
      <Card>
        <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
          <Detail label="Type" value={label(call.type)} />
          <Detail label="Disposition" value={call.disposition ? <Badge tone={tone(call.disposition)}>{label(call.disposition)}</Badge> : "—"} />
          <Detail label="Rep" value={call.rep_name} />
          <Detail label="Booking source" value={label(call.booking_source_channel)} />
          <Detail label="Scheduled" value={dateTime(call.scheduled_at, tz)} />
          <Detail label="Current scheduled" value={dateTime(call.current_scheduled_at, tz)} />
          <Detail label="Occurred" value={dateTime(call.occurred_at, tz)} />
          <Detail label="Counts as booked" value={<Badge tone={call.is_booking ? "good" : "neutral"}>{call.is_booking ? "Yes" : "No"}</Badge>} />
          <Detail label="Primary call" value={<Badge tone={call.is_primary ? "accent" : "neutral"}>{call.is_primary ? "Yes" : "No"}</Badge>} />
        </div>
        <div className="mt-3 flex flex-wrap gap-4 border-t pt-3" style={{ borderColor: "var(--line)" }}>
          {call.opportunity_id && <Link href={`/opportunities/${call.opportunity_id}`} className="text-sm" style={{ color: "var(--accent)" }}>View opportunity →</Link>}
          {call.contact_id && <Link href={`/contacts/${call.contact_id}`} className="text-sm" style={{ color: "var(--accent)" }}>View contact →</Link>}
        </div>
      </Card>

      <SectionTitle>Appointment slots</SectionTitle>
      {slots.length === 0 ? <None>No appointment slots</None> : (
        <div className="space-y-2">
          {slots.map((a: any) => (
            <Card key={a.id} href={`/appointments/${a.id}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={tone(a.status)}>{label(a.status)}</Badge>
                <Badge tone={a.seq > 1 ? "warn" : "neutral"}>#{`${a.seq ?? null}`}</Badge>
                <span className="text-xs" style={{ color: "var(--muted)" }}>{dateTime(a.scheduled_for, tz)}</span>
                {a.reason && <span className="text-xs" style={{ color: "var(--muted)" }}>{a.reason}</span>}
                {a.moved_by && <span className="text-xs" style={{ color: "var(--muted)" }}>Moved by {label(a.moved_by)}</span>}
              </div>
            </Card>
          ))}
        </div>
      )}

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
