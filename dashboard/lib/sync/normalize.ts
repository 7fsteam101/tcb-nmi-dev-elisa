import { sql } from "../db";
import { upsertContact, findOrCreateActiveOpportunity } from "./contacts";
import type { Provider } from "./providers";

// ---------------------------------------------------------------------
// Close: the DB is a faithful MIRROR of Close. Users move opportunities
// anywhere; we reflect it 1:1 by close_id. No direction rules here.
// ---------------------------------------------------------------------
const slug = (s: string) => s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

const STAGE_ALIASES: Record<string, string> = {
  // the redesigned 18-stage pipeline (spec)
  lead_opt_in: "lead_opt_in", strategy_call_booked: "strategy_call_booked",
  intake_form_submitted: "intake_form_submitted", audit_complete: "audit_complete",
  intake_form_needed: "intake_form_needed", call_confirmed: "call_confirmed",
  no_show: "no_show", call_canceled_by_lead: "call_canceled_by_lead",
  call_cancelled_by_lead: "call_canceled_by_lead", call_canceled_by_team: "call_canceled_by_team",
  call_cancelled_by_team: "call_canceled_by_team", follow_up_call_booked: "follow_up_call_booked",
  warm_list: "warm_list", contract_sent: "contract_sent", contract_signed: "contract_signed",
  deposit: "deposit", won_pif: "won_pif", won_pp: "won_pp", lost: "lost",
  dq_on_call: "dq_on_call", dqd_on_call: "dq_on_call",
  // the LIVE pipeline in their Close org today (incl. the partner track)
  eligibility_call_booked: "eligibility_call_booked",
  intake_submitted: "intake_form_submitted",
  call_completed: "call_completed",
  closing: "closing",
  closed_won: "closed_won",
  interested_partner: "interested_partner",
  active_partner: "active_partner",
  not_a_fit: "not_a_fit",
};
export const mapCloseStage = (label: string): string | null => STAGE_ALIASES[slug(label)] ?? null;

const WON = ["deposit", "won_pif", "won_pp", "closed_won", "active_partner"];
const TERMINAL = [...WON, "lost", "dq_on_call", "call_canceled_by_team", "not_a_fit"];

async function normalizeClose(eventType: string, payload: any): Promise<string> {
  const data = payload?.event?.data ?? payload?.data ?? payload;
  const objectType = payload?.event?.object_type ?? payload?.object_type;

  if (objectType === "lead") {
    const c = data?.contacts?.[0];
    await upsertContact({
      closeId: data.id,
      fullName: data.display_name ?? data.name,
      email: c?.emails?.[0]?.email,
      phone: c?.phones?.[0]?.phone,
    });
    return "lead mirrored";
  }

  if (objectType === "opportunity") {
    const stage = data.status_label ? mapCloseStage(data.status_label) : null;
    if (data.status_label && !stage) throw new Error(`Unmapped Close stage label: ${data.status_label}`);

    // contact by lead close_id (stub if we have not seen the lead yet)
    const { id: contactId } = await upsertContact({ closeId: data.lead_id, fullName: data.lead_name });

    const existing = await sql`select id, stage from sales.opportunity where close_id = ${data.id} limit 1`;
    if (existing.length) {
      await sql`
        update sales.opportunity set
          stage = coalesce(${stage}::public.opportunity_stage, stage),
          closed_at = case when ${stage ?? null}::text = any(${TERMINAL}) then coalesce(closed_at, now())
                           when ${stage ?? null}::text is not null then null else closed_at end
        where id = ${existing[0].id}`;
      if (stage && WON.includes(stage)) {
        const hasDeal = await sql`select 1 from sales.deal where opportunity_id = ${existing[0].id}`;
        if (hasDeal.length === 0) return "won in Close, no deal recorded yet — submit the Sales Call form to log terms";
      }
      return `opportunity mirrored (${stage ?? "no stage change"})`;
    }
    await sql`
      insert into sales.opportunity (contact_id, stage, opened_at, close_id, cohort_month, closed_at)
      values (${contactId}, ${stage ?? "lead_opt_in"}, coalesce(${data.date_created ?? null}, now()), ${data.id},
              date_trunc('month', now())::date,
              case when ${stage ?? null}::text = any(${TERMINAL}) then now() else null end)`;
    return "opportunity created (mirror)";
  }
  return `ignored object_type ${objectType ?? "unknown"}`;
}

// ---------------------------------------------------------------------
// GHL: events arrive from workflow custom webhooks using our envelope:
// { tcb_event, location_id, contact:{id,name,first_name,last_name,email,phone},
//   appointment:{id,start_time}, reason, moved_by, form:{...} }
// ---------------------------------------------------------------------
async function currentSlot(callId: string) {
  const rows = await sql`
    select id, status, seq from sales.appointment where call_id = ${callId} and is_current limit 1`;
  return rows[0] ?? null;
}

async function addSlot(callId: string, startTime: string | null, seq: number) {
  await sql`update sales.appointment set is_current = false where call_id = ${callId}`;
  await sql`
    insert into sales.appointment (call_id, seq, scheduled_for, status, is_current)
    values (${callId}, ${seq}, ${startTime ?? new Date().toISOString()}, 'scheduled', true)`;
}

// Calendar categorization: every GHL appointment resolves its call type through
// sync.calendar_map (admin-managed). Unknown calendars auto-register as strategy
// and surface in the admin panel for review.
async function resolveCallType(locationId: string, calendarId: string | null, calendarName: string | null) {
  if (!calendarId) return { type: "strategy" as const, isBooking: true };
  const rows = await sql`
    insert into sync.calendar_map (location_id, calendar_id, calendar_name)
    values (${locationId}, ${calendarId}, ${calendarName ?? null})
    on conflict (location_id, calendar_id)
    do update set calendar_name = coalesce(sync.calendar_map.calendar_name, excluded.calendar_name)
    returning call_type, is_booking, active`;
  const m = rows[0];
  return { type: (m?.active ? m.call_type : "strategy") as "readiness" | "strategy" | "follow_up", isBooking: m?.is_booking ?? true };
}

async function findOrCreateCall(oppId: string, type: string, startTime: string | null, source?: string): Promise<string> {
  const rows = type === "strategy"
    ? await sql`select id from sales.call where opportunity_id = ${oppId} and type = 'strategy' and is_primary limit 1`
    : await sql`select id from sales.call where opportunity_id = ${oppId} and type = ${type} order by created_at desc limit 1`;
  if (rows.length) return rows[0].id;
  const created = await sql`
    insert into sales.call (opportunity_id, type, scheduled_at, booking_source_channel, is_primary)
    values (${oppId}, ${type}, ${startTime ?? new Date().toISOString()}, ${source ?? null}, ${type === "strategy"})
    returning id`;
  return created[0].id;
}

async function normalizeGhl(eventType: string, payload: any): Promise<string> {
  const p = payload ?? {};
  const pc = p.contact ?? {};
  const { id: contactId } = await upsertContact({
    ghlMarketingId: pc.id,
    fullName: pc.name ?? pc.full_name,
    firstName: pc.first_name,
    lastName: pc.last_name,
    email: pc.email,
    phone: pc.phone,
  });
  const event = p.tcb_event ?? eventType;

  if (event === "form_submitted") {
    const oppId = await findOrCreateActiveOpportunity(contactId, p.form?.source ?? "meta_ads");
    await sql`
      insert into sales.opt_in (contact_id, opportunity_id, submitted_at, goal, credit_score_range, blocker,
                                source_channel, source_campaign, utm, counts_as_unique)
      values (${contactId}, ${oppId}, now(), ${p.form?.goal ?? "other"}, ${p.form?.credit_score_range ?? null},
              ${p.form?.blocker ?? null}, ${p.form?.source ?? "meta_ads"}, ${p.form?.campaign ?? null}, ${p.form?.utm ?? null},
              not exists (select 1 from sales.opt_in where contact_id = ${contactId} and submitted_at > now() - interval '30 days'))`;
    return "opt-in recorded";
  }

  if (event === "contact_upserted") return "contact enriched"; // identity-only event (backfill/pull)

  if (event === "intake_submitted") {
    const oppId = await findOrCreateActiveOpportunity(contactId);
    await sql`
      insert into credit.intake_submission (opportunity_id, contact_id, submitted_at, provider, status)
      values (${oppId}, ${contactId}, now(), ${p.provider === "myscoreiq" ? "myscoreiq" : "identityiq"}, 'submitted')`;
    await sql`update sales.opportunity set stage = 'intake_form_submitted' where id = ${oppId} and stage in ('lead_opt_in','strategy_call_booked','intake_form_needed')`;
    return "intake recorded (no credentials over webhook — the credential pull stays in the existing worker)";
  }

  const startTime = p.appointment?.start_time ?? p.appointment?.startTime ?? null;
  const calendar = await resolveCallType(
    p.location_id ?? "default",
    p.appointment?.calendar_id ?? p.appointment?.calendarId ?? null,
    p.appointment?.calendar_name ?? p.appointment?.calendarName ?? null,
  );
  const oppId = await findOrCreateActiveOpportunity(contactId, p.source);
  const callId = await findOrCreateCall(oppId, calendar.type, startTime, p.source);
  const slot = await currentSlot(callId);

  switch (event) {
    case "appointment_booked": {
      if (!slot) await addSlot(callId, startTime, 1);
      else if (["taken", "no_show", "cancelled_by_lead", "cancelled_by_team", "rescheduled"].includes(slot.status))
        await addSlot(callId, startTime, slot.seq + 1); // terminal slots are immutable — new slot
      if (calendar.type === "strategy" && calendar.isBooking)
        await sql`update sales.opportunity set stage = 'strategy_call_booked' where id = ${oppId} and stage = 'lead_opt_in'`;
      return `booking slot recorded (${calendar.type} calendar)`;
    }
    case "appointment_rescheduled": {
      if (slot && ["scheduled", "confirmed"].includes(slot.status)) {
        await sql`
          update sales.appointment set status = 'rescheduled', rescheduled_at = now(),
            moved_by = ${p.moved_by === "closer" ? "closer" : "lead_link"},
            reason_id = (select id from core.cancellation_reason where name = ${p.reason ?? ""} limit 1)
          where id = ${slot.id}`;
      }
      await addSlot(callId, startTime, (slot?.seq ?? 0) + 1);
      await sql`update sales.call set current_scheduled_at = ${startTime} where id = ${callId}`;
      return "reschedule recorded (old slot kept, new slot current)";
    }
    case "appointment_confirmed": {
      if (slot && slot.status === "scheduled")
        await sql`update sales.appointment set status = 'confirmed' where id = ${slot.id}`;
      return "confirmation recorded";
    }
    case "appointment_cancelled_by_lead":
    case "appointment_cancelled_by_team": {
      if (slot && ["scheduled", "confirmed"].includes(slot.status)) {
        const status = event.endsWith("team") ? "cancelled_by_team" : "cancelled_by_lead";
        await sql`
          update sales.appointment set status = ${status},
            reason_id = (select id from core.cancellation_reason where name = ${p.reason ?? ""} limit 1)
          where id = ${slot.id}`;
      }
      return "cancellation recorded";
    }
    case "appointment_no_show": {
      if (slot && ["scheduled", "confirmed"].includes(slot.status))
        await sql`update sales.appointment set status = 'no_show' where id = ${slot.id}`;
      return "no-show recorded";
    }
    case "appointment_showed": {
      if (slot && ["scheduled", "confirmed"].includes(slot.status)) {
        await sql`update sales.appointment set status = 'taken' where id = ${slot.id}`;
        await sql`update sales.call set occurred_at = coalesce(occurred_at, now()) where id = ${callId}`;
      }
      return "call taken recorded";
    }
    default:
      return `ignored ghl event ${event}`;
  }
}

// ---------------------------------------------------------------------
// Stripe: the $25 booking fee lives on Stripe. Link by email, best effort.
// ---------------------------------------------------------------------
async function normalizeStripe(eventType: string, payload: any): Promise<string> {
  const obj = payload?.data?.object ?? payload;
  if (!["charge.succeeded", "payment_intent.succeeded", "checkout.session.completed"].includes(payload?.type ?? eventType))
    return `ignored stripe event ${payload?.type ?? eventType}`;
  const amount = obj.amount_received ?? obj.amount_total ?? obj.amount ?? 0;
  const email = obj.billing_details?.email ?? obj.customer_details?.email ?? obj.receipt_email ?? null;
  const chargeId = obj.id;

  let strategyCallId: string | null = null;
  if (email) {
    const rows = await sql`
      select c.id from sales.call c
      join sales.opportunity o on o.id = c.opportunity_id
      join core.contact ct on ct.id = o.contact_id
      where c.type = 'strategy' and c.booking_payment_id is null
        and (lower(ct.primary_email) = lower(${email}) or exists (
          select 1 from core.contact_identifier ci where ci.contact_id = ct.id and ci.type = 'email' and lower(ci.value) = lower(${email})))
      order by c.created_at desc limit 1`;
    strategyCallId = rows[0]?.id ?? null;
  }
  const [pay] = await sql`
    insert into finance.successful_payment (strategy_call_id, processor, type, amount_minor, occurred_at, stripe_charge_id)
    values (${strategyCallId}, 'stripe', 'booking_25', ${amount}, now(), ${chargeId})
    returning id`;
  if (strategyCallId) await sql`update sales.call set booking_payment_id = ${pay.id} where id = ${strategyCallId}`;
  return strategyCallId ? "booking fee linked to strategy call" : "booking fee stored (no matching call yet)";
}

// ---------------------------------------------------------------------
// NMI: program payments (silent-post style, form-encoded → object upstream).
// Match to the open receivable of the same amount on the contact's deal.
// ---------------------------------------------------------------------
async function normalizeNmi(eventType: string, payload: any): Promise<string> {
  const p = payload ?? {};
  if (String(p.response ?? p.response_code ?? "1") !== "1" && p.condition !== "complete")
    return "ignored non-approved NMI post";
  const amountMinor = Math.round(parseFloat(p.amount ?? "0") * 100);
  const email = p.email ?? p.billing_email ?? null;
  const txn = p.transactionid ?? p.transaction_id ?? `nmi_${Date.now()}`;

  let receivable: any = null;
  if (email && amountMinor > 0) {
    const rows = await sql`
      select r.id, r.deal_id from finance.receivable r
      join sales.deal d on d.id = r.deal_id
      join core.contact ct on ct.id = d.contact_id
      join finance.payment_plan pp on pp.id = r.payment_plan_id and pp.is_current
      where r.status in ('scheduled','late','delinquent') and r.amount_minor = ${amountMinor}
        and (lower(ct.primary_email) = lower(${email}) or exists (
          select 1 from core.contact_identifier ci where ci.contact_id = ct.id and ci.type = 'email' and lower(ci.value) = lower(${email})))
      order by r.due_date asc limit 1`;
    receivable = rows[0] ?? null;
  }
  const [pay] = await sql`
    insert into finance.successful_payment (deal_id, receivable_id, processor, type, amount_minor, occurred_at, nmi_transaction_id)
    values (${receivable?.deal_id ?? null}, ${receivable?.id ?? null}, 'nmi',
            ${receivable ? "installment" : "installment"}, ${amountMinor}, now(), ${txn})
    returning id`;
  if (receivable) {
    await sql`update finance.receivable set status = 'paid', paid_at = current_date, payment_id = ${pay.id} where id = ${receivable.id}`;
    return "payment matched to receivable";
  }
  return "payment stored unmatched — review in Receivables";
}

export async function normalizeEvent(provider: Provider, eventType: string, payload: unknown): Promise<string> {
  switch (provider) {
    case "close": return normalizeClose(eventType, payload);
    case "ghl": return normalizeGhl(eventType, payload);
    case "stripe": return normalizeStripe(eventType, payload);
    case "nmi": return normalizeNmi(eventType, payload);
    default: return `no normalizer for ${provider}`;
  }
}
