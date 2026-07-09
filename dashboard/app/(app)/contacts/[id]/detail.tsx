import Link from "next/link";
import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { reportTimezone, getSetting } from "@/lib/settings";
import { money, dateTime, shortDate } from "@/lib/format";
import { Card, SectionTitle, Badge, STATUS_TONE, label } from "@/components/ui";
import { ExternalLinks } from "@/components/external-links";
import { Icon } from "@/components/icons";
import { NoteForm } from "./note-form";

// Shared contact-profile body — rendered by both the full page and the drawer.
// One flat page of anchored sections (Overview / Opt-ins / Calls / Appointments /
// Payments / Credit / Reports / Contracts / Notes / Activity) with a jump nav,
// a notes composer and a merged activity feed. Flat (not tabbed) on purpose:
// hash deep-links like /contacts/[id]#opt-ins must land on first paint, which
// display:none tab panels cannot do.
const EXTRA_TONE: Record<string, "good" | "warn" | "bad" | "neutral" | "accent"> = {
  lead: "neutral", qualified: "accent", customer: "good", do_not_contact: "bad",
  closed_won: "good", won_pif: "good", won_pp: "good", deposit: "good", active_partner: "good",
  contract_signed: "good", contract_sent: "accent", closing: "accent", interested_partner: "accent",
  lost: "bad", not_a_fit: "bad", call_canceled_by_team: "bad", call_canceled_by_lead: "warn",
  warm_list: "warn", active: "good", refunded: "bad", churned: "warn",
  submitted: "neutral", validated: "good", superseded: "neutral", rejected: "bad", verified: "good",
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
           ct.monday_lead_id, ct.created_source, ct.created_at, ct.updated_at, rep.full_name as owner
    from core.contact ct left join sales.rep rep on rep.id = ct.owner_rep_id where ct.id = ${id}`;
  if (!contact) return <None>Contact not found</None>;
  if (contact.merged_into_contact_id) redirect(`/contacts/${contact.merged_into_contact_id}`);
  const ghlLoc = {
    marketing: await getSetting<string>("ghl_marketing_location_id", ""),
    repair: await getSetting<string>("ghl_repair_location_id", ""),
  };
  const extIds = { closeId: contact.close_id, ghlMarketingId: contact.ghl_marketing_id, ghlRepairId: contact.ghl_repair_id, mondayId: contact.monday_lead_id };
  const tz = await reportTimezone();

  // pooler-safe: batches of <= 4 concurrent (never everything at once)
  const [identifiers, opportunities, calls, appointments] = await Promise.all([
    sql`select id, type, value, is_primary from core.contact_identifier where contact_id = ${id} order by type, is_primary desc, created_at`,
    sql`select o.id, o.stage, o.opened_at, o.closed_at from sales.opportunity o where o.contact_id = ${id} order by o.opened_at desc nulls last, o.created_at desc`,
    sql`select c.id, c.opportunity_id, c.type, c.disposition from sales.call c where c.opportunity_id in (select o.id from sales.opportunity o where o.contact_id = ${id}) order by coalesce(c.scheduled_at, c.occurred_at, c.created_at)`,
    sql`select a.id, a.call_id, a.seq, a.scheduled_for, a.status, a.moved_by, a.created_at, r.name as reason from sales.appointment a left join core.cancellation_reason r on r.id = a.reason_id where a.call_id in (select c.id from sales.call c where c.opportunity_id in (select o.id from sales.opportunity o where o.contact_id = ${id})) order by a.scheduled_for desc nulls last`,
  ]);
  const [deals, plans, receivables, payments] = await Promise.all([
    sql`select d.id, d.opportunity_id, d.plan_type_snapshot, d.total_contract_value_minor, d.status, d.deal_close_date from sales.deal d where d.contact_id = ${id} order by d.deal_close_date desc`,
    sql`select pp.id, pp.deal_id, pp.version, pp.plan_type, pp.total_minor, pp.is_current from finance.payment_plan pp where pp.deal_id in (select d.id from sales.deal d where d.contact_id = ${id}) order by pp.version`,
    sql`select r.id, r.deal_id, r.payment_plan_id, r.installment_no, r.due_date, r.amount_minor, r.status from finance.receivable r where r.deal_id in (select d.id from sales.deal d where d.contact_id = ${id}) order by r.installment_no`,
    sql`select p.id, p.deal_id, p.type, p.amount_minor, p.processor, p.occurred_at from finance.successful_payment p where p.deal_id in (select d.id from sales.deal d where d.contact_id = ${id}) order by p.occurred_at`,
  ]);
  const [optIns, reports, notes, agreements] = await Promise.all([
    sql`select o.id, o.submitted_at, o.source_channel, o.source_campaign, o.form_id, fm.form_name,
               o.utm, o.dub_link_id, o.goal, o.credit_score_range, o.blocker, o.counted, o.counts_as_unique
        from sales.opt_in o left join sync.form_map fm on fm.form_id = o.form_id
        where o.contact_id = ${id} order by o.submitted_at desc`,
    sql`select rs.id, rs.type, rs.submitted_at, rs.status, rs.on_time, rs.strategy_call_id, rep.full_name as rep
        from sales.report_submission rs left join sales.rep rep on rep.id = rs.rep_id
        where rs.strategy_call_id in (select c.id from sales.call c where c.opportunity_id in (select o.id from sales.opportunity o where o.contact_id = ${id})) order by rs.submitted_at desc`,
    sql`select n.id, n.body, n.created_at, u.full_name as author from core.contact_note n left join core.app_user u on u.id = n.author_user_id where n.contact_id = ${id} order by n.created_at desc`,
    sql`select a.id, a.title, a.status, a.amount_minor, a.sent_at, a.signed_at, a.document_url from sales.agreement a where a.contact_id = ${id} order by coalesce(a.signed_at, a.sent_at, a.created_at) desc`,
  ]);
  // Batches above are already full (4 each), so the credit queries run as
  // sequential awaits: never widens the concurrent load on the pooler.
  const nafas = await sql`
    select n.id, n.pulled_at, n.provider, n.violation_opportunities, n.accounts_with_violations,
           n.credit_score, n.utilization_pct, n.qualifies, n.is_canonical, n.report_url, n.report_pdf_url
    from credit.nafa n where n.contact_id = ${id} order by n.pulled_at desc`;
  // SECURITY: credit.intake_submission also holds encrypted credentials
  // (idiq_username/idiq_password, msiq_username/msiq_password, last_4_ssn).
  // NEVER select those columns here. Credentials must never reach the page.
  const intakes = await sql`
    select i.id, i.submitted_at, i.provider, i.status
    from credit.intake_submission i where i.contact_id = ${id} order by i.submitted_at desc`;

  const callsByOpp = gb(calls, "opportunity_id");
  const slotsByCall = gb(appointments, "call_id");
  const plansByDeal = gb(plans, "deal_id");
  const recvByDeal = gb(receivables, "deal_id");
  const paymentsByDeal = gb(payments, "deal_id");

  const extras = identifiers.filter((i: any) => ![contact.primary_email, contact.primary_phone].filter(Boolean).map((v) => String(v).toLowerCase()).includes(String(i.value).toLowerCase()));
  const ghlMktUrl = ghlLoc.marketing && contact.ghl_marketing_id
    ? `https://app.gohighlevel.com/v2/location/${ghlLoc.marketing}/contacts/detail/${contact.ghl_marketing_id}`
    : contact.ghl_marketing_id ? "https://app.gohighlevel.com/" : null;
  const totalPaid = payments.reduce((s: number, p: any) => s + (p.type === "booking_25" ? 0 : Number(p.amount_minor)), 0);
  const wonDeal = deals.find((d: any) => d.status !== "refunded");

  // ---- activity feed (merge everything by time, newest first) ----
  type Ev = { when: any; text: string; sub?: string; tn?: string; href?: string };
  const feed: Ev[] = [];
  optIns.forEach((o: any) => feed.push({ when: o.submitted_at, text: `Form submitted${o.source_channel ? ` via ${label(o.source_channel)}` : ""}`, sub: o.source_campaign ?? undefined, tn: "accent", href: ghlMktUrl ?? undefined }));
  appointments.forEach((a: any) => feed.push({ when: a.scheduled_for, text: `Appointment ${label(a.status)}`, sub: a.reason ?? undefined, tn: tone(a.status) }));
  deals.forEach((d: any) => feed.push({ when: d.deal_close_date, text: `Deal ${label(d.status)} ${money(d.total_contract_value_minor)}`, tn: d.status === "refunded" ? "bad" : "good" }));
  payments.forEach((p: any) => feed.push({ when: p.occurred_at, text: `Payment ${money(p.amount_minor)}`, sub: label(p.type), tn: "good" }));
  agreements.forEach((a: any) => feed.push({ when: a.signed_at ?? a.sent_at, text: `Agreement ${label(a.status)}`, sub: a.amount_minor ? money(a.amount_minor) : undefined, tn: tone(a.status) }));
  reports.forEach((r: any) => feed.push({ when: r.submitted_at, text: `${label(r.type)} report ${label(r.status)}`, tn: tone(r.status) }));
  notes.forEach((n: any) => feed.push({ when: n.created_at, text: `Note by ${n.author ?? "team"}`, sub: n.body, tn: "neutral" }));
  const activity = feed.filter((e) => e.when).sort((a, b) => new Date(b.when).getTime() - new Date(a.when).getTime());

  // top-of-profile metric strip
  const booked = calls.filter((c: any) => c.type === "strategy").length;
  const taken = appointments.filter((a: any) => a.status === "taken").length;
  const contractedMinor = deals.filter((d: any) => d.status !== "refunded").reduce((s: number, d: any) => s + Number(d.total_contract_value_minor), 0);
  // last activity = the most recent PAST event; a future-dated booking is not
  // "activity" yet, it surfaces as its own Next-appointment chip instead.
  const now = Date.now();
  const lastActivity = activity.find((e) => new Date(e.when).getTime() <= now)?.when;
  const nextAppt = appointments
    .filter((a: any) => a.is_current && ["scheduled", "confirmed"].includes(a.status) && new Date(a.scheduled_for).getTime() > now)
    .sort((a: any, b: any) => new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime())[0];
  const strip: { l: string; v: string; href?: string }[] = [
    { l: "Opt-ins", v: String(optIns.length), href: "#opt-ins" },
    { l: "Booked", v: String(booked) },
    { l: "Taken", v: String(taken) },
    { l: "Opportunities", v: String(opportunities.length) },
    { l: "Cash collected", v: money(totalPaid) },
    { l: "Contracted", v: money(contractedMinor) },
    { l: "Last activity", v: lastActivity ? shortDate(lastActivity, tz) : "—" },
    ...(nextAppt ? [{ l: "Next appointment", v: shortDate(nextAppt.scheduled_for, tz) }] : []),
  ];

  // ================= sections =================
  const overview = (
    <div>
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Mini label="Lifecycle" value={label(contact.lifecycle_status)} tn={tone(contact.lifecycle_status)} />
        <Mini label="Opportunities" value={String(opportunities.length)} />
        <Mini label="Cash collected" value={money(totalPaid)} tn={totalPaid > 0 ? "good" : "neutral"} />
        <Mini label="Won deal" value={wonDeal ? money(wonDeal.total_contract_value_minor) : "None"} tn={wonDeal ? "good" : "neutral"} />
      </div>
      <SectionTitle>Contact details</SectionTitle>
      <Card>
        <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
          <Detail label="Email" value={contact.primary_email} />
          <Detail label="Phone" value={contact.primary_phone} />
          <Detail label="Owner" value={contact.owner} />
          <Detail label="Created via" value={contact.created_source ? label(contact.created_source) : null} />
          <Detail label="Created" value={dateTime(contact.created_at, tz)} />
          <Detail label="Last updated" value={dateTime(contact.updated_at, tz)} />
          {extras.length > 0 && <Detail label="Other identifiers" value={extras.map((i: any) => `${label(i.type)} ${i.value}`).join(" · ")} />}
        </div>
        {(contact.close_id || contact.ghl_marketing_id || contact.ghl_repair_id || contact.monday_lead_id) && (
          <div className="mt-3 border-t pt-3" style={{ borderColor: "var(--line)" }}>
            <div className="mb-2 text-xs" style={{ color: "var(--muted)" }}>External systems</div>
            <ExternalLinks ids={extIds} loc={ghlLoc} variant="urls" />
          </div>
        )}
      </Card>
    </div>
  );

  // Every opt-in in full: which form, where it came from, what the lead said,
  // and whether it counts (form gate) / is unique (30-day dedupe).
  const optInsSection = optIns.length === 0 ? <None>No opt-ins</None> : (
    <div className="space-y-2">
      {optIns.map((o: any) => (
        <Card key={o.id}>
          <div className="flex flex-wrap items-center gap-2">
            {o.form_name
              ? <span className="text-sm font-medium">{o.form_name}</span>
              : <span className="font-mono text-xs" style={{ color: "var(--muted)" }}>{o.form_id ?? "Form submission"}</span>}
            <Badge tone={o.counted ? "good" : "neutral"}>{o.counted ? "Counts" : "Not counted"}</Badge>
            <Badge tone={o.counts_as_unique ? "accent" : "warn"}>{o.counts_as_unique ? "Unique" : "Repeat"}</Badge>
            <span className="ml-auto text-xs" style={{ color: "var(--muted)" }}>{dateTime(o.submitted_at, tz)}</span>
          </div>
          <div className="mt-2 grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2">
            <Detail label="Source" value={label(o.source_channel)} />
            <Detail label="Campaign" value={o.source_campaign} />
            <Detail label="Goal" value={label(o.goal)} />
            <Detail label="Credit score" value={o.credit_score_range} />
            <Detail label="Blocker" value={o.blocker} />
            <Detail label="UTM" value={o.utm} />
            {o.dub_link_id && <Detail label="Dub link" value={o.dub_link_id} />}
          </div>
        </Card>
      ))}
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
              <Link href={`/opportunities/${o.id}`} className="ml-auto text-xs font-medium" style={{ color: "var(--accent)" }}>Open &rarr;</Link>
            </div>
            {oc.map((c: any) => (
              <div key={c.id} className="mt-3 border-t pt-2" style={{ borderColor: "var(--line)" }}>
                <Link href={`/calls/${c.id}`} className="flex items-center gap-2 rounded px-1 py-0.5 hover:bg-white/5">
                  <Badge tone="neutral">{label(c.type)}</Badge>
                  {c.disposition && <Badge tone={tone(c.disposition)}>{label(c.disposition)}</Badge>}
                  <span className="text-[11px]" style={{ color: "var(--muted)" }}>{(slotsByCall.get(String(c.id)) ?? []).length} slot(s)</span>
                  <span className="ml-auto text-xs" style={{ color: "var(--accent)" }}>Open &rarr;</span>
                </Link>
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
          <thead><tr><th>Scheduled for</th><th>Attempt</th><th>Status</th><th>Reason</th><th>Moved by</th><th></th></tr></thead>
          <tbody>
            {appointments.map((a: any) => (
              <tr key={a.id}>
                <td>{dateTime(a.scheduled_for, tz)}</td>
                <td>{a.seq > 1 ? <Badge tone="warn">#{a.seq}</Badge> : "#1"}</td>
                <td><Badge tone={tone(a.status)}>{label(a.status)}</Badge></td>
                <td style={{ color: "var(--muted)" }}>{a.reason ?? "—"}</td>
                <td className="capitalize" style={{ color: "var(--muted)" }}>{label(a.moved_by)}</td>
                <td className="text-right"><Link href={`/appointments/${a.id}`} className="text-xs" style={{ color: "var(--accent)" }}>Open &rarr;</Link></td>
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
        const dRec = recvByDeal.get(String(d.id)) ?? [];
        const pay = paymentsByDeal.get(String(d.id)) ?? [];
        const paidMinor = pay.reduce((s: number, p: any) => s + Number(p.amount_minor), 0);
        const scheduledMinor = dRec.filter((r: any) => r.status !== "paid").reduce((s: number, r: any) => s + Number(r.amount_minor), 0);
        return (
          <Card key={d.id}>
            <div className="flex flex-wrap items-center gap-3">
              <span className="text-lg font-semibold">{money(d.total_contract_value_minor)}</span>
              <Badge tone="accent">{label(d.plan_type_snapshot)}</Badge>
              <Badge tone={tone(d.status)}>{label(d.status)}</Badge>
              <span className="text-xs" style={{ color: "var(--muted)" }}>Closed {shortDate(d.deal_close_date, tz)}</span>
              <Link href={`/deals/${d.id}`} className="ml-auto text-xs font-medium" style={{ color: "var(--accent)" }}>Open deal &rarr;</Link>
            </div>

            {/* payment plan */}
            {dp.length > 0 && (
              <div className="mt-3 border-t pt-2" style={{ borderColor: "var(--line)" }}>
                <div className="mb-1 text-[11px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>Payment plan</div>
                {dp.map((p: any) => (
                  <div key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
                    <Link href={`/plans/${p.id}`} className="font-medium" style={{ color: "var(--accent)" }}>Version {p.version}</Link>
                    <Badge tone={p.is_current ? "good" : "neutral"}>{p.is_current ? "current" : "superseded"}</Badge>
                    <span className="text-xs" style={{ color: "var(--muted)" }}>{label(p.plan_type)}{p.total_minor != null ? ` · ${money(p.total_minor)}` : ""}</span>
                  </div>
                ))}
              </div>
            )}

            {/* receivables (schedule) */}
            {dRec.length > 0 && (
              <div className="mt-3 border-t pt-2" style={{ borderColor: "var(--line)" }}>
                <div className="mb-1 flex items-center justify-between">
                  <span className="text-[11px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>Receivables</span>
                  <span className="text-[11px]" style={{ color: "var(--muted)" }}>{money(paidMinor)} paid · {money(scheduledMinor)} scheduled</span>
                </div>
                <div className="overflow-x-auto">
                  <table>
                    <thead><tr><th>#</th><th>Due</th><th className="text-right">Amount</th><th>Status</th></tr></thead>
                    <tbody>
                      {dRec.map((r: any) => (
                        <tr key={r.id}><td><Link href={`/receivables/${r.id}`} style={{ color: "var(--accent)" }}>#{r.installment_no}</Link></td><td>{shortDate(r.due_date, tz)}</td><td className="text-right">{money(r.amount_minor)}</td><td><Badge tone={tone(r.status)}>{label(r.status)}</Badge></td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}

            {/* payments */}
            {pay.length > 0 && (
              <div className="mt-3 border-t pt-2" style={{ borderColor: "var(--line)" }}>
                <div className="mb-1 text-[11px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>Payments ({pay.length})</div>
                <div className="overflow-x-auto">
                  <table>
                    <thead><tr><th>Paid</th><th>Type</th><th className="text-right">Amount</th><th>Processor</th></tr></thead>
                    <tbody>
                      {pay.map((p: any) => (
                        <tr key={p.id}><td>{shortDate(p.occurred_at, tz)}</td><td style={{ color: "var(--muted)" }}>{label(p.type)}</td><td className="text-right">{money(p.amount_minor)}</td><td style={{ color: "var(--muted)" }}>{label(p.processor)}</td></tr>
                      ))}
                    </tbody>
                  </table>
                </div>
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
          <thead><tr><th>Agreement</th><th>Status</th><th className="text-right">Amount</th><th>Sent</th><th>Signed</th><th></th></tr></thead>
          <tbody>
            {agreements.map((a: any) => (
              <tr key={a.id}>
                <td><Link href={`/agreements/${a.id}`} style={{ color: "var(--accent)" }}>{a.title}</Link></td>
                <td><Badge tone={tone(a.status)}>{label(a.status)}</Badge></td>
                <td className="text-right">{a.amount_minor ? money(a.amount_minor) : "—"}</td>
                <td style={{ color: "var(--muted)" }}>{a.sent_at ? shortDate(a.sent_at, tz) : "—"}</td>
                <td style={{ color: "var(--muted)" }}>{a.signed_at ? shortDate(a.signed_at, tz) : "—"}</td>
                <td className="text-right"><Link href={`/agreements/${a.id}`} className="text-xs" style={{ color: "var(--accent)" }}>Open &rarr;</Link></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </Card>
  );

  // NAFA audits + intake submissions. Intake rows show ONLY date / provider /
  // status; the credential fields are never queried (see the query comment).
  const creditSection = (
    <div>
      <div className="mb-2 text-[11px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>NAFA audits</div>
      {nafas.length === 0 ? <None>No NAFA audits</None> : (
        <div className="space-y-2">
          {nafas.map((n: any) => (
            <Card key={n.id}>
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-sm font-medium">{dateTime(n.pulled_at, tz)}</span>
                <span className="text-xs" style={{ color: "var(--muted)" }}>{label(n.provider)}</span>
                {n.is_canonical && <Badge tone="accent">Canonical</Badge>}
                {n.qualifies != null && <Badge tone={n.qualifies ? "good" : "bad"}>{n.qualifies ? "Qualifies" : "Does not qualify"}</Badge>}
                <span className="ml-auto flex items-center gap-1.5">
                  {n.report_url && <ExtLink href={n.report_url}>Report</ExtLink>}
                  {n.report_pdf_url && <ExtLink href={n.report_pdf_url}>PDF</ExtLink>}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2">
                <Detail label="Violations" value={n.violation_opportunities == null ? null : String(n.violation_opportunities)} />
                <Detail label="Accounts hit" value={n.accounts_with_violations == null ? null : String(n.accounts_with_violations)} />
                <Detail label="Credit score" value={n.credit_score == null ? null : String(n.credit_score)} />
                <Detail label="Utilization" value={n.utilization_pct == null ? null : `${Number(n.utilization_pct)}%`} />
              </div>
            </Card>
          ))}
        </div>
      )}
      <div className="mb-2 mt-5 text-[11px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>Intake submissions</div>
      {intakes.length === 0 ? <None>No intake submissions</None> : (
        <Card>
          <div className="overflow-x-auto">
            <table>
              <thead><tr><th>Submitted</th><th>Provider</th><th>Status</th></tr></thead>
              <tbody>
                {intakes.map((i: any) => (
                  <tr key={i.id}>
                    <td>{dateTime(i.submitted_at, tz)}</td>
                    <td style={{ color: "var(--muted)" }}>{label(i.provider)}</td>
                    <td><Badge tone={tone(i.status)}>{label(i.status)}</Badge></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </div>
  );

  const reportsSection = reports.length === 0 ? <None>No reports filed</None> : (
    <Card>
      <div className="overflow-x-auto">
        <table>
          <thead><tr><th>Type</th><th>Submitted</th><th>Rep</th><th>Status</th><th>On time</th><th></th></tr></thead>
          <tbody>
            {reports.map((r: any) => (
              <tr key={r.id}>
                <td><Badge tone="neutral">{label(r.type)}</Badge></td>
                <td>{dateTime(r.submitted_at, tz)}</td>
                <td style={{ color: "var(--muted)" }}>{r.rep ?? "—"}</td>
                <td><Badge tone={tone(r.status)}>{label(r.status)}</Badge></td>
                <td>{r.on_time === false
                  ? <Badge tone="warn">Late</Badge>
                  : r.on_time === true ? <span className="text-xs" style={{ color: "var(--muted)" }}>On time</span> : "—"}</td>
                <td className="text-right">{r.strategy_call_id && <Link href={`/calls/${r.strategy_call_id}`} className="text-xs" style={{ color: "var(--accent)" }}>View call &rarr;</Link>}</td>
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
          <div className="text-sm" style={{ color: "var(--text)" }}>
            {e.href
              ? <a href={e.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1" style={{ color: "var(--accent)" }}>{e.text} <Icon name="external" size={12} /></a>
              : e.text}
          </div>
          {e.sub && <div className="text-[12px]" style={{ color: "var(--muted)" }}>{e.sub}</div>}
          <div className="text-[11px]" style={{ color: "var(--muted)" }}>{dateTime(e.when, tz)}</div>
        </div>
      ))}
    </div>
  );

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{contact.full_name}</h1>
          <Badge tone={tone(contact.lifecycle_status)}>{label(contact.lifecycle_status)}</Badge>
        </div>
        <ExternalLinks ids={extIds} loc={ghlLoc} variant="buttons" />
      </div>
      <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
        {contact.primary_email ?? "—"} &middot; {contact.primary_phone ?? "—"} &middot; Owner: {contact.owner ?? "—"}
      </p>
      <div className="mt-3 flex flex-wrap gap-x-6 gap-y-2 border-y py-2.5" style={{ borderColor: "var(--line)" }}>
        {strip.map((s) => {
          const inner = (
            <>
              <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>{s.l}</div>
              <div className="text-sm font-semibold tabular-nums" style={{ color: "var(--text)" }}>{s.v}</div>
            </>
          );
          return s.href
            ? <a key={s.l} href={s.href} className="-mx-1 rounded-md px-1 hover:bg-white/5">{inner}</a>
            : <div key={s.l}>{inner}</div>;
        })}
      </div>
      {/* jump nav: anchor links (same visual language as the old tab bar).
          Sticky so section links stay reachable while scrolled deep; opaque
          --bg so sections slide under it cleanly. zIndex stays below the
          drawer's own sticky bar (z-10) so it tucks under it there. */}
      <div className="sticky top-0 mt-1 flex flex-wrap gap-1 border-b"
        style={{ borderColor: "var(--line)", background: "var(--bg)", zIndex: 5 }}>
        {([
          ["overview", "Overview", 0],
          ["opt-ins", "Opt-ins", optIns.length],
          ["calls", "Calls", opportunities.length],
          ["appointments", "Appointments", appointments.length],
          ["payments", "Payments", deals.length],
          ["credit", "Credit", nafas.length + intakes.length],
          ["reports", "Reports", reports.length],
          ["contracts", "Contracts", agreements.length],
          ["notes", "Notes", notes.length],
          ["activity", "Activity", 0],
        ] as [string, string, number][]).map(([anchor, name, count]) => (
          <a key={anchor} href={`#${anchor}`}
            className="flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium hover:bg-white/5"
            style={{ color: "var(--muted)" }}>
            {name}
            {count > 0 && <span className="rounded-full px-1.5 text-[10px]" style={{ background: "var(--panel-2)", color: "var(--muted)" }}>{count}</span>}
          </a>
        ))}
      </div>
      <Section id="overview" title="Overview">{overview}</Section>
      <Section id="opt-ins" title="Opt-ins">{optInsSection}</Section>
      <Section id="calls" title="Opportunities and calls">{oppsSection}</Section>
      <Section id="appointments" title="Appointments">{apptsSection}</Section>
      <Section id="payments" title="Deals and payments">{dealsSection}</Section>
      <Section id="credit" title="Credit">{creditSection}</Section>
      <Section id="reports" title="Reports">{reportsSection}</Section>
      <Section id="contracts" title="Contracts">{agreementsSection}</Section>
      <Section id="notes" title="Notes">{notesSection}</Section>
      <Section id="activity" title="Activity">{activitySection}</Section>
    </div>
  );
}

// Anchored section wrapper: the id is the deep-link target (#opt-ins etc.);
// scrollMarginTop keeps the heading clear of the sticky app header on jump.
function Section({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <section id={id} className="mt-8" style={{ scrollMarginTop: 80 }}>
      <SectionTitle>{title}</SectionTitle>
      {children}
    </section>
  );
}

// Small bordered external-link button (report / PDF URLs), always a new tab.
function ExtLink({ href, children }: { href: string; children: ReactNode }) {
  return (
    <a href={href} target="_blank" rel="noreferrer"
      className="inline-flex items-center gap-1 rounded-md border px-2 py-0.5 text-xs font-medium"
      style={{ borderColor: "var(--line)", color: "var(--accent)", background: "var(--panel)" }}>
      {children} <Icon name="external" size={11} />
    </a>
  );
}

function Detail({ label: l, value }: { label: string; value: string | null | undefined }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-28 shrink-0 text-xs" style={{ color: "var(--muted)" }}>{l}</span>
      <span className="min-w-0 truncate text-sm" style={{ color: "var(--text)" }}>{value || "—"}</span>
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
