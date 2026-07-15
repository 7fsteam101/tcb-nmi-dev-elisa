import { sql } from "../db";
import { upsertContact, findOrCreateActiveOpportunity } from "./contacts";
import { queueWriteback, dispatchPending } from "./writeback";
import { getSetting } from "../settings";
import { notifyEvent } from "../notify";
import { money } from "../format";
import type { Provider } from "./providers";

// ---------------------------------------------------------------------
// Close: the DB is a faithful MIRROR of Close. Users move opportunities
// anywhere; we reflect it 1:1 by close_id. No direction rules here.
// ---------------------------------------------------------------------
const slug = (s: string) => s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

const STAGE_ALIASES: Record<string, string> = {
  // the redesigned 18-stage pipeline (spec) — live in Close as the "Sales"
  // pipeline (pipe_5ZtGJ7zT6RjguZ6KPEebkC) since 2026-07-07. "Setter Booked" /
  // "Self Booked" are the booked split (July 2 decision).
  setter_booked: "setter_booked", self_booked: "self_booked",
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
// DB-backed stage resolver (sync.stage_map): the admin-managed mapping wins;
// unknown labels AUTO-REGISTER as unmapped and surface in Admin -> Stages
// (counts-only-when-mapped, same pattern as calendars). The static alias table
// stays as the fallback/seed so known labels keep working with no admin action.
const stageCache = new Map<string, { v: string | null; at: number }>();
export async function mapCloseStage(label: string): Promise<string | null> {
  const hit = stageCache.get(label);
  if (hit && Date.now() - hit.at < 60_000) return hit.v;
  let v: string | null = null;
  try {
    const rows = await sql`select mapped_stage, active from sync.stage_map where platform = 'close' and external_label = ${label} limit 1`;
    if (rows.length) {
      v = rows[0].active ? ((rows[0].mapped_stage as string) ?? null) : null;
    } else {
      const fallback = STAGE_ALIASES[slug(label)] ?? null;
      v = fallback;
      await sql`
        insert into sync.stage_map (platform, external_label, mapped_stage, active)
        values ('close', ${label}, ${fallback}::public.opportunity_stage, ${fallback != null})
        on conflict (platform, external_label) do nothing`;
    }
  } catch {
    v = STAGE_ALIASES[slug(label)] ?? null; // table unavailable -> static fallback
  }
  stageCache.set(label, { v, at: Date.now() });
  return v;
}

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
      createdSource: "close_lead_sync",
    });
    return "lead mirrored";
  }

  if (objectType === "opportunity") {
    const stage = data.status_label ? await mapCloseStage(data.status_label) : null;
    // an unmapped label is NOT an error anymore: it auto-registered in
    // sync.stage_map and surfaces in Admin -> Stages; the mirror proceeds
    // without a stage change until an admin maps it.
    const unmappedNote = data.status_label && !stage ? ` [stage "${data.status_label}" unmapped — assign it in Admin > Stages]` : "";

    // contact by lead close_id (stub if we have not seen the lead yet)
    const { id: contactId } = await upsertContact({ closeId: data.lead_id, fullName: data.lead_name, createdSource: "close_lead_sync" });

    const existing = await sql`select id, stage from sales.opportunity where close_id = ${data.id} limit 1`;
    if (existing.length) {
      await sql`
        update sales.opportunity set
          stage = coalesce(${stage}::public.opportunity_stage, stage),
          closed_at = case when ${stage ?? "__none__"} in ${sql(TERMINAL)} then coalesce(closed_at, now())
                           when ${stage ?? null}::text is not null then null else closed_at end
        where id = ${existing[0].id}`;
      if (stage && WON.includes(stage)) {
        const hasDeal = await sql`select 1 from sales.deal where opportunity_id = ${existing[0].id}`;
        if (hasDeal.length === 0) return "won in Close, no deal recorded yet — submit the Sales Call form to log terms";
      }
      return `opportunity mirrored (${stage ?? "no stage change"})${unmappedNote}`;
    }
    await sql`
      insert into sales.opportunity (contact_id, stage, opened_at, close_id, cohort_month, closed_at)
      values (${contactId}, ${stage ?? "lead_opt_in"}, coalesce(${data.date_created ?? null}, now()), ${data.id},
              date_trunc('month', now())::date,
              case when ${stage ?? "__none__"} in ${sql(TERMINAL)} then now() else null end)`;
    return `opportunity created (mirror)${unmappedNote}`;
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

// Attribution stamps (automation logic, per the locked rules):
//   first_touch: only if empty (set once, at the first touch)
//   last_touch: every touch while the opportunity is still open
//   converting_touch: the booking's source (kind = "booking")
const OPEN_GUARD = ["deposit", "won_pif", "won_pp", "closed_won", "active_partner", "lost", "dq_on_call", "call_canceled_by_team", "not_a_fit"];
async function stampAttribution(oppId: string, source: string | null, kind: "touch" | "booking") {
  if (!source) return;
  await sql`
    update sales.opportunity set
      first_touch_channel = coalesce(first_touch_channel, ${source}),
      last_touch_channel = case when stage::text in ${sql(OPEN_GUARD)} then last_touch_channel else ${source} end,
      converting_touch_channel = case when ${kind} = 'booking' then coalesce(converting_touch_channel, ${source}) else converting_touch_channel end
    where id = ${oppId}`;
}

// Calendar categorization: every GHL appointment resolves its call type through
// sync.calendar_map (admin-managed). Unknown calendars auto-register as strategy
// and surface in the admin panel for review.
async function resolveCallType(locationId: string, calendarId: string | null, calendarName: string | null) {
  if (!calendarId) return { type: "strategy" as const, isBooking: true, mapId: null as string | null };
  const rows = await sql`
    insert into sync.calendar_map (location_id, calendar_id, calendar_name)
    values (${locationId}, ${calendarId}, ${calendarName ?? null})
    on conflict (location_id, calendar_id)
    do update set calendar_name = coalesce(sync.calendar_map.calendar_name, excluded.calendar_name)
    returning id, call_type, is_booking, active`;
  const m = rows[0];
  return {
    type: (m?.active ? m.call_type : "strategy") as "readiness" | "strategy" | "follow_up",
    // POLICY (2026-07-09): tracking follows the admin mapping. A call counts as
    // booked when its calendar is ACTIVE, free or paid alike; paid is a visible
    // attribute (is_paid_booking), never a filter. Uncategorized calendars
    // record with isBooking=false until an admin maps them.
    isBooking: m?.active ?? false,
    isPaid: (m?.active ? (m.is_booking ?? true) : null) as boolean | null,
    mapId: (m?.id as string) ?? null,
  };
}

async function findOrCreateCall(oppId: string, type: string, startTime: string | null, source?: string, isBooking = true, calendarMapId: string | null = null, ghlAppointmentId: string | null = null, isPaid: boolean | null = null): Promise<string> {
  // LOCKED reschedule rule: the GHL appointment id is THE match key. If we have
  // seen this appointment before, it is the SAME booking — reuse the call so a
  // reschedule updates the existing slots instead of creating a second booking.
  if (ghlAppointmentId) {
    const byAppt = await sql`select id from sales.call where ghl_appointment_id = ${ghlAppointmentId} limit 1`;
    if (byAppt.length) {
      if (calendarMapId) await sql`update sales.call set calendar_map_id = coalesce(calendar_map_id, ${calendarMapId}) where id = ${byAppt[0].id}`;
      return byAppt[0].id;
    }
  }
  const rows = type === "strategy"
    ? await sql`select id from sales.call where opportunity_id = ${oppId} and type = 'strategy' and is_primary limit 1`
    : await sql`select id from sales.call where opportunity_id = ${oppId} and type = ${type} order by created_at desc limit 1`;
  if (rows.length) {
    if (calendarMapId) await sql`update sales.call set calendar_map_id = coalesce(calendar_map_id, ${calendarMapId}) where id = ${rows[0].id}`;
    if (ghlAppointmentId) await sql`update sales.call set ghl_appointment_id = coalesce(ghl_appointment_id, ${ghlAppointmentId}) where id = ${rows[0].id}`;
    if (isPaid !== null) await sql`update sales.call set is_paid_booking = coalesce(is_paid_booking, ${isPaid}) where id = ${rows[0].id}`;
    return rows[0].id;
  }
  const created = await sql`
    insert into sales.call (opportunity_id, type, scheduled_at, booking_source_channel, is_primary, is_booking, is_paid_booking, calendar_map_id, ghl_appointment_id)
    values (${oppId}, ${type}, ${startTime ?? new Date().toISOString()}, ${source ?? null}, ${type === "strategy"}, ${isBooking}, ${isPaid}, ${calendarMapId}, ${ghlAppointmentId})
    returning id`;
  return created[0].id;
}

// ---------------------------------------------------------------------
// Outbound push to Close (setting-gated). Close is the reps' source of
// truth. When core.app_setting "close_push_enabled" is ON (Admin > Options,
// "Sync policy" card), tracked GHL events also move the Close card: the job
// the client's booking Zap does today against the old pipeline. The toggle
// stays OFF until the pipeline cutover retires that Zap; then our queue owns
// the moves on the new "Sales" pipeline. Best-effort by design: a push
// failure only appends a note and never blocks or fails the inbound mirror.
// ---------------------------------------------------------------------
const BOOKED_ISH = ["self_booked", "setter_booked", "strategy_call_booked", "call_confirmed"];

// Queue the Close card move for an opportunity. Callers gate on the setting
// (computed once per event). createIfMissing: a booking with no Close card
// yet creates one on the lead, carrying our opportunity_id so the dispatcher
// can stamp the new close_id back onto our row.
async function queueClosePush(oppId: string, stageLabel: string, createIfMissing: boolean): Promise<string> {
  const [ids] = await sql`
    select o.close_id as opp_close_id, ct.close_id as lead_close_id
    from sales.opportunity o
    join core.contact ct on ct.id = o.contact_id
    where o.id = ${oppId} limit 1`;
  if (ids?.opp_close_id) {
    await queueWriteback("close", "close_update_opportunity_stage", ids.opp_close_id, { stage_label: stageLabel }, "ghl_event");
  } else if (createIfMissing && ids?.lead_close_id) {
    await queueWriteback("close", "close_create_opportunity", ids.lead_close_id,
      { lead_close_id: ids.lead_close_id, status_label: stageLabel, opportunity_id: oppId }, "ghl_event");
  } else {
    return createIfMissing ? " [no Close lead to update]" : " [no Close card to move]";
  }
  try { await dispatchPending(); } catch { /* the cron sweep retries */ }
  return ` [Close push queued: ${stageLabel}]`;
}

async function normalizeGhl(eventType: string, payload: any): Promise<string> {
  const p = payload ?? {};
  const pc = p.contact ?? {};
  const event = p.tcb_event ?? eventType;
  const { id: contactId } = await upsertContact({
    ghlMarketingId: pc.id,
    fullName: pc.name ?? pc.full_name,
    firstName: pc.first_name,
    lastName: pc.last_name,
    email: pc.email,
    phone: pc.phone,
    createdSource: event === "form_submitted" ? "ghl_form_submission"
      : event === "contact_upserted" ? "ghl_contact_sync" : "ghl_appointment",
  });

  if (event === "form_submitted") {
    const source = p.form?.source ?? "meta_ads";
    const formId = p.form?.id ?? p.form?.form_id ?? null;
    // form registry (counts-only-when-mapped, July 9 policy): unknown forms
    // auto-register unreviewed + not counted; the opt-in still RECORDS either
    // way, and Admin > Forms decides whether it counts as a lead.
    let counted = true;
    if (formId) {
      const [fm] = await sql`
        insert into sync.form_map (location_id, form_id)
        values (${p.location_id ?? "default"}, ${formId})
        on conflict (location_id, form_id) do update set form_id = excluded.form_id
        returning counts_as_lead`;
      counted = fm?.counts_as_lead ?? false;
    }
    const oppId = await findOrCreateActiveOpportunity(contactId, source);
    await sql`
      insert into sales.opt_in (contact_id, opportunity_id, submitted_at, goal, credit_score_range, blocker,
                                source_channel, source_campaign, utm, dub_link_id, form_id, ghl_marketing_id, counts_as_unique, counted)
      values (${contactId}, ${oppId}, now(), ${p.form?.goal ?? "other"}, ${p.form?.credit_score_range ?? null},
              ${p.form?.blocker ?? null}, ${source}, ${p.form?.campaign ?? p.form?.utm_campaign ?? null}, ${p.form?.utm ?? null},
              ${p.form?.dub_id ?? p.form?.dub_link_id ?? null}, ${formId}, ${pc.id ?? null},
              not exists (select 1 from sales.opt_in where contact_id = ${contactId} and submitted_at > now() - interval '30 days'),
              ${counted})`;
    await stampAttribution(oppId, source, "touch");
    if (counted) {
      await notifyEvent("lead_created", {
        contact_name: pc.name ?? pc.full_name ?? pc.email ?? "unknown",
        source: String(source).replaceAll("_", " "),
        campaign: p.form?.campaign ? ` (${p.form.campaign})` : "",
      });
    }
    return counted ? "opt-in recorded" : "opt-in recorded (form not marked counts-as-lead yet — decide in Admin > Forms)";
  }

  if (event === "contact_upserted") return "contact enriched"; // identity-only event (backfill/pull)

  if (event === "intake_submitted") {
    const oppId = await findOrCreateActiveOpportunity(contactId);
    await sql`
      insert into credit.intake_submission (opportunity_id, contact_id, submitted_at, provider, status)
      values (${oppId}, ${contactId}, now(), ${p.provider === "myscoreiq" ? "myscoreiq" : "identityiq"}, 'submitted')`;
    await sql`update sales.opportunity set stage = 'intake_form_submitted' where id = ${oppId} and stage in ('lead_opt_in','strategy_call_booked','setter_booked','self_booked','intake_form_needed')`;
    return "intake recorded (no credentials over webhook — the credential pull stays in the existing worker)";
  }

  const startTime = p.appointment?.start_time ?? p.appointment?.startTime ?? null;
  const calendar = await resolveCallType(
    p.location_id ?? "default",
    p.appointment?.calendar_id ?? p.appointment?.calendarId ?? null,
    p.appointment?.calendar_name ?? p.appointment?.calendarName ?? null,
  );
  const ghlApptId = p.appointment?.id ?? p.appointment?.appointment_id ?? null;
  const oppId = await findOrCreateActiveOpportunity(contactId, p.source);
  const callId = await findOrCreateCall(oppId, calendar.type, startTime, p.source, calendar.isBooking, calendar.mapId, ghlApptId, calendar.isPaid);
  const slot = await currentSlot(callId);

  switch (event) {
    case "appointment_booked": {
      if (!slot) await addSlot(callId, startTime, 1);
      else if (["taken", "no_show", "cancelled_by_lead", "cancelled_by_team", "rescheduled"].includes(slot.status))
        await addSlot(callId, startTime, slot.seq + 1); // terminal slots are immutable — new slot
      if (calendar.type === "strategy" && calendar.isBooking) {
        // a rebook after a miss re-opens the pipeline: reopen from lead OR from a
        // prior missed/cancelled/warm state (a live call is booked again).
        // A GHL calendar booking is the lead booking themselves -> 'self_booked'
        // (the July 2 split); setter bookings arrive as Close stage moves and
        // mirror in on their own. booked_by is stamped on the call for the % split.
        await sql`update sales.opportunity set stage = 'self_booked'
          where id = ${oppId} and stage in ('lead_opt_in','no_show','call_canceled_by_lead','warm_list')`;
        await sql`update sales.call set booked_by = coalesce(booked_by, 'self_book') where id = ${callId}`;
        await stampAttribution(oppId, p.source ?? null, "booking"); // the booking source = the converting touch
      }
      if (calendar.isBooking) {
        await notifyEvent("appointment_booked", {
          contact_name: pc.name ?? pc.full_name ?? pc.email ?? "unknown",
          time: startTime ?? "",
          calendar: p.appointment?.calendar_name ?? p.appointment?.calendarName ?? "",
          booked_by: "Self book",
        });
      }
      // Setting-gated outbound push (tracked bookings only): move the Close
      // card to Self Booked; if the lead has no card yet, create one at that
      // status. No Close lead linked at all: record and note, nothing to push.
      let pushNote = "";
      if (calendar.isBooking) {
        try {
          if (await getSetting<boolean>("close_push_enabled", false))
            pushNote = await queueClosePush(oppId, "Self Booked", true);
        } catch { pushNote = " [Close push skipped: queue error]"; }
      }
      return `booking slot recorded (${calendar.type} calendar)${pushNote}`;
    }
    case "appointment_rescheduled": {
      if (slot && ["scheduled", "confirmed", "pending_rebook"].includes(slot.status)) {
        await sql`
          update sales.appointment set status = 'rescheduled', rescheduled_at = now(),
            moved_by = ${p.moved_by === "closer" ? "closer" : "lead_link"},
            reason_id = (select id from core.cancellation_reason where name = ${p.reason ?? ""} limit 1)
          where id = ${slot.id}`;
      }
      if (startTime) {
        await addSlot(callId, startTime, (slot?.seq ?? 0) + 1);
        await sql`update sales.call set current_scheduled_at = ${startTime} where id = ${callId}`;
        return "reschedule recorded (old slot kept, new slot current)";
      }
      // reschedule with no new date -> dateless pending_rebook slot
      await sql`update sales.appointment set is_current = false where call_id = ${callId}`;
      await sql`
        insert into sales.appointment (call_id, seq, scheduled_for, status, is_current)
        values (${callId}, ${(slot?.seq ?? 0) + 1}, null, 'pending_rebook', true)`;
      return "reschedule recorded with no new date (rebook pending)";
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
      // Setting-gated outbound push, LEAD cancels only (team cancels stay
      // internal): booked-ish internal move first, then the Close card follows.
      let pushNote = "";
      if (event === "appointment_cancelled_by_lead") {
        try {
          if (await getSetting<boolean>("close_push_enabled", false)) {
            await sql`update sales.opportunity set stage = 'call_canceled_by_lead' where id = ${oppId} and stage in ${sql(BOOKED_ISH)}`;
            pushNote = await queueClosePush(oppId, "Call Canceled (by Lead)", false);
          }
        } catch { pushNote = " [Close push skipped: queue error]"; }
      }
      return `cancellation recorded${pushNote}`;
    }
    case "appointment_no_show": {
      if (slot && ["scheduled", "confirmed"].includes(slot.status))
        await sql`update sales.appointment set status = 'no_show' where id = ${slot.id}`;
      // Setting-gated outbound push: mirror the miss internally first (only
      // from booked-ish stages, so terminal stages never regress), then move
      // the Close card to No Show.
      let pushNote = "";
      try {
        if (await getSetting<boolean>("close_push_enabled", false)) {
          await sql`update sales.opportunity set stage = 'no_show' where id = ${oppId} and stage in ${sql(BOOKED_ISH)}`;
          pushNote = await queueClosePush(oppId, "No Show", false);
        }
      } catch { pushNote = " [Close push skipped: queue error]"; }
      await notifyEvent("appointment_no_show", {
        contact_name: pc.name ?? pc.full_name ?? pc.email ?? "unknown",
        time: startTime ?? "",
        calendar: "",
      });
      return `no-show recorded${pushNote}`;
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
  const type = payload?.type ?? eventType;

  // disputes: the CASE lives in finance.dispute (status lifecycle + evidence
  // deadline); the money movement lands in finance.reversal on withdrawal/loss
  if (type.startsWith("charge.dispute.")) {
    const [pay] = await sql`
      select id, deal_id from finance.successful_payment where stripe_charge_id = ${obj.charge ?? ""} limit 1`;
    const fundsWithdrawn = type === "charge.dispute.funds_withdrawn" ? true
      : type === "charge.dispute.funds_reinstated" ? false : undefined;
    await sql`
      insert into finance.dispute (payment_id, deal_id, processor, external_dispute_id, external_charge_id,
                                   amount_minor, reason, status, evidence_due_by, opened_at, closed_at, funds_withdrawn)
      values (${pay?.id ?? null}, ${pay?.deal_id ?? null}, 'stripe', ${obj.id}, ${obj.charge ?? null},
              ${obj.amount ?? 0}, ${obj.reason ?? null}, ${obj.status ?? "needs_response"},
              ${obj.evidence_details?.due_by ? new Date(obj.evidence_details.due_by * 1000).toISOString() : null},
              ${obj.created ? new Date(obj.created * 1000).toISOString() : new Date().toISOString()},
              ${["won", "lost", "charge_refunded", "warning_closed"].includes(obj.status) ? new Date().toISOString() : null},
              ${fundsWithdrawn ?? false})
      on conflict (external_dispute_id) do update set
        status = excluded.status,
        evidence_due_by = excluded.evidence_due_by,
        closed_at = excluded.closed_at,
        funds_withdrawn = coalesce(${fundsWithdrawn ?? null}, finance.dispute.funds_withdrawn),
        payment_id = coalesce(finance.dispute.payment_id, excluded.payment_id),
        deal_id = coalesce(finance.dispute.deal_id, excluded.deal_id)`;
    // funds actually pulled, or case lost -> the money movement is a reversal
    if (type === "charge.dispute.funds_withdrawn" || (type === "charge.dispute.closed" && obj.status === "lost")) {
      const exists = await sql`select 1 from finance.reversal where reason = ${"stripe dispute " + obj.id} limit 1`;
      if (!exists.length) {
        await sql`
          insert into finance.reversal (deal_id, payment_id, type, amount_minor, reason, occurred_at)
          values (${pay?.deal_id ?? null}, ${pay?.id ?? null}, 'chargeback', ${obj.amount ?? 0},
                  ${"stripe dispute " + obj.id}, now())`;
      }
    }
    return `dispute ${obj.status} recorded`;
  }

  // refunds net out cash and feed the refund-rate widget
  if (type === "charge.refunded" || type === "refund.created" || type === "refund.updated") {
    const chargeId = obj.charge ?? obj.id;
    const [pay] = await sql`
      select id, deal_id, amount_minor from finance.successful_payment where stripe_charge_id = ${chargeId} limit 1`;
    await sql`
      insert into finance.reversal (deal_id, payment_id, type, amount_minor, reason, occurred_at)
      values (${pay?.deal_id ?? null}, ${pay?.id ?? null}, 'refund',
              ${obj.amount_refunded ?? obj.amount ?? pay?.amount_minor ?? 0},
              ${obj.reason ?? "stripe refund"}, now())`;
    const refundMinor = Number(obj.amount_refunded ?? obj.amount ?? pay?.amount_minor ?? 0);
    await notifyEvent("payment_refunded", {
      contact_name: obj.billing_details?.email ?? "",
      amount: money(refundMinor),
      kind: "refund",
    }, refundMinor);
    return pay ? "refund recorded against the payment" : "refund recorded (no matching charge on file)";
  }

  // charge.succeeded is the single money truth: checkout.session.completed and
  // payment_intent.succeeded always emit a charge too, so processing them here
  // would double-count the same payment.
  if (type !== "charge.succeeded")
    return `ignored stripe event ${type}`;
  const amount = obj.amount_received ?? obj.amount_total ?? obj.amount ?? 0;
  const email = obj.billing_details?.email ?? obj.customer_details?.email ?? obj.receipt_email ?? null;
  const chargeId = obj.id;

  let strategyCallId: string | null = null;
  let contactId: string | null = null;
  if (email) {
    const [ct] = await sql`
      select ct.id from core.contact ct
      where lower(ct.primary_email) = lower(${email}) or exists (
        select 1 from core.contact_identifier ci where ci.contact_id = ct.id and ci.type = 'email' and lower(ci.value) = lower(${email}))
      limit 1`;
    contactId = ct?.id ?? null;
    const rows = await sql`
      select c.id, o.contact_id from sales.call c
      join sales.opportunity o on o.id = c.opportunity_id
      join core.contact ct on ct.id = o.contact_id
      where c.type = 'strategy' and c.booking_payment_id is null
        and (lower(ct.primary_email) = lower(${email}) or exists (
          select 1 from core.contact_identifier ci where ci.contact_id = ct.id and ci.type = 'email' and lower(ci.value) = lower(${email})))
      order by c.created_at desc limit 1`;
    strategyCallId = rows[0]?.id ?? null;
    contactId = rows[0]?.contact_id ?? contactId;
  }
  // occurred_at from the charge's real timestamp (backfill-safe); dedupe by
  // charge id so a live webhook + a backfill of the same charge insert once.
  const occurredAt = obj.created ? new Date(obj.created * 1000).toISOString() : new Date().toISOString();
  const productType = amount <= 5000 ? "low_ticket" : "high_ticket";
  const [dupe] = await sql`select id from finance.successful_payment where stripe_charge_id = ${chargeId} limit 1`;
  if (dupe) return "charge already recorded";
  const [pay] = await sql`
    insert into finance.successful_payment (strategy_call_id, contact_id, processor, type, amount_minor, occurred_at, stripe_charge_id, product_type)
    values (${strategyCallId}, ${contactId ?? null}, 'stripe', 'booking_25', ${amount}, ${occurredAt}, ${chargeId}, ${productType}::public.product_tier)
    returning id`;
  if (strategyCallId) await sql`update sales.call set booking_payment_id = ${pay.id} where id = ${strategyCallId}`;
  await notifyEvent("payment_succeeded", {
    contact_name: obj.billing_details?.name ?? email ?? "unknown",
    amount: money(amount),
    processor: "Stripe",
    plan_type: "",
    collected_pct: "",
    deal_value: "",
  }, amount);
  return strategyCallId ? "booking fee linked to strategy call" : "booking fee stored (no matching call yet)";
}

// ---------------------------------------------------------------------
// NMI: program payments (silent-post style, form-encoded → object upstream).
// Match to the open receivable of the same amount on the contact's deal.
// ---------------------------------------------------------------------
async function normalizeNmi(eventType: string, payload: any): Promise<string> {
  const p = payload ?? {};
  // refunds / voids -> reversal
  const action = String(p.type ?? p.action_type ?? "").toLowerCase();
  if (action === "refund" || action === "void" || action === "chargeback") {
    const [pay] = await sql`
      select id, deal_id, amount_minor from finance.successful_payment
      where nmi_transaction_id = ${p.original_transaction_id ?? p.transactionid ?? ""} limit 1`;
    await sql`
      insert into finance.reversal (deal_id, payment_id, type, amount_minor, reason, occurred_at)
      values (${pay?.deal_id ?? null}, ${pay?.id ?? null}, ${action === "chargeback" ? "chargeback" : "refund"},
              ${Math.round(parseFloat(p.amount ?? "0") * 100) || (pay?.amount_minor ?? 0)}, ${`nmi ${action}`}, now())`;
    const revMinor = Math.round(parseFloat(p.amount ?? "0") * 100) || Number(pay?.amount_minor ?? 0);
    await notifyEvent("payment_refunded", {
      contact_name: p.email ?? p.billing_email ?? "",
      amount: money(revMinor),
      kind: action === "chargeback" ? "chargeback" : "refund",
    }, revMinor);
    return `nmi ${action} recorded`;
  }
  if (String(p.response ?? p.response_code ?? "1") !== "1" && p.condition !== "complete")
    return "ignored non-approved NMI post";
  const amountMinor = Math.round(parseFloat(p.amount ?? "0") * 100);
  const email = p.email ?? p.billing_email ?? null;
  const txn = p.transactionid ?? p.transaction_id ?? `nmi_${Date.now()}`;

  let receivable: any = null;
  let contactId: string | null = null;
  if (email) {
    // resolve the payer contact by email so even an UNMATCHED payment attaches to
    // a person (the "money is always attributable" rule, 0025).
    const [ct] = await sql`
      select ct.id from core.contact ct
      where lower(ct.primary_email) = lower(${email}) or exists (
        select 1 from core.contact_identifier ci where ci.contact_id = ct.id and ci.type = 'email' and lower(ci.value) = lower(${email}))
      limit 1`;
    contactId = ct?.id ?? null;
    if (amountMinor > 0) {
      const rows = await sql`
        select r.id, r.deal_id, d.contact_id, pp.plan_type from finance.receivable r
        join sales.deal d on d.id = r.deal_id
        join core.contact ct on ct.id = d.contact_id
        join finance.payment_plan pp on pp.id = r.payment_plan_id and pp.is_current
        where r.status in ('scheduled','late','delinquent') and r.amount_minor = ${amountMinor}
          and (lower(ct.primary_email) = lower(${email}) or exists (
            select 1 from core.contact_identifier ci where ci.contact_id = ct.id and ci.type = 'email' and lower(ci.value) = lower(${email})))
        order by r.due_date asc limit 1`;
      receivable = rows[0] ?? null;
    }
  }
  // derive the real payment type from the plan (pif vs installment) instead of the
  // old always-'installment' no-op.
  const payType = receivable ? (receivable.plan_type === "pif" ? "pif" : "installment") : "installment";
  const [pay] = await sql`
    insert into finance.successful_payment (deal_id, receivable_id, contact_id, processor, type, amount_minor, occurred_at, nmi_transaction_id)
    values (${receivable?.deal_id ?? null}, ${receivable?.id ?? null}, ${receivable?.contact_id ?? contactId ?? null}, 'nmi',
            ${payType}, ${amountMinor}, now(), ${txn})
    returning id`;
  const payVars = {
    contact_name: email ?? "unknown",
    amount: money(amountMinor),
    processor: "NMI",
    plan_type: receivable?.plan_type ?? "",
    collected_pct: "",
    deal_value: "",
  };
  if (receivable) {
    await sql`update finance.receivable set status = 'paid', paid_at = current_date, payment_id = ${pay.id} where id = ${receivable.id}`;
    await notifyEvent("payment_succeeded", payVars, amountMinor);
    return "payment matched to receivable";
  }
  await notifyEvent("payment_succeeded", payVars, amountMinor);
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
