import Link from "next/link";
import { ReactNode } from "react";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { requireAccess } from "@/lib/access";
import { reportTimezone } from "@/lib/settings";
import { dateTime, shortDate } from "@/lib/format";
import { Card, SectionTitle, Badge, STATUS_TONE, label } from "@/components/ui";
import { EntityShell } from "@/components/entity-shell";

const UUID = /^[0-9a-f-]{36}$/i;

const EXTRA_TONE: Record<string, "good" | "warn" | "bad" | "neutral" | "accent"> = {
  lead: "neutral", qualified: "accent", customer: "good", do_not_contact: "bad",
  closed_won: "good", won_pif: "good", won_pp: "good", deposit: "good",
  opt_in: "neutral", booked: "accent", taken: "good", onboarded: "good",
  lost: "bad", not_a_fit: "bad", dq: "bad", no_decision: "neutral",
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

// Full-page opportunity detail: attribution + timeline, with its calls,
// appointments and opt-ins each linking to their own detail page, and a
// prominent link to the parent contact.
export async function OpportunityBody({ id }: { id: string }) {
  await requireAccess("calls");
  if (!UUID.test(id)) notFound();
  const tz = await reportTimezone();

  const [opp] = await sql`
    select o.id, o.contact_id, o.stage, o.opened_at, o.closed_at,
           o.first_touch_channel, o.last_touch_channel, o.converting_touch_channel,
           o.cohort_month, ct.full_name as contact_name
    from sales.opportunity o join core.contact ct on ct.id = o.contact_id
    where o.id = ${id}`;
  if (!opp) notFound();

  // pooler-safe: one batch of 3 concurrent queries (<= 4)
  const [calls, appointments, optIns] = await Promise.all([
    sql`select c.id, c.type, c.disposition, c.is_primary, c.scheduled_at, c.occurred_at
        from sales.call c where c.opportunity_id = ${id}
        order by coalesce(c.scheduled_at, c.occurred_at, c.created_at)`,
    sql`select a.id, a.call_id, a.seq, a.scheduled_for, a.status, a.moved_by, r.name as reason
        from sales.appointment a left join core.cancellation_reason r on r.id = a.reason_id
        where a.call_id in (select c.id from sales.call c where c.opportunity_id = ${id})
        order by a.scheduled_for desc nulls last`,
    sql`select o.id, o.submitted_at, o.source_channel, o.source_campaign
        from sales.opt_in o where o.opportunity_id = ${id}
        order by o.submitted_at desc`,
  ]);

  const title = `${opp.contact_name} · ${label(opp.stage)}`;

  return (
    <EntityShell
      kicker="Opportunity"
      title={title}
      subtitle={<Link href={`/contacts/${opp.contact_id}`} style={{ color: "var(--accent)" }}>View contact →</Link>}
      badges={<Badge tone={tone(opp.stage)}>{label(opp.stage)}</Badge>}
    >
      <SectionTitle>Details</SectionTitle>
      <Card>
        <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
          <Detail label="Stage" value={<Badge tone={tone(opp.stage)}>{label(opp.stage)}</Badge>} />
          <Detail label="Contact" value={<Link href={`/contacts/${opp.contact_id}`} style={{ color: "var(--accent)" }}>{opp.contact_name}</Link>} />
          <Detail label="Opened" value={dateTime(opp.opened_at, tz)} />
          <Detail label="Closed" value={opp.closed_at ? dateTime(opp.closed_at, tz) : "—"} />
          <Detail label="Cohort" value={opp.cohort_month ? shortDate(opp.cohort_month, tz) : "—"} />
        </div>
        <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--line)" }}>
          <div className="mb-2 text-xs" style={{ color: "var(--muted)" }}>Attribution</div>
          <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
            <Detail label="First touch" value={label(opp.first_touch_channel)} />
            <Detail label="Last touch" value={label(opp.last_touch_channel)} />
            <Detail label="Converting touch" value={label(opp.converting_touch_channel)} />
          </div>
        </div>
      </Card>

      <SectionTitle>Calls</SectionTitle>
      {calls.length === 0 ? <None>No calls</None> : (
        <div className="space-y-2">
          {calls.map((c: any) => (
            <Card key={c.id} href={`/calls/${c.id}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone="neutral">{label(c.type)}</Badge>
                {c.disposition && <Badge tone={tone(c.disposition)}>{label(c.disposition)}</Badge>}
                {c.is_primary && <Badge tone="accent">Primary</Badge>}
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  {dateTime(c.occurred_at ?? c.scheduled_at, tz)}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <SectionTitle>Appointments</SectionTitle>
      {appointments.length === 0 ? <None>No appointments</None> : (
        <div className="space-y-2">
          {appointments.map((a: any) => (
            <Card key={a.id} href={`/appointments/${a.id}`}>
              <div className="flex flex-wrap items-center gap-2">
                <Badge tone={tone(a.status)}>{label(a.status)}</Badge>
                <Badge tone={a.seq > 1 ? "warn" : "neutral"}>#{`${a.seq ?? null}`}</Badge>
                <span className="text-xs" style={{ color: "var(--muted)" }}>{dateTime(a.scheduled_for, tz)}</span>
                {a.reason && <span className="text-xs" style={{ color: "var(--muted)" }}>{a.reason}</span>}
              </div>
            </Card>
          ))}
        </div>
      )}

      <SectionTitle>Opt-ins</SectionTitle>
      {optIns.length === 0 ? <None>No opt-ins</None> : (
        <Card>
          <div className="overflow-x-auto">
            <table>
              <thead><tr><th>Submitted</th><th>Channel</th><th>Campaign</th></tr></thead>
              <tbody>
                {optIns.map((o: any) => (
                  <tr key={o.id}>
                    <td>{dateTime(o.submitted_at, tz)}</td>
                    <td>{label(o.source_channel)}</td>
                    <td style={{ color: "var(--muted)" }}>{o.source_campaign ?? "—"}</td>
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
