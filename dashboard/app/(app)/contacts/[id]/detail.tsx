import Link from "next/link";
import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { reportTimezone } from "@/lib/settings";
import { money, dateTime, shortDate } from "@/lib/format";
import { Card, SectionTitle, Badge, STATUS_TONE, label } from "@/components/ui";
import { ContactTabs } from "./tabs";
import { NoteForm } from "./note-form";

// Shared contact-profile body — rendered by both the full page and the drawer.
// Sectioned into tabs (Overview / Opportunities / Appointments / Deals /
// Contracts / Notes / Activity) with a notes composer and a merged activity feed.
const EXTRA_TONE: Record<string, "good" | "warn" | "bad" | "neutral" | "accent"> = {
  lead: "neutral", qualified: "accent", customer: "good", do_not_contact: "bad",
  closed_won: "good", won_pif: "good", won_pp: "good", deposit: "good", active_partner: "good",
  contract_signed: "good", contract_sent: "accent", closing: "accent", interested_partner: "accent",
  lost: "bad", not_a_fit: "bad", call_canceled_by_team: "bad", call_canceled_by_lead: "warn",
  warm_list: "warn", active: "good", refunded: "bad", churned: "warn",
  submitted: "neutral", validated: "good", superseded: "neutral", rejected: "bad",
  signed: "good", sent: "warn", declined: "bad", voided: "bad", draft: "neutral",
};
const tone = (s: string | null | undefined) => STATUS_TONE[s ?? ""] ?? EXTRA_TONE[s ?? ""] ?? "neutral";
const gb = (rows: any[], key: string) => {
  const m = new Map<string, any[]>();
  for (const r of rows) { const k = String(r[key]); (m.get(k) ?? m.set(k, []).get(k)!).push(r); }
  return m;
};
function None({ children = "Nothing yet" }: { children?: ReactNode }) {
  return <p className="py-2 text-sm" style={{ color: "var(--muted)" }}>{children}</p>;
}

export async function ContactBody({ id }: { id: string }) {
  const [contact] = await sql`
    select ct.id, ct.full_name, ct.primary_email, ct.primary_phone, ct.lifecycle_status,
           ct.merged_into_contact_id, ct.close_id, ct.ghl_marketing_id, ct.ghl_repair_id,
           ct.monday_lead_id, ct.created_source, rep.full_name as owner
    from core.contact ct left join sales.rep rep on rep.id = ct.owner_rep_id where ct.id = ${id}`;
  if (!contact) return <None>Contact not found</None>;
  if (contact.merged_into_contact_id) redirect(`/contacts/${contact.merged_into_contact_id}`);
  const tz = await reportTimezone();

  // pooler-safe: batches of <= 4 concurrent (never all 13 at once)
  const [identifiers, opportunities, calls, appointments] = await Promise.all([
    sql`select id, type, value, is_primary from core.contact_identifier where contact_id = ${id} order by type, is_primary desc, created_at`,
    sql`select o.id, o.stage, o.opened_at, o.closed_at from sales.opportunity o where o.contact_id = ${id} order by o.opened_at desc nulls last, o.created_at desc`,
    sql`select c.id, c.opportunity_id, c.type, c.disposition from sales.call c where c.opportunity_id in (select o.id from sales.opportunity o where o.contact_id = ${id}) order by coalesce(c.scheduled_at, c.occurred_at, c.created_at)`,
    sql`select a.id, a.call_id, a.seq, a.scheduled_for, a.status, a.moved_by, a.created_at, r.name as reason from sales.appointment a left join core.cancellation_reason r on r.id = a.reason_id where a.call_id in (select c.id from sales.call c where c.opportunity_id in (select o.id from sales.opportunity o where o.contact_id = ${id})) order by a.scheduled_for desc nulls last`,
  ]);
  const [deals, plans, receivables, payments] = await Promise.all([
    sql`select d.id, d.opportunity_id, d.plan_type_snapshot, d.total_contract_value_minor, d.status, d.deal_close_date from sales.deal d where d.contact_id = ${id} order by d.deal_close_date desc`,
    sql`select pp.id, pp.deal_id, pp.version, pp.plan_type, pp.total_minor, pp.is_current from finance.payment_plan pp where pp.deal_id in (select d.id from sales.deal d where d.contact_id = ${id}) order by pp.version`,
    sql`select r.id, r.payment_plan_id, r.installment_no, r.due_date, r.amount_minor, r.status from finance.receivable r where r.deal_id in (select d.id from sales.deal d where d.contact_id = ${id}) order by r.installment_no`,
    sql`select p.id, p.deal_id, p.type, p.amount_minor, p.processor, p.occurred_at from finance.successful_payment p where p.deal_id in (select d.id from sales.deal d where d.contact_id = ${id}) order by p.occurred_at`,
  ]);
  const [optIns, reports, notes, agreements] = await Promise.all([
    sql`select o.id, o.submitted_at, o.source_channel, o.source_campaign from sales.opt_in o where o.contact_id = ${id} order by o.submitted_at desc`,
    sql`select rs.id, rs.type, rs.submitted_at, rs.status from sales.report_submission rs where rs.strategy_call_id in (select c.id from sales.call c where c.opportunity_id in (select o.id from sales.opportunity o where o.contact_id = ${id})) order by rs.submitted_at desc`,
    sql`select n.id, n.body, n.created_at, u.full_name as author from core.contact_note n left join core.app_user u on u.id = n.author_user_id where n.contact_id = ${id} order by n.created_at desc`,
    sql`select a.id, a.title, a.status, a.amount_minor, a.sent_at, a.signed_at, a.document_url from sales.agreement a where a.contact_id = ${id} order by coalesce(a.signed_at, a.sent_at, a.created_at) desc`,
  ]);

  const callsByOpp = gb(calls, "opportunity_id");
  const slotsByCall = gb(appointments, "call_id");
  const plansByDeal = gb(plans, "deal_id");
  const recvByPlan = gb(receivables, "payment_plan_id");
  const paymentsByDeal = gb(payments, "deal_id");

  const extras = identifiers.filter((i: any) => ![contact.primary_email, contact.primary_phone].filter(Boolean).map((v) => String(v).toLowerCase()).includes(String(i.value).toLowerCase()));
  const hasExternal = contact.close_id || contact.ghl_marketing_id || contact.ghl_repair_id || contact.monday_lead_id;
  const totalPaid = payments.reduce((s: number, p: any) => s + (p.type === "booking_25" ? 0 : Number(p.amount_minor)), 0);
  const wonDeal = deals.find((d: any) => d.status !== "refunded");

  // ---- activity feed (merge everything by time, newest first) ----
  type Ev = { when: any; text: string; sub?: string; tn?: string };
  const feed: Ev[] = [];
  optIns.forEach((o: any) => feed.push({ when: o.submitted_at, text: `Opted in${o.source_channel ? ` via ${label(o.source_channel)}` : ""}`, sub: o.source_campaign ?? undefined, tn: "accent" }));
  appointments.forEach((a: any) => feed.push({ when: a.scheduled_for, text: `Appointment ${label(a.status)}`, sub: a.reason ?? undefined, tn: tone(a.status) }));
  deals.forEach((d: any) => feed.push({ when: d.deal_close_date, text: `Deal ${label(d.status)} ${money(d.total_contract_value_minor)}`, tn: d.status === "refunded" ? "bad" : "good" }));
  payments.forEach((p: any) => feed.push({ when: p.occurred_at, text: `Payment ${money(p.amount_minor)}`, sub: label(p.type), tn: "good" }));
  agreements.forEach((a: any) => feed.push({ when: a.signed_at ?? a.sent_at, text: `Agreement ${label(a.status)}`, sub: a.amount_minor ? money(a.amount_minor) : undefined, tn: tone(a.status) }));
  reports.forEach((r: any) => feed.push({ when: r.submitted_at, text: `${label(r.type)} report ${label(r.status)}`, tn: tone(r.status) }));
  notes.forEach((n: any) => feed.push({ when: n.created_at, text: `Note by ${n.author ?? "team"}`, sub: n.body, tn: "neutral" }));
  const activity = feed.filter((e) => e.when).sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());

  // ================= sections =================
  const overview = (
    <div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Mini label="Lifecycle" value={label(contact.lifecycle_status)} tn={tone(contact.lifecycle_status)} />
        <Mini label="Opportunities" value={String(opportunities.length)} />
        <Mini label="Cash collected" value={money(totalPaid)} tn={totalPaid > 0 ? "good" : "neutral"} />
        <Mini label="Won deal" value={wonDeal ? money(wonDeal.total_contract_value_minor) : "None"} tn={wonDeal ? "good" : "neutral"} />
      </div>
      {(contact.created_source || extras.length > 0) && (
        <div className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
          {contact.created_source && <div>Created via {label(contact.created_source)}</div>}
          {extras.length > 0 && <div className="mt-1">Also: {extras.map((i: any) => `${label(i.type)} ${i.value}`).join(" · ")}</div>}
        </div>
      )}
      {hasExternal && (
        <div className="mt-3 flex flex-wrap items-center gap-3 text-xs">
          {contact.close_id && <a href={`https://app.close.com/lead/${contact.close_id}/`} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>Open in Close &nearr;</a>}
          {contact.ghl_marketing_id && <span style={{ color: "var(--muted)" }}>GHL marketing: {contact.ghl_marketing_id}</span>}
          {contact.ghl_repair_id && <span style={{ color: "var(--muted)" }}>GHL repair: {contact.ghl_repair_id}</span>}
          {contact.monday_lead_id && <span style={{ color: "var(--muted)" }}>Monday: {contact.monday_lead_id}</span>}
        </div>
      )}
    </div>
  );

  const oppsSection = opportunities.length === 0 ? <None>No opportunities</None> : (
    <div className="space-y-3">
      {opportunities.map((o: any) => {
        const oc = callsByOpp.get(String(o.id)) ?? [];
        return (
          <Card key={o.id}>
            <div className="flex flex-wrap items-center gap-3">
              <Badge tone={tone(o.stage)}>{label(o.stage)}</Badge>
              <span className="text-xs" style={{ color: "var(--muted)" }}>Opened {shortDate(o.opened_at, tz)}{o.closed_at ? ` · Closed ${shortDate(o.closed_at, tz)}` : ""}</span>
            </div>
            {oc.map((c: any) => (
              <div key={c.id} className="mt-3 border-t pt-2" style={{ borderColor: "var(--line)" }}>
                <div className="flex items-center gap-2">
                  <Badge tone="neutral">{label(c.type)}</Badge>
                  {c.disposition && <Badge tone={tone(c.disposition)}>{label(c.disposition)}</Badge>}
                  <span className="text-[11px]" style={{ color: "var(--muted)" }}>{(slotsByCall.get(String(c.id)) ?? []).length} slot(s)</span>
                </div>
              </div>
            ))}
          </Card>
        );
      })}
    </div>
  );

  const apptsSection = appointments.length === 0 ? <None>No appointments</None> : (
    <Card>
      <div className="overflow-x-auto">
        <table>
          <thead><tr><th>Scheduled for</th><th>Attempt</th><th>Status</th><th>Reason</th><th>Moved by</th></tr></thead>
          <tbody>
            {appointments.map((a: any) => (
              <tr key={a.id}>
                <td>{dateTime(a.scheduled_for, tz)}</td>
                <td>{a.seq > 1 ? <Badge tone="warn">#{a.seq}</Badge> : "#1"}</td>
                <td><Badge tone={tone(a.status)}>{label(a.status)}</Badge></td>
                <td style={{ color: "var(--muted)" }}>{a.reason ?? "—"}</td>
                <td className="capitalize" style={{ color: "var(--muted)" }}>{label(a.moved_by)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );

  const dealsSection = deals.length === 0 ? <None>No deals</None> : (
    <div className="space-y-3">
      {deals.map((d: any) => {
        const dp = plansByDeal.get(String(d.id)) ?? [];
        const pay = paymentsByDeal.get(String(d.id)) ?? [];
        return (
          <Card key={d.id}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-lg font-semibold">{money(d.total_contract_value_minor)}</span>
              <Badge tone="accent">{label(d.plan_type_snapshot)}</Badge>
              <Badge tone={tone(d.status)}>{label(d.status)}</Badge>
              <span className="text-xs" style={{ color: "var(--muted)" }}>Closed {shortDate(d.deal_close_date, tz)}</span>
            </div>
            {dp.map((p: any) => {
              const rec = recvByPlan.get(String(p.id)) ?? [];
              return (
                <div key={p.id} className="mt-3 border-t pt-2" style={{ borderColor: "var(--line)" }}>
                  <div className="flex items-center gap-2 text-sm">
                    <span className="font-medium">Plan v{p.version}</span>
                    <Badge tone={p.is_current ? "good" : "neutral"}>{p.is_current ? "current" : "superseded"}</Badge>
                  </div>
                  {rec.length > 0 && (
                    <div className="mt-2 overflow-x-auto">
                      <table>
                        <thead><tr><th>#</th><th>Due</th><th>Amount</th><th>Status</th></tr></thead>
                        <tbody>{rec.map((r: any) => <tr key={r.id}><td>#{r.installment_no}</td><td>{shortDate(r.due_date, tz)}</td><td>{money(r.amount_minor)}</td><td><Badge tone={tone(r.status)}>{label(r.status)}</Badge></td></tr>)}</tbody>
                      </table>
                    </div>
                  )}
                </div>
              );
            })}
            {pay.length > 0 && (
              <div className="mt-3 border-t pt-2 text-xs" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>
                {pay.length} payment(s) · {money(pay.reduce((s: number, p: any) => s + Number(p.amount_minor), 0))} total
              </div>
            )}
          </Card>
        );
      })}
    </div>
  );

  const agreementsSection = agreements.length === 0 ? <None>No contracts</None> : (
    <Card>
      <div className="overflow-x-auto">
        <table>
          <thead><tr><th>Agreement</th><th>Status</th><th className="text-right">Amount</th><th>Sent</th><th>Signed</th></tr></thead>
          <tbody>
            {agreements.map((a: any) => (
              <tr key={a.id}>
                <td>{a.document_url ? <a href={a.document_url} target="_blank" rel="noreferrer" style={{ color: "var(--accent)" }}>{a.title}</a> : a.title}</td>
                <td><Badge tone={tone(a.status)}>{label(a.status)}</Badge></td>
                <td className="text-right">{a.amount_minor ? money(a.amount_minor) : "—"}</td>
                <td style={{ color: "var(--muted)" }}>{a.sent_at ? shortDate(a.sent_at, tz) : "—"}</td>
                <td style={{ color: "var(--muted)" }}>{a.signed_at ? shortDate(a.signed_at, tz) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );

  const notesSection = (
    <div>
      <NoteForm contactId={id} />
      {notes.length === 0 ? <None>No notes yet</None> : (
        <div className="space-y-2">
          {notes.map((n: any) => (
            <Card key={n.id}>
              <div className="whitespace-pre-wrap text-sm" style={{ color: "var(--text)" }}>{n.body}</div>
              <div className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>{n.author ?? "Team"} · {dateTime(n.created_at, tz)}</div>
            </Card>
          ))}
        </div>
      )}
    </div>
  );

  const TONE_COLOR: Record<string, string> = { good: "var(--good)", warn: "var(--warn)", bad: "var(--bad)", accent: "var(--accent)", neutral: "var(--muted)" };
  const activitySection = activity.length === 0 ? <None>No activity yet</None> : (
    <div className="relative ml-1 border-l pl-4" style={{ borderColor: "var(--line)" }}>
      {activity.map((e, i) => (
        <div key={i} className="relative mb-4">
          <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full" style={{ background: TONE_COLOR[e.tn ?? "neutral"] }} />
          <div className="text-sm" style={{ color: "var(--text)" }}>{e.text}</div>
          {e.sub && <div className="text-[12px]" style={{ color: "var(--muted)" }}>{e.sub}</div>}
          <div className="text-[11px]" style={{ color: "var(--muted)" }}>{dateTime(e.when, tz)}</div>
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center gap-3">
        <h1 className="text-xl font-semibold">{contact.full_name}</h1>
        <Badge tone={tone(contact.lifecycle_status)}>{label(contact.lifecycle_status)}</Badge>
      </div>
      <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
        {contact.primary_email ?? "—"} &middot; {contact.primary_phone ?? "—"} &middot; Owner: {contact.owner ?? "—"}
      </p>
      <div className="mt-4">
        <ContactTabs tabs={[
          { key: "overview", label: "Overview", content: overview },
          { key: "opps", label: "Opportunities", badge: opportunities.length, content: oppsSection },
          { key: "appts", label: "Appointments", badge: appointments.length, content: apptsSection },
          { key: "deals", label: "Deals", badge: deals.length, content: dealsSection },
          { key: "agreements", label: "Contracts", badge: agreements.length, content: agreementsSection },
          { key: "notes", label: "Notes", badge: notes.length, content: notesSection },
          { key: "activity", label: "Activity", content: activitySection },
        ]} />
      </div>
    </div>
  );
}

function Mini({ label: l, value, tn }: { label: string; value: string; tn?: string }) {
  const c: Record<string, string> = { good: "var(--good)", warn: "var(--warn)", bad: "var(--bad)", accent: "var(--accent)", neutral: "var(--text)" };
  return (
    <div className="rounded-lg border p-2.5" style={{ borderColor: "var(--line)", background: "var(--panel)" }}>
      <div className="text-[11px]" style={{ color: "var(--muted)" }}>{l}</div>
      <div className="mt-0.5 text-sm font-semibold" style={{ color: c[tn ?? "neutral"] }}>{value}</div>
    </div>
  );
}
