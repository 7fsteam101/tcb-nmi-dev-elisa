import Link from "next/link";
import { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { requireAccess } from "@/lib/access";
import { reportTimezone } from "@/lib/settings";
import { money, dateTime, shortDate } from "@/lib/format";
import { Card, SectionTitle, Badge, STATUS_TONE, label } from "@/components/ui";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Tones for values STATUS_TONE doesn't cover: lifecycle, opportunity stages
// (both the live Close pipeline and the redesigned one), deal + report statuses.
const EXTRA_TONE: Record<string, "good" | "warn" | "bad" | "neutral" | "accent"> = {
  lead: "neutral", qualified: "accent", customer: "good", do_not_contact: "bad",
  closed_won: "good", won_pif: "good", won_pp: "good", deposit: "good", active_partner: "good",
  contract_signed: "good", contract_sent: "accent", closing: "accent", interested_partner: "accent",
  lost: "bad", not_a_fit: "bad", call_canceled_by_team: "bad", call_canceled_by_lead: "warn",
  warm_list: "warn",
  active: "good", refunded: "bad", churned: "warn",
  submitted: "neutral", validated: "good", superseded: "neutral", rejected: "bad",
};
const tone = (s: string | null | undefined) => STATUS_TONE[s ?? ""] ?? EXTRA_TONE[s ?? ""] ?? "neutral";

function groupBy(rows: any[], key: string): Map<string, any[]> {
  const m = new Map<string, any[]>();
  for (const r of rows) {
    const k = String(r[key]);
    const arr = m.get(k);
    if (arr) arr.push(r);
    else m.set(k, [r]);
  }
  return m;
}

function None({ children = "none" }: { children?: ReactNode }) {
  return <p className="text-sm" style={{ color: "var(--muted)" }}>{children}</p>;
}

export default async function ContactDetail({ params }: { params: Promise<{ id: string }> }) {
  await requireAccess("calls");
  const { id } = await params;
  if (!UUID.test(id)) notFound();

  const contactRows = await sql`
    select ct.id, ct.full_name, ct.primary_email, ct.primary_phone, ct.lifecycle_status,
           ct.merged_into_contact_id, ct.close_id, ct.ghl_marketing_id, ct.ghl_repair_id,
           ct.monday_lead_id, rep.full_name as owner
    from core.contact ct
    left join sales.rep rep on rep.id = ct.owner_rep_id
    where ct.id = ${id}`;
  if (contactRows.length === 0) notFound();
  const contact = contactRows[0];
  // A merged (non-canonical) row: the story lives on the canonical contact.
  if (contact.merged_into_contact_id) redirect(`/contacts/${contact.merged_into_contact_id}`);

  const tz = await reportTimezone();
  const [identifiers, opportunities, calls, appointments, deals, plans, receivables, payments, optIns, reports, objections] =
    await Promise.all([
      sql`select id, type, value, is_primary from core.contact_identifier
          where contact_id = ${id} order by type, is_primary desc, created_at`,
      sql`select o.id, o.stage, o.opened_at, o.closed_at
          from sales.opportunity o where o.contact_id = ${id}
          order by o.opened_at desc nulls last, o.created_at desc`,
      sql`select c.id, c.opportunity_id, c.type, c.disposition
          from sales.call c
          where c.opportunity_id in (select o.id from sales.opportunity o where o.contact_id = ${id})
          order by coalesce(c.scheduled_at, c.occurred_at, c.created_at)`,
      sql`select a.id, a.call_id, a.seq, a.scheduled_for, a.status, a.moved_by, r.name as reason
          from sales.appointment a
          left join core.cancellation_reason r on r.id = a.reason_id
          where a.call_id in (select c.id from sales.call c
                              where c.opportunity_id in (select o.id from sales.opportunity o where o.contact_id = ${id}))
          order by a.seq`,
      sql`select d.id, d.plan_type_snapshot, d.total_contract_value_minor, d.status, d.deal_close_date
          from sales.deal d where d.contact_id = ${id} order by d.deal_close_date desc`,
      sql`select pp.id, pp.deal_id, pp.version, pp.plan_type, pp.total_minor, pp.is_current
          from finance.payment_plan pp
          where pp.deal_id in (select d.id from sales.deal d where d.contact_id = ${id})
          order by pp.version`,
      sql`select r.id, r.payment_plan_id, r.installment_no, r.due_date, r.amount_minor, r.status
          from finance.receivable r
          where r.deal_id in (select d.id from sales.deal d where d.contact_id = ${id})
          order by r.installment_no`,
      sql`select p.id, p.deal_id, p.type, p.amount_minor, p.processor, p.occurred_at
          from finance.successful_payment p
          where p.deal_id in (select d.id from sales.deal d where d.contact_id = ${id})
          order by p.occurred_at`,
      sql`select o.id, o.submitted_at, o.source_channel, o.source_campaign
          from sales.opt_in o where o.contact_id = ${id} order by o.submitted_at desc`,
      sql`select rs.id, rs.type, rs.submitted_at, rs.status
          from sales.report_submission rs
          where rs.strategy_call_id in (select c.id from sales.call c
                  where c.opportunity_id in (select o.id from sales.opportunity o where o.contact_id = ${id}))
             or rs.follow_up_call_id in (select c.id from sales.call c
                  where c.opportunity_id in (select o.id from sales.opportunity o where o.contact_id = ${id}))
          order by rs.submitted_at desc`,
      sql`select ob.id, ob.created_at, ob.led_to_loss, ob.source, ot.name as objection
          from sales.objection ob
          left join core.objection_type ot on ot.id = ob.objection_type_id
          where ob.strategy_call_id in (select c.id from sales.call c
                  where c.opportunity_id in (select o.id from sales.opportunity o where o.contact_id = ${id}))
          order by ob.created_at desc`,
    ]);

  const callsByOpp = groupBy(calls, "opportunity_id");
  const slotsByCall = groupBy(appointments, "call_id");
  const plansByDeal = groupBy(plans, "deal_id");
  const recvByPlan = groupBy(receivables, "payment_plan_id");
  const paymentsByDeal = groupBy(payments, "deal_id");

  const primaryVals = new Set(
    [contact.primary_email, contact.primary_phone].filter(Boolean).map((v) => String(v).toLowerCase()),
  );
  const extras = identifiers.filter((i: any) => !primaryVals.has(String(i.value).toLowerCase()));
  const hasExternal = contact.close_id || contact.ghl_marketing_id || contact.ghl_repair_id || contact.monday_lead_id;

  return (
    <div>
      <div className="mb-2">
        <Link href="/contacts" className="text-sm" style={{ color: "var(--accent)" }}>&larr; Contacts</Link>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{contact.full_name}</h1>
        <Badge tone={tone(contact.lifecycle_status)}>{label(contact.lifecycle_status)}</Badge>
      </div>
      <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
        {contact.primary_email ?? "—"} &middot; {contact.primary_phone ?? "—"} &middot; Owner: {contact.owner ?? "—"}
      </p>
      {extras.length > 0 && (
        <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
          Also: {extras.map((i: any) => `${label(i.type)} ${i.value}`).join(" · ")}
        </p>
      )}
      {hasExternal && (
        <div className="mt-2 flex flex-wrap items-center gap-3 text-xs">
          {contact.close_id && (
            <a href={`https://app.close.com/lead/${contact.close_id}/`} target="_blank" rel="noreferrer"
              style={{ color: "var(--accent)" }}>
              Open in Close &nearr;
            </a>
          )}
          {contact.ghl_marketing_id && <span style={{ color: "var(--muted)" }}>GHL marketing: {contact.ghl_marketing_id}</span>}
          {contact.ghl_repair_id && <span style={{ color: "var(--muted)" }}>GHL repair: {contact.ghl_repair_id}</span>}
          {contact.monday_lead_id && <span style={{ color: "var(--muted)" }}>Monday: {contact.monday_lead_id}</span>}
        </div>
      )}

      <SectionTitle>Opportunities</SectionTitle>
      {opportunities.length === 0 && <None />}
      {opportunities.map((o: any) => {
        const oppCalls = callsByOpp.get(String(o.id)) ?? [];
        return (
          <Card key={o.id} className="mb-3">
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={tone(o.stage)}>{label(o.stage)}</Badge>
              <span className="text-xs" style={{ color: "var(--muted)" }}>
                Opened {shortDate(o.opened_at, tz)}{o.closed_at ? ` · Closed ${shortDate(o.closed_at, tz)}` : ""}
              </span>
            </div>
            {oppCalls.length === 0 && <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>No calls</p>}
            {oppCalls.map((c: any) => {
              const slots = slotsByCall.get(String(c.id)) ?? [];
              return (
                <div key={c.id} className="mt-3 border-t pt-3" style={{ borderColor: "var(--line)" }}>
                  <div className="flex flex-wrap items-center gap-2">
                    <Badge tone="neutral">{label(c.type)}</Badge>
                    {c.disposition && <Badge tone={tone(c.disposition)}>{label(c.disposition)}</Badge>}
                  </div>
                  {slots.length === 0 ? (
                    <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>No scheduled slots</p>
                  ) : (
                    <div className="mt-2 overflow-x-auto">
                      <table>
                        <thead>
                          <tr><th>Slot</th><th>Scheduled for</th><th>Status</th><th>Reason</th><th>Moved by</th></tr>
                        </thead>
                        <tbody>
                          {slots.map((a: any) => (
                            <tr key={a.id}>
                              <td>#{a.seq}</td>
                              <td>{dateTime(a.scheduled_for, tz)}</td>
                              <td><Badge tone={tone(a.status)}>{label(a.status)}</Badge></td>
                              <td style={{ color: "var(--muted)" }}>{a.reason ?? "—"}</td>
                              <td className="capitalize" style={{ color: "var(--muted)" }}>{label(a.moved_by)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
          </Card>
        );
      })}

      <SectionTitle>Deals</SectionTitle>
      {deals.length === 0 && <None />}
      {deals.map((d: any) => {
        const dealPlans = plansByDeal.get(String(d.id)) ?? [];
        const dealPayments = paymentsByDeal.get(String(d.id)) ?? [];
        return (
          <Card key={d.id} className="mb-3">
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-lg font-semibold">{money(d.total_contract_value_minor)}</span>
              <Badge tone="accent">{label(d.plan_type_snapshot)}</Badge>
              <Badge tone={tone(d.status)}>{label(d.status)}</Badge>
              <span className="text-xs" style={{ color: "var(--muted)" }}>Closed {shortDate(d.deal_close_date, tz)}</span>
            </div>

            {dealPlans.length === 0 && <p className="mt-3 text-sm" style={{ color: "var(--muted)" }}>No payment plan</p>}
            {dealPlans.map((p: any) => {
              const recv = recvByPlan.get(String(p.id)) ?? [];
              return (
                <div key={p.id} className="mt-3 border-t pt-3" style={{ borderColor: "var(--line)" }}>
                  <div className="flex flex-wrap items-center gap-2 text-sm">
                    <span className="font-medium">Plan v{p.version}</span>
                    <Badge tone={p.is_current ? "good" : "neutral"}>{p.is_current ? "current" : "superseded"}</Badge>
                    <span className="text-xs" style={{ color: "var(--muted)" }}>
                      {label(p.plan_type)}{p.total_minor != null ? ` · ${money(p.total_minor)}` : ""}
                    </span>
                  </div>
                  {recv.length === 0 ? (
                    <p className="mt-2 text-sm" style={{ color: "var(--muted)" }}>No receivables</p>
                  ) : (
                    <div className="mt-2 overflow-x-auto">
                      <table>
                        <thead>
                          <tr><th>Installment</th><th>Due</th><th>Amount</th><th>Status</th></tr>
                        </thead>
                        <tbody>
                          {recv.map((r: any) => (
                            <tr key={r.id}>
                              <td>#{r.installment_no}</td>
                              <td>{shortDate(r.due_date, tz)}</td>
                              <td>{money(r.amount_minor)}</td>
                              <td><Badge tone={tone(r.status)}>{label(r.status)}</Badge></td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}

            <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--line)" }}>
              {dealPayments.length === 0 ? (
                <p className="text-sm" style={{ color: "var(--muted)" }}>No payments</p>
              ) : (
                <div className="overflow-x-auto">
                  <table>
                    <thead>
                      <tr><th>Paid</th><th>Type</th><th>Amount</th><th>Processor</th></tr>
                    </thead>
                    <tbody>
                      {dealPayments.map((p: any) => (
                        <tr key={p.id}>
                          <td>{dateTime(p.occurred_at, tz)}</td>
                          <td className="capitalize" style={{ color: "var(--muted)" }}>{label(p.type)}</td>
                          <td>{money(p.amount_minor)}</td>
                          <td className="capitalize" style={{ color: "var(--muted)" }}>{label(p.processor)}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </Card>
        );
      })}

      <SectionTitle>Opt-ins</SectionTitle>
      {optIns.length === 0 ? <None /> : (
        <Card>
          <table>
            <thead>
              <tr><th>Submitted</th><th>Source</th><th>Campaign</th></tr>
            </thead>
            <tbody>
              {optIns.map((o: any) => (
                <tr key={o.id}>
                  <td>{dateTime(o.submitted_at, tz)}</td>
                  <td>{o.source_channel ?? "—"}</td>
                  <td>{o.source_campaign ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <SectionTitle>Report submissions</SectionTitle>
      {reports.length === 0 ? <None /> : (
        <Card>
          <table>
            <thead>
              <tr><th>Submitted</th><th>Type</th><th>Status</th></tr>
            </thead>
            <tbody>
              {reports.map((r: any) => (
                <tr key={r.id}>
                  <td>{dateTime(r.submitted_at, tz)}</td>
                  <td className="capitalize" style={{ color: "var(--muted)" }}>{label(r.type)}</td>
                  <td><Badge tone={tone(r.status)}>{label(r.status)}</Badge></td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}

      <SectionTitle>Objections</SectionTitle>
      {objections.length === 0 ? <None /> : (
        <Card>
          <table>
            <thead>
              <tr><th>Logged</th><th>Objection</th><th>Led to loss</th><th>Source</th></tr>
            </thead>
            <tbody>
              {objections.map((ob: any) => (
                <tr key={ob.id}>
                  <td>{dateTime(ob.created_at, tz)}</td>
                  <td>{ob.objection ?? "—"}</td>
                  <td>{ob.led_to_loss ? <Badge tone="bad">yes</Badge> : "no"}</td>
                  <td className="capitalize" style={{ color: "var(--muted)" }}>{label(ob.source)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </div>
  );
}
