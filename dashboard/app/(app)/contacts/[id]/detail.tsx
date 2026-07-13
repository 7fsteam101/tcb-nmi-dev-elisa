import Link from "next/link";
import { ReactNode } from "react";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { getSession } from "@/lib/auth";
import { reportTimezone, getSetting } from "@/lib/settings";
import { money, dateTime, shortDate } from "@/lib/format";
import { Badge, STATUS_TONE, label } from "@/components/ui";
import { SectionTabs, SectionGroup } from "@/components/section-nav";
import { AppointmentCards, HashAlias, type ApptCardRow } from "@/components/appointment-cards";
import { OpportunityCards, type OppCardRow } from "@/components/opportunity-cards";
import { ExternalLinks } from "@/components/external-links";
import { Icon } from "@/components/icons";
import { NoteForm } from "./note-form";

// Shared contact-profile body, rendered by both the full page and the drawer.
// Tabbed profile (Katie, July 9): a pill nav directly under the identity header
// switches between sections (Overview / Opt-ins / Opportunities / Appointments
// / Payments / Credit / Reports / Contracts / Notes / Activity) client-side.
// Every panel is still rendered HERE on the server and handed to the
// SectionTabs client wrapper as a slot, so all queries stay server-side.
// Hash deep-links (/contacts/[id]#opt-ins from explore tables) activate the
// matching tab on mount; the legacy #calls hash aliases to #opportunities
// (HashAlias) since that tab was renamed (Katie, July 10). Inside a tab, each
// section is a collapsible tone-tinted SectionGroup box.
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
const TONE_COLOR: Record<string, string> = { good: "var(--good)", warn: "var(--warn)", bad: "var(--bad)", accent: "var(--accent)", neutral: "var(--muted)" };
const gb = (rows: any[], key: string) => {
  const m = new Map<string, any[]>();
  for (const r of rows) { const k = String(r[key]); (m.get(k) ?? m.set(k, []).get(k)!).push(r); }
  return m;
};
const fmtSize = (b: number) =>
  b >= 1048576 ? `${(b / 1048576).toFixed(1)} MB` : b >= 1024 ? `${Math.round(b / 1024)} KB` : `${b} B`;
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

  // Per-user notes visibility (core.app_user.can_view_notes, Katie, July 10):
  // resolved FRESH from the DB, not from the 30-day session JWT, so an admin
  // toggle takes effect on the user's next request. No session, or a session
  // id with no matching row (AUTH_DISABLED synthetic admin on the public
  // demo), defaults to allowed, matching the column default of true.
  const session = await getSession();
  let canViewNotes = true;
  if (session) {
    const [viewer] = await sql`select can_view_notes from core.app_user where id = ${session.id}`;
    if (viewer) canViewNotes = viewer.can_view_notes !== false;
  }

  // pooler-safe: batches of <= 4 concurrent (never everything at once)
  const [identifiers, opportunities, calls, appointments] = await Promise.all([
    sql`select id, type, value, is_primary from core.contact_identifier where contact_id = ${id} order by type, is_primary desc, created_at`,
    // one widened query (no extra round-trips): the Opportunities tab expands
    // each record inline, so it needs the same fields /opportunities/[id]
    // shows (cohort, the three attribution channels, and the DQ / lost
    // reason names when set).
    sql`select o.id, o.stage, o.opened_at, o.closed_at, o.cohort_month,
               o.first_touch_channel, o.last_touch_channel, o.converting_touch_channel,
               dqr.name as dq_reason, lr.name as lost_reason
        from sales.opportunity o
        left join core.dq_reason dqr on dqr.id = o.dq_reason_id
        left join core.lost_reason lr on lr.id = o.lost_reason_id
        where o.contact_id = ${id} order by o.opened_at desc nulls last, o.created_at desc`,
    sql`select c.id, c.opportunity_id, c.type, c.disposition, coalesce(c.scheduled_at, c.occurred_at, c.created_at) as happened_at from sales.call c where c.opportunity_id in (select o.id from sales.opportunity o where o.contact_id = ${id}) order by coalesce(c.scheduled_at, c.occurred_at, c.created_at)`,
    // slots + their parent-call context (calendar, booked by, source, paid) so
    // the Appointments tab can expand each record inline without navigating to
    // /appointments/[id]. Same single query, just wider: pooler load unchanged.
    // a.is_current also powers the Next-appointment KPI tile below.
    sql`select a.id, a.call_id, a.seq, a.scheduled_for, a.status, a.moved_by, a.created_at, a.is_current, r.name as reason,
               c.booked_by, c.booking_source_channel, c.is_paid_booking, c.ghl_appointment_id,
               cm.calendar_name
        from sales.appointment a
        left join core.cancellation_reason r on r.id = a.reason_id
        left join sales.call c on c.id = a.call_id
        left join sync.calendar_map cm on cm.id = c.calendar_map_id
        where a.call_id in (select sc.id from sales.call sc where sc.opportunity_id in (select o.id from sales.opportunity o where o.contact_id = ${id}))
        order by a.scheduled_for desc nulls last`,
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
    // notes are permission-gated: when the viewer's can_view_notes is off,
    // the rows are never even fetched, so the Notes tab, its count, the
    // attachments query below, and the note entries in the Activity feed all
    // disappear together (nothing to filter downstream).
    canViewNotes
      ? sql`select n.id, n.body, n.created_at, u.full_name as author from core.contact_note n left join core.app_user u on u.id = n.author_user_id where n.contact_id = ${id} order by n.created_at desc`
      : Promise.resolve([] as any[]),
    sql`select a.id, a.title, a.status, a.amount_minor, a.sent_at, a.signed_at, a.document_url from sales.agreement a where a.contact_id = ${id} order by coalesce(a.signed_at, a.sent_at, a.created_at) desc`,
  ]);
  // Batches above are already full (4 each), so the remaining queries run as
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
  // note attachments: metadata only (never the bytea), served via /api/attachments/[id]
  const noteAttachments = notes.length > 0 ? await sql`
    select a.id, a.note_id, a.filename, a.size_bytes
    from core.note_attachment a
    where a.note_id in (select n.id from core.contact_note n where n.contact_id = ${id})
    order by a.created_at` : [];

  const callsByOpp = gb(calls, "opportunity_id");
  const plansByDeal = gb(plans, "deal_id");
  const recvByDeal = gb(receivables, "deal_id");
  const paymentsByDeal = gb(payments, "deal_id");
  const attByNote = gb(noteAttachments, "note_id");

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

  // Overview KPI grid: the old top strip and the old overview minis, merged
  // into ONE tinted-Stat grid at the top of the Overview tab (Katie, July 9).
  const booked = calls.filter((c: any) => c.type === "strategy").length;
  const taken = appointments.filter((a: any) => a.status === "taken").length;
  const contractedMinor = deals.filter((d: any) => d.status !== "refunded").reduce((s: number, d: any) => s + Number(d.total_contract_value_minor), 0);
  // last activity = the most recent PAST event; a future-dated booking is not
  // "activity" yet, it surfaces as its own Next-appointment tile instead.
  const now = Date.now();
  const lastActivity = activity.find((e) => new Date(e.when).getTime() <= now)?.when;
  const nextAppt = appointments
    .filter((a: any) => a.is_current && ["scheduled", "confirmed"].includes(a.status) && new Date(a.scheduled_for).getTime() > now)
    .sort((a: any, b: any) => new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime())[0];
  // tn = semantic tone for the VALUE (labels stay muted): counts accent,
  // show-up + money good, recency muted, upcoming warn. The Opt-ins tile links
  // to #opt-ins; the tab wrapper picks that up via its hashchange listener.
  // KPI tiles deep-link into their tab (the tab wrapper listens on hashchange)
  const kpis: { l: string; v: string; tn: string; href?: string }[] = [
    { l: "Lifecycle", v: label(contact.lifecycle_status), tn: "accent" },
    { l: "Opt-ins", v: String(optIns.length), tn: "accent", href: "#opt-ins" },
    { l: "Booked", v: String(booked), tn: "accent", href: "#appointments" },
    { l: "Taken", v: String(taken), tn: "good", href: "#appointments" },
    { l: "Opportunities", v: String(opportunities.length), tn: "accent", href: "#opportunities" },
    { l: "Cash collected", v: money(totalPaid), tn: totalPaid > 0 ? "good" : "neutral", href: "#payments" },
    { l: "Contracted", v: money(contractedMinor), tn: "good", href: "#contracts" },
    { l: "Won deal", v: wonDeal ? money(wonDeal.total_contract_value_minor) : "None", tn: wonDeal ? "good" : "neutral", href: "#payments" },
    { l: "Last activity", v: lastActivity ? shortDate(lastActivity, tz) : "—", tn: "neutral", href: "#activity" },
    ...(nextAppt ? [{ l: "Next appointment", v: shortDate(nextAppt.scheduled_for, tz), tn: "warn", href: "#appointments" }] : []),
  ];

  // ================= tab panels (all server-rendered) =================
  const overviewPanel = (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((k) => <Mini key={k.l} label={k.l} value={k.v} tn={k.tn} href={k.href} />)}
      </div>
      <SectionGroup title="Contact details" tone="accent">
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
      </SectionGroup>
    </div>
  );

  // Every opt-in in full: which form, where it came from, what the lead said,
  // and whether it counts (form gate) / is unique (30-day dedupe).
  const optInsPanel = (
    <SectionGroup title="Opt-ins" tone="accent">
      {optIns.length === 0 ? <None>No opt-ins</None> : (
        <div className="space-y-2">
          {optIns.map((o: any) => (
            <TCard key={o.id}>
              <div className="flex flex-wrap items-center gap-2">
                {o.form_name
                  ? <span className="text-sm font-medium">{o.form_name}</span>
                  : <span className="num text-sm" style={{ color: "var(--muted)" }}>{o.form_id ?? "Form submission"}</span>}
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
            </TCard>
          ))}
        </div>
      )}
    </SectionGroup>
  );

  // Opportunities tab (renamed from "Calls", Katie, July 10): expandable
  // records, same pattern as the Appointments tab (the old cards' only
  // detail path was an "Open ->" link that navigated away). Collapsed keeps
  // the stage / dates / calls summary; expanded shows the /opportunities/[id]
  // field grid inline (attribution, cohort, DQ / lost reasons) plus the
  // linked deal line. Per-call rows still live in the Appointments tab.
  // Display strings are formatted HERE (server, report tz) so hydration
  // re-renders identical text.
  const oppRows: OppCardRow[] = opportunities.map((o: any) => {
    const oc = callsByOpp.get(String(o.id)) ?? [];
    const latest = oc[oc.length - 1]; // calls query is ordered oldest to newest
    const deal = deals.find((d: any) => String(d.opportunity_id) === String(o.id));
    return {
      id: String(o.id),
      stage: o.stage ?? null,
      stageTone: tone(o.stage),
      openedShort: shortDate(o.opened_at, tz),
      closedShort: o.closed_at ? shortDate(o.closed_at, tz) : null,
      openedFull: dateTime(o.opened_at, tz),
      closedFull: o.closed_at ? dateTime(o.closed_at, tz) : null,
      cohortDisplay: o.cohort_month ? shortDate(o.cohort_month, tz) : null,
      firstTouch: o.first_touch_channel ?? null,
      lastTouch: o.last_touch_channel ?? null,
      convertingTouch: o.converting_touch_channel ?? null,
      dqReason: o.dq_reason ?? null,
      lostReason: o.lost_reason ?? null,
      dealValue: deal ? money(deal.total_contract_value_minor) : null,
      dealStatus: deal ? deal.status ?? null : null,
      dealStatusTone: deal ? tone(deal.status) : null,
      callsSummary: oc.length === 0 ? "No calls yet" : `${oc.length} call${oc.length === 1 ? "" : "s"}, latest ${shortDate(latest.happened_at, tz)}`,
    };
  });
  const opportunitiesPanel = (
    <SectionGroup title="Opportunities" tone="warn">
      {oppRows.length === 0 ? <None>No opportunities</None> : <OpportunityCards rows={oppRows} />}
    </SectionGroup>
  );

  // Appointments tab: expandable records instead of a row-per-slot table whose
  // only detail path was the Open link (Katie, July 10: too many hops).
  // Collapsed = date / attempt / status / calendar; expanded = the full-page
  // field grid inline plus the call's slot history. Display strings are
  // formatted HERE (server, report tz) so hydration re-renders identical text.
  const apptRows: ApptCardRow[] = appointments.map((a: any) => ({
    id: String(a.id),
    callId: a.call_id ? String(a.call_id) : null,
    seq: a.seq == null ? null : Number(a.seq),
    status: a.status ?? null,
    scheduledDisplay: dateTime(a.scheduled_for, tz),
    createdDisplay: dateTime(a.created_at, tz),
    calendarName: a.calendar_name ?? null,
    paidBooking: a.is_paid_booking ?? null,
    bookedBy: a.booked_by ?? null,
    sourceChannel: a.booking_source_channel ?? null,
    reason: a.reason ?? null,
    movedBy: a.moved_by ?? null,
    ghlAppointmentId: a.ghl_appointment_id ?? null,
  }));
  const apptsPanel = (
    <SectionGroup title="Appointments" tone="warn">
      {apptRows.length === 0 ? <None>No appointments</None> : <AppointmentCards rows={apptRows} />}
    </SectionGroup>
  );

  const paymentsPanel = (
    <SectionGroup title="Deals and payments" tone="good">
      {deals.length === 0 ? <None>No deals</None> : (
        <div className="space-y-3">
          {deals.map((d: any) => {
            const dp = plansByDeal.get(String(d.id)) ?? [];
            const dRec = recvByDeal.get(String(d.id)) ?? [];
            const pay = paymentsByDeal.get(String(d.id)) ?? [];
            const paidMinor = pay.reduce((s: number, p: any) => s + Number(p.amount_minor), 0);
            const scheduledMinor = dRec.filter((r: any) => r.status !== "paid").reduce((s: number, r: any) => s + Number(r.amount_minor), 0);
            return (
              <TCard key={d.id}>
                <div className="flex flex-wrap items-center gap-3">
                  <span className="text-lg font-semibold">{money(d.total_contract_value_minor)}</span>
                  <Badge tone="accent">{label(d.plan_type_snapshot)}</Badge>
                  <Badge tone={tone(d.status)}>{label(d.status)}</Badge>
                  <span className="text-xs" style={{ color: "var(--muted)" }}>Closed {shortDate(d.deal_close_date, tz)}</span>
                  {/* the card already shows the deal inline; the full page is a
                      secondary path, so the link is demoted to a muted Details
                      (Katie, July 10: no accent Open-arrow as the primary action) */}
                  <Link href={`/deals/${d.id}`} className="ml-auto text-xs" style={{ color: "var(--muted)" }}>Details</Link>
                </div>

                {/* payment plan */}
                {dp.length > 0 && (
                  <div className="mt-3 border-t pt-2" style={{ borderColor: "var(--line)" }}>
                    <div className="mb-1 text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>Payment plan</div>
                    {dp.map((p: any) => (
                      <div key={p.id} className="flex flex-wrap items-center gap-2 text-sm">
                        <span className="font-medium">Version {p.version}</span>
                        <Badge tone={p.is_current ? "good" : "neutral"}>{p.is_current ? "current" : "superseded"}</Badge>
                        <span className="text-xs" style={{ color: "var(--muted)" }}>{label(p.plan_type)}{p.total_minor != null ? ` · ${money(p.total_minor)}` : ""}</span>
                        <Link href={`/plans/${p.id}`} className="ml-auto text-xs" style={{ color: "var(--muted)" }}>Details</Link>
                      </div>
                    ))}
                  </div>
                )}

                {/* receivables (schedule) */}
                {dRec.length > 0 && (
                  <div className="mt-3 border-t pt-2" style={{ borderColor: "var(--line)" }}>
                    <div className="mb-1 flex items-center justify-between">
                      <span className="text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>Receivables</span>
                      <span className="text-xs" style={{ color: "var(--muted)" }}>{money(paidMinor)} paid · {money(scheduledMinor)} scheduled</span>
                    </div>
                    <div className="overflow-x-auto">
                      <table>
                        <thead><tr><th>#</th><th>Due</th><th className="text-right">Amount</th><th>Status</th><th></th></tr></thead>
                        <tbody>
                          {dRec.map((r: any) => (
                            <tr key={r.id}><td className="num">#{r.installment_no}</td><td>{shortDate(r.due_date, tz)}</td><td className="text-right">{money(r.amount_minor)}</td><td><Badge tone={tone(r.status)}>{label(r.status)}</Badge></td><td className="text-right"><Link href={`/receivables/${r.id}`} className="text-xs" style={{ color: "var(--muted)" }}>Details</Link></td></tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}

                {/* payments */}
                {pay.length > 0 && (
                  <div className="mt-3 border-t pt-2" style={{ borderColor: "var(--line)" }}>
                    <div className="mb-1 text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>Payments ({pay.length})</div>
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
              </TCard>
            );
          })}
        </div>
      )}
    </SectionGroup>
  );

  // NAFA audits + intake submissions. Intake rows show ONLY date / provider /
  // status; the credential fields are never queried (see the query comment).
  const creditPanel = (
    <div className="space-y-4">
      <SectionGroup title="NAFA audits" tone="warn" count={nafas.length}>
        {nafas.length === 0 ? <None>No NAFA audits</None> : (
          <div className="space-y-2">
            {nafas.map((n: any) => (
              <TCard key={n.id}>
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
              </TCard>
            ))}
          </div>
        )}
      </SectionGroup>
      <SectionGroup title="Intake submissions" tone="warn" count={intakes.length}>
        {intakes.length === 0 ? <None>No intake submissions</None> : (
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
        )}
      </SectionGroup>
    </div>
  );

  const reportsPanel = (
    <SectionGroup title="Reports" tone="neutral">
      {reports.length === 0 ? <None>No reports filed</None> : (
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
                  {/* demoted (Katie, July 10): the row shows the report inline;
                      this jumps to the RELATED call, so it keeps its honest
                      label but drops the accent treatment */}
                  <td className="text-right">{r.strategy_call_id && <Link href={`/calls/${r.strategy_call_id}`} className="text-xs" style={{ color: "var(--muted)" }}>View call</Link>}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionGroup>
  );

  const contractsPanel = (
    <SectionGroup title="Contracts" tone="accent">
      {agreements.length === 0 ? <None>No contracts</None> : (
        <div className="overflow-x-auto">
          <table>
            <thead><tr><th>Agreement</th><th>Status</th><th className="text-right">Amount</th><th>Sent</th><th>Signed</th><th></th></tr></thead>
            <tbody>
              {agreements.map((a: any) => (
                <tr key={a.id}>
                  {/* row data is all inline, so the full page is demoted to one
                      muted Details link (Katie, July 10); the title no longer
                      doubles as an accent nav-away link */}
                  <td>{a.title}</td>
                  <td><Badge tone={tone(a.status)}>{label(a.status)}</Badge></td>
                  <td className="text-right">{a.amount_minor ? money(a.amount_minor) : "—"}</td>
                  <td style={{ color: "var(--muted)" }}>{a.sent_at ? shortDate(a.sent_at, tz) : "—"}</td>
                  <td style={{ color: "var(--muted)" }}>{a.signed_at ? shortDate(a.signed_at, tz) : "—"}</td>
                  <td className="text-right"><Link href={`/agreements/${a.id}`} className="text-xs" style={{ color: "var(--muted)" }}>Details</Link></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionGroup>
  );

  const notesPanel = (
    <SectionGroup title="Notes" tone="neutral">
      <NoteForm contactId={id} />
      {notes.length === 0 ? <None>No notes yet</None> : (
        <div className="space-y-2">
          {notes.map((n: any) => {
            const atts = attByNote.get(String(n.id)) ?? [];
            return (
              <TCard key={n.id}>
                <div className="whitespace-pre-wrap text-sm" style={{ color: "var(--text)" }}>{n.body}</div>
                {atts.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {atts.map((a: any) => (
                      <a key={a.id} href={`/api/attachments/${a.id}`} target="_blank" rel="noreferrer"
                        className="inline-flex max-w-full items-center gap-1.5 rounded-md border px-2 py-0.5 text-xs font-medium"
                        style={{ borderColor: "var(--line)", background: "var(--panel-2)", color: "var(--accent)" }}>
                        <span className="min-w-0 truncate">{a.filename}</span>
                        <span className="num shrink-0 text-[10px]" style={{ color: "var(--muted)" }}>{fmtSize(Number(a.size_bytes))}</span>
                      </a>
                    ))}
                  </div>
                )}
                <div className="mt-1 text-[12px]" style={{ color: "var(--muted)" }}>{n.author ?? "Team"} · {dateTime(n.created_at, tz)}</div>
              </TCard>
            );
          })}
        </div>
      )}
    </SectionGroup>
  );

  const activityPanel = (
    <SectionGroup title="Activity" tone="neutral">
      {activity.length === 0 ? <None>No activity yet</None> : (
        <div className="relative ml-1 border-l pl-4" style={{ borderColor: "var(--line)" }}>
          {activity.map((e, i) => (
            <div key={i} className="relative mb-3.5">
              <span className="absolute -left-[21px] top-1 h-2.5 w-2.5 rounded-full" style={{ background: TONE_COLOR[e.tn ?? "neutral"] }} />
              <div className="text-sm" style={{ color: "var(--text)" }}>
                {e.href
                  ? <a href={e.href} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1" style={{ color: "var(--accent)" }}>{e.text} <Icon name="external" size={12} /></a>
                  : e.text}
              </div>
              {e.sub && <div className="text-[13px]" style={{ color: "var(--muted)" }}>{e.sub}</div>}
              <div className="text-[11px]" style={{ color: "var(--muted)" }}>{dateTime(e.when, tz)}</div>
            </div>
          ))}
        </div>
      )}
    </SectionGroup>
  );

  return (
    <div>
      {/* header block: a very soft accent gradient anchors the identity area.
          Negative margins cancel the inner padding, so text stays aligned with
          the column and the tint bleeds slightly into the page padding.
          Kept intentionally simple (Katie, July 9): name + lifecycle badge +
          email + phone. No Owner here (it lives in Contact details) and no
          external-system buttons (they live in Contact details > External
          systems, incl. GHL Marketing). */}
      <header className="-mx-3 -mt-2 rounded-xl px-3 pb-1 pt-2"
        style={{ background: "linear-gradient(180deg, color-mix(in srgb, var(--accent) 7%, transparent), transparent 70%)" }}>
        <div className="flex flex-wrap items-center gap-3">
          <h1 className="text-xl font-semibold">{contact.full_name}</h1>
          <Badge tone={tone(contact.lifecycle_status)}>{label(contact.lifecycle_status)}</Badge>
        </div>
        <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>
          {contact.primary_email ?? "—"} &middot; {contact.primary_phone ?? "—"}
        </p>
      </header>
      {/* tab nav sits directly under the identity header; each panel below is
          server-rendered and toggled client-side by SectionTabs. HashAlias
          must render BEFORE SectionTabs so old #calls deep-links are rewritten
          to #opportunities before the tab wrapper reads the hash on mount. */}
      <HashAlias from="calls" to="opportunities" />
      <SectionTabs sections={[
        { id: "overview", label: "Overview", count: 0, panel: overviewPanel },
        { id: "opt-ins", label: "Opt-ins", count: optIns.length, panel: optInsPanel },
        { id: "opportunities", label: "Opportunities", count: opportunities.length, panel: opportunitiesPanel },
        { id: "appointments", label: "Appointments", count: appointments.length, panel: apptsPanel },
        { id: "payments", label: "Payments", count: deals.length, panel: paymentsPanel },
        { id: "credit", label: "Credit", count: nafas.length + intakes.length, panel: creditPanel },
        { id: "reports", label: "Reports", count: reports.length, panel: reportsPanel },
        { id: "contracts", label: "Contracts", count: agreements.length, panel: contractsPanel },
        // can_view_notes off: the Notes tab vanishes entirely (pill, count,
        // and panel together; the rows were never queried, see above)
        ...(canViewNotes ? [{ id: "notes", label: "Notes", count: notes.length, panel: notesPanel }] : []),
        { id: "activity", label: "Activity", count: 0, panel: activityPanel },
      ]} />
    </div>
  );
}

// Section-tinted card: same .card base as components/ui Card, but the border
// color mixes in the surrounding group's tone (--sect, set by SectionGroup).
function TCard({ children }: { children: ReactNode }) {
  return (
    <div className="card p-4" style={{ borderColor: "color-mix(in srgb, var(--sect, var(--muted)) 22%, var(--line))" }}>
      {children}
    </div>
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

// Overview KPI tile: the tinted-Stat treatment the main dashboard uses, i.e.
// tone-tinted background, tone-mixed border, value in the tone color (.num).
// Optional href renders it as a plain anchor (e.g. #opt-ins flips that tab).
function Mini({ label: l, value, tn, href }: { label: string; value: string; tn?: string; href?: string }) {
  const c = TONE_COLOR[tn ?? "accent"] ?? "var(--accent)";
  const style = {
    borderColor: `color-mix(in srgb, ${c} 30%, transparent)`,
    background: `color-mix(in srgb, ${c} 12%, var(--panel))`,
  };
  const inner = (
    <>
      <div className="text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--muted)" }}>{l}</div>
      <div className="num mt-0.5 text-sm font-semibold" style={{ color: c }}>{value}</div>
    </>
  );
  return href
    ? <a href={href} className="block rounded-lg border p-2.5 hover:brightness-110" style={style}>{inner}</a>
    : <div className="rounded-lg border p-2.5" style={style}>{inner}</div>;
}
