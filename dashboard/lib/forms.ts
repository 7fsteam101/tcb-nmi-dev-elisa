import { sql } from "./db";
import { queueWriteback, dispatchPending } from "./sync/writeback";

// Form processing per the authoritative flowcharts (2026-07-02). Every submission:
//   1. lands in sales.report_submission (audit; duplicates supersede; on_time =
//      submitted the same ET day as the call)
//   2. normalizes into the business tables
//   3. fans out to Close (stage + note) and GHL (contact note)
// THE RULE: deals are born HERE (the Sales Call Report), never from the Close sync.

// The Sales Call Report's outcome list (verbatim from the chart).
export type CallResult =
  | "follow_up_call" | "hot_lead" | "warm_list" | "cold_list"
  | "contract_signed" | "won_pif" | "won_pp" | "lost" | "dq_on_call";

// hot/warm/cold are follow-up buckets; all sit in the warm_list stage with
// their day-range driving the default follow-up date.
const RESULT_TO_STAGE: Record<CallResult, string> = {
  follow_up_call: "follow_up_call_booked",
  hot_lead: "warm_list", warm_list: "warm_list", cold_list: "warm_list",
  contract_signed: "contract_signed",
  won_pif: "won_pif", won_pp: "won_pp", lost: "lost", dq_on_call: "dq_on_call",
};
const RESULT_TO_DISPOSITION: Record<CallResult, string> = {
  follow_up_call: "follow_up", hot_lead: "no_decision", warm_list: "no_decision",
  cold_list: "no_decision", contract_signed: "follow_up",
  won_pif: "closed", won_pp: "closed", lost: "no_decision", dq_on_call: "dq_on_call",
};

export type FollowUpInput = { wanted: boolean; date?: string; assigneeRepId?: string; whyNot?: string };

export type SalesCallInput = {
  appointmentId: string;
  repId: string;
  outcome: "taken" | "no_show" | "cancelled_by_lead" | "cancelled_by_team";
  callResult?: CallResult;
  disposition?: "closed" | "follow_up" | "dq_on_call" | "no_decision"; // legacy path (quick attendance marking)
  offerMade?: boolean;
  dealType?: "won_pif" | "won_pp" | "deposit";
  amountContractedMinor?: number;
  cashCollectedMinor?: number;
  pricingPlanId?: string;
  planStartDate?: string;
  cadence?: "monthly" | "biweekly" | "weekly" | "custom";
  customInstallments?: { amountMinor: number; date: string }[];
  expectedCloseDate?: string;
  qualified?: boolean;
  dqReasonId?: string;
  lostReasonId?: string;
  mainObjectionId?: string;
  objectionTypeIds?: string[];
  followUp?: FollowUpInput;
  notes?: string;
  submittedByUserId: string;
  // couples: one deal, partner linked, combined value on the deal (CLIENT-DECISIONS #5)
  isCouple?: boolean;
  partnerContactId?: string;
};

async function apptContext(appointmentId: string) {
  const [row] = await sql`
    select a.id as appointment_id, a.status as appointment_status, c.id as call_id,
           o.id as opportunity_id, o.close_id as opp_close_id, o.stage,
           ct.id as contact_id, ct.close_id as lead_close_id, ct.full_name, c.is_demo,
           ct.ghl_marketing_id, ct.ghl_repair_id, c.rep_id as call_rep_id
    from sales.appointment a
    join sales.call c on c.id = a.call_id
    join sales.opportunity o on o.id = c.opportunity_id
    join core.contact ct on ct.id = o.contact_id
    where a.id = ${appointmentId}`;
  if (!row) throw new Error("Appointment not found");
  return row;
}

async function logSubmission(type: "sales_call" | "missed_call" | "post_call_notes", repId: string, callId: string | null, payload: unknown) {
  const [dupe] = await sql`
    select count(*)::int as n from sales.report_submission
    where type = ${type} and strategy_call_id = ${callId} and status <> 'superseded'`;
  // Compliance rule from the pipeline doc: the outcome form is due "immediately
  // or same day" — on_time = submitted the same ET day as the call happened.
  const [row] = await sql`
    insert into sales.report_submission (type, rep_id, strategy_call_id, submitted_at, status, is_duplicate, on_time, payload)
    values (${type}, ${repId}, ${callId}, now(), 'validated', ${Number(dupe?.n ?? 0) > 0},
      coalesce((
        select (now() at time zone 'America/New_York')::date
             = (coalesce(c.occurred_at,
                 (select a.scheduled_for from sales.appointment a where a.call_id = c.id and a.is_current))
                at time zone 'America/New_York')::date
        from sales.call c where c.id = ${callId}), true),
      ${sql.json(payload as never)})
    returning id`;
  if (Number(dupe?.n ?? 0) > 0) {
    await sql`
      update sales.report_submission set status = 'superseded'
      where type = ${type} and strategy_call_id = ${callId} and id <> ${row.id} and status = 'validated'`;
  }
  return row.id as string;
}

// Follow Up? branch (both forms): yes -> a follow-up call scheduled for the date,
// assigned (default: the closer); no -> the why-not lives in the payload + note.
async function handleFollowUp(ctx: any, fu: FollowUpInput | undefined, results: string[]) {
  if (!fu) return;
  if (fu.wanted && fu.date) {
    await sql`
      insert into sales.call (opportunity_id, type, scheduled_at, rep_id, is_primary, is_booking, is_demo)
      values (${ctx.opportunity_id}, 'follow_up', ${fu.date}, ${fu.assigneeRepId ?? ctx.call_rep_id ?? null}, false, false, ${ctx.is_demo})`;
    results.push(`Follow-up scheduled for ${fu.date}`);
  } else if (!fu.wanted && fu.whyNot) {
    results.push("No follow-up (reason recorded)");
  }
}

// The cadence engine: schedules receivables per the chart's payment options.
function installmentDates(startDate: string, count: number, cadence: string): string[] {
  const out: string[] = [];
  const start = new Date(`${startDate}T00:00:00Z`);
  for (let k = 0; k < count; k++) {
    const d = new Date(start);
    if (cadence === "weekly") d.setUTCDate(d.getUTCDate() + 7 * k);
    else if (cadence === "biweekly") d.setUTCDate(d.getUTCDate() + 14 * k);
    else d.setUTCMonth(d.getUTCMonth() + k); // monthly
    out.push(d.toISOString().slice(0, 10));
  }
  return out;
}

export async function submitSalesCall(input: SalesCallInput) {
  const ctx = await apptContext(input.appointmentId);
  await logSubmission("sales_call", input.repId, ctx.call_id, input);
  const results: string[] = [];

  // attendance: terminal slots stay immutable
  if (["scheduled", "confirmed"].includes(ctx.appointment_status)) {
    await sql`update sales.appointment set status = ${input.outcome === "taken" ? "taken" : input.outcome} where id = ${input.appointmentId}`;
  }
  if (input.outcome !== "taken") {
    const stage = input.outcome === "no_show" ? "no_show"
      : input.outcome === "cancelled_by_lead" ? "call_canceled_by_lead" : "call_canceled_by_team";
    await sql`update sales.opportunity set stage = ${stage} where id = ${ctx.opportunity_id}`;
    results.push(`Recorded ${input.outcome.replaceAll("_", " ")}`);
    await handleFollowUp(ctx, input.followUp, results);
    await queueSyncOut(ctx, stage, buildNote(ctx.full_name, input), results);
    return finish(results);
  }

  const result = input.callResult ?? null;
  const disposition = result ? RESULT_TO_DISPOSITION[result] : (input.disposition ?? "no_decision");
  await sql`
    update sales.call set occurred_at = coalesce(occurred_at, now()),
      offer_made = ${input.offerMade ?? false}, disposition = ${disposition},
      rep_id = coalesce(rep_id, ${input.repId})
    where id = ${ctx.call_id}`;
  results.push("Call marked taken");

  // objections: the chart's single Main Objection, plus any extras
  const objectionIds = [
    ...(input.mainObjectionId ? [input.mainObjectionId] : []),
    ...(input.objectionTypeIds ?? []),
  ];
  for (const objId of new Set(objectionIds)) {
    await sql`
      insert into sales.objection (strategy_call_id, objection_type_id, led_to_loss, source)
      values (${ctx.call_id}, ${objId}, ${result === "dq_on_call" || result === "lost"}, 'rep_logged')`;
  }

  let stage: string | null = null;

  if (input.dealType === "won_pif" || input.dealType === "won_pp" || result === "won_pif" || result === "won_pp") {
    // -- THE DEAL IS BORN HERE (never from the Close sync) --
    const dealType = input.dealType ?? (result as "won_pif" | "won_pp");
    stage = dealType;
    const cadence = input.cadence ?? "monthly";
    const startDate = input.planStartDate ?? new Date().toISOString().slice(0, 10);

    let installments: { amountMinor: number; date: string }[];
    if (dealType === "won_pif") {
      const amt = input.amountContractedMinor ?? input.cashCollectedMinor ?? 0;
      installments = [{ amountMinor: amt, date: startDate }];
    } else if (cadence === "custom") {
      installments = input.customInstallments ?? [];
      if (!installments.length) throw new Error("Custom cadence needs at least one installment row (amount + date)");
    } else {
      const [plan] = input.pricingPlanId
        ? await sql`select installments, installment_amount_minor from marketing.pricing_plan where id = ${input.pricingPlanId}`
        : [null];
      const count = plan?.installments ?? input.customInstallments?.length ?? 1;
      const tcv = input.amountContractedMinor ?? (plan ? plan.installments * plan.installment_amount_minor : 0);
      const per = Math.floor(tcv / count);
      const dates = installmentDates(startDate, count, cadence);
      installments = dates.map((date, i) => ({ amountMinor: i === count - 1 ? tcv - per * (count - 1) : per, date }));
    }
    const tcv = input.amountContractedMinor ?? installments.reduce((s, r) => s + r.amountMinor, 0);
    if (tcv <= 0) throw new Error("Amount contracted is required on a won deal");

    // Record the plan AS SOLD (frozen snapshot): derive the real plan_type from
    // the installment structure (1=pif, 3/6/7/12/13 -> Npay, custom cadence ->
    // custom) instead of the old hardcoded pif/3pay.
    const count = installments.length;
    const PLAN_BY_COUNT: Record<number, string> = { 1: "pif", 3: "3pay", 6: "6pay", 7: "7pay", 12: "12pay", 13: "13pay" };
    const planType = dealType === "won_pif" ? "pif" : cadence === "custom" ? "custom" : (PLAN_BY_COUNT[count] ?? "custom");

    const [deal] = await sql`
      insert into sales.deal (opportunity_id, contact_id, closer_rep_id, offer_id, total_contract_value_minor,
                              plan_type_snapshot, deal_close_date, status, is_demo, source, is_couple, partner_contact_id)
      values (${ctx.opportunity_id}, ${ctx.contact_id}, ${input.repId},
              (select id from marketing.offer where type = 'core'), ${tcv},
              ${planType}::public.plan_type, current_date, 'active', ${ctx.is_demo}, 'sales_call_report',
              ${input.isCouple ?? false}, ${input.partnerContactId ?? null})
      returning id`;
    const [pplan] = await sql`
      insert into finance.payment_plan (deal_id, version, plan_type, total_minor, is_current, is_demo, cadence, start_date)
      values (${deal.id}, 1, ${planType}::public.plan_type,
              ${tcv}, true, ${ctx.is_demo}, ${cadence}::public.payment_cadence, ${startDate})
      returning id`;
    for (let k = 0; k < installments.length; k++) {
      await sql`
        insert into finance.receivable (payment_plan_id, deal_id, installment_no, due_date, amount_minor, status, is_demo)
        values (${pplan.id}, ${deal.id}, ${k + 1}, ${installments[k].date}, ${installments[k].amountMinor}, 'scheduled', ${ctx.is_demo})`;
    }
    if (input.cashCollectedMinor && input.cashCollectedMinor > 0) {
      const [recv] = await sql`
        select id from finance.receivable where deal_id = ${deal.id} order by installment_no limit 1`;
      const [pay] = await sql`
        insert into finance.successful_payment (deal_id, receivable_id, rep_id, processor, type, amount_minor, occurred_at, is_demo)
        values (${deal.id}, ${recv.id}, ${input.repId}, 'nmi',
                ${dealType === "won_pif" ? "pif" : "installment"}, ${input.cashCollectedMinor}, now(), ${ctx.is_demo})
        returning id`;
      await sql`update finance.receivable set status = 'paid', paid_at = current_date, payment_id = ${pay.id} where id = ${recv.id}`;
      results.push("Payment recorded");
    }
    await sql`
      insert into delivery.fulfilment (deal_id, contact_id, program_start, program_end, onboarding_complete, status, is_demo)
      values (${deal.id}, ${ctx.contact_id}, ${startDate}, ${startDate}::date + interval '6 months', false, 'active', ${ctx.is_demo})`;
    await sql`update core.contact set lifecycle_status = 'customer' where id = ${ctx.contact_id} and lifecycle_status <> 'do_not_contact'`;
    await sql`update sales.opportunity set stage = ${stage}, closed_at = now() where id = ${ctx.opportunity_id}`;
    results.push(`Deal won (${dealType === "won_pif" ? "PIF" : `payment plan, ${cadence}`}) — onboarding record created`);
  } else if (input.dealType === "deposit") {
    stage = "deposit";
    await sql`
      update sales.opportunity set stage = 'deposit', expected_close_date = ${input.expectedCloseDate ?? null}
      where id = ${ctx.opportunity_id}`;
    if (input.cashCollectedMinor && input.cashCollectedMinor > 0) {
      // stamp contact_id so the deposit is attributable even before the deal exists
      // (the deal is created at full close; a later reconcile links it onto the deal).
      await sql`
        insert into finance.successful_payment (contact_id, rep_id, processor, type, amount_minor, occurred_at, is_demo)
        values (${ctx.contact_id}, ${input.repId}, 'nmi', 'deposit', ${input.cashCollectedMinor}, now(), ${ctx.is_demo})`;
      results.push("Deposit recorded");
    }
    results.push(`Deposit taken${input.expectedCloseDate ? `, full close expected ${input.expectedCloseDate}` : ""} — the deal record is created when it fully closes`);
  } else if (result === "dq_on_call" || input.qualified === false) {
    stage = "dq_on_call";
    await sql`
      update sales.opportunity set stage = 'dq_on_call', qualified = false, dq_stage = 'closing',
        dq_reason_id = ${input.dqReasonId ?? null}, closed_at = now()
      where id = ${ctx.opportunity_id}`;
    results.push("Disqualified on call");
  } else if (result === "lost") {
    stage = "lost";
    await sql`
      update sales.opportunity set stage = 'lost', lost_reason_id = ${input.lostReasonId ?? null}, closed_at = now()
      where id = ${ctx.opportunity_id}`;
    results.push("Marked lost");
  } else if (result) {
    stage = RESULT_TO_STAGE[result];
    await sql`update sales.opportunity set stage = ${stage} where id = ${ctx.opportunity_id}`;
    results.push(`Moved to ${stage.replaceAll("_", " ")}`);
  } else {
    stage = "warm_list";
    await sql`update sales.opportunity set stage = 'warm_list', lost_reason_id = ${input.lostReasonId ?? null} where id = ${ctx.opportunity_id}`;
    results.push("No decision — moved to warm list");
  }

  await handleFollowUp(ctx, input.followUp, results);
  await queueSyncOut(ctx, stage, buildNote(ctx.full_name, input), results);
  return finish(results);
}

function buildNote(name: string, input: SalesCallInput | MissedCallInput): string {
  const lines = [`Report logged from the TCB dashboard for ${name}.`];
  if ("callResult" in input && input.callResult) lines.push(`Outcome: ${input.callResult.replaceAll("_", " ")}.`);
  if ("what" in input) lines.push(`Missed call: ${input.what.replaceAll("_", " ")}.`);
  if ("offerMade" in input) lines.push(`Offer made: ${input.offerMade ? "yes" : "no"}.`);
  if (input.followUp?.wanted && input.followUp.date) lines.push(`Follow-up: ${input.followUp.date}.`);
  if (input.followUp && !input.followUp.wanted && input.followUp.whyNot) lines.push(`No follow-up: ${input.followUp.whyNot}`);
  if (input.notes) lines.push(`Notes: ${input.notes}`);
  return lines.join("\n");
}

// Fan-out: Supabase already written; push stage + note to Close and a note to GHL.
async function queueSyncOut(ctx: any, stage: string | null, note: string, results: string[]) {
  if (stage && ctx.opp_close_id) {
    await queueWriteback("close", "close_update_opportunity_stage", ctx.opp_close_id, { stage_label: stage }, "dashboard_form");
    results.push(`Close stage push queued (${stage})`);
  }
  if (ctx.lead_close_id) {
    await queueWriteback("close", "close_create_note", ctx.lead_close_id, { lead_id: ctx.lead_close_id, note }, "dashboard_form");
    results.push("Close note queued");
  }
  const ghlId = ctx.ghl_marketing_id ?? ctx.ghl_repair_id;
  if (ghlId) {
    await queueWriteback("ghl", "ghl_create_contact_note", ghlId, { note }, "dashboard_form");
    results.push("GHL note queued");
  }
  if (!ctx.opp_close_id && !ctx.lead_close_id && !ghlId) {
    results.push("No Close/GHL ids on this record yet — outcome stored locally, pushes once the syncs link it");
    return;
  }
  try {
    const d = await dispatchPending();
    if (d.sent > 0) results.push(`Pushed now (${d.sent} update${d.sent > 1 ? "s" : ""})`);
    else if (d.waiting > 0) results.push("Queued — pushes automatically once the target system's credentials are connected");
  } catch { /* the cron sweep retries */ }
}

function finish(results: string[]) {
  return { ok: true, results };
}

export type MissedCallInput = {
  appointmentId: string;
  repId: string;
  what: "no_show" | "cancelled_by_lead" | "cancelled_by_team" | "rescheduled";
  reasonId?: string;
  dqReasonId?: string;
  newTime?: string;
  movedBy?: "closer" | "lead_link"; // who moved it (drives the by-lead vs by-closer split)
  followUp?: FollowUpInput;
  notes?: string;
};

export async function submitMissedCall(input: MissedCallInput) {
  const ctx = await apptContext(input.appointmentId);
  await logSubmission("missed_call", input.repId, ctx.call_id, input);
  const results: string[] = [];

  const movedBy = input.movedBy === "lead_link" ? "lead_link" : "closer";
  if (input.what === "rescheduled" && ["scheduled", "confirmed", "pending_rebook"].includes(ctx.appointment_status)) {
    if (ctx.appointment_status === "pending_rebook" && input.newTime) {
      // completing a parked rebook: give the pending slot its new live date
      await sql`update sales.appointment set scheduled_for = ${input.newTime}, status = 'scheduled' where id = ${input.appointmentId}`;
      await sql`update sales.call set current_scheduled_at = ${input.newTime} where id = ${ctx.call_id}`;
      results.push("Rebook completed — the pending slot now has a live date");
    } else {
      await sql`
        update sales.appointment set status = 'rescheduled', rescheduled_at = now(), moved_by = ${movedBy},
          reason_id = ${input.reasonId ?? null} where id = ${input.appointmentId}`;
      const [prev] = await sql`select seq from sales.appointment where id = ${input.appointmentId}`;
      await sql`update sales.appointment set is_current = false where call_id = ${ctx.call_id}`;
      // no new date yet -> a dateless pending_rebook slot (the "Reschedule-no-date" queue)
      await sql`
        insert into sales.appointment (call_id, seq, scheduled_for, status, is_current, is_demo)
        values (${ctx.call_id}, ${prev.seq + 1}, ${input.newTime ?? null},
                ${input.newTime ? "scheduled" : "pending_rebook"}::public.appointment_status, true, ${ctx.is_demo})`;
      await sql`update sales.call set current_scheduled_at = ${input.newTime ?? null} where id = ${ctx.call_id}`;
      results.push(input.newTime
        ? "Reschedule recorded — old slot kept in history, new slot live"
        : "Reschedule recorded with NO date yet — sits in the rebook-pending queue until a new time is set");
    }
  } else if (input.what !== "rescheduled" && ["scheduled", "confirmed"].includes(ctx.appointment_status)) {
    await sql`
      update sales.appointment set status = ${input.what}, reason_id = ${input.reasonId ?? null}
      where id = ${input.appointmentId}`;
    const stage = input.what === "no_show" ? "no_show"
      : input.what === "cancelled_by_lead" ? "call_canceled_by_lead" : "call_canceled_by_team";
    await sql`update sales.opportunity set stage = ${stage} where id = ${ctx.opportunity_id}`;
    results.push(`Recorded ${input.what.replaceAll("_", " ")}`);
  } else {
    results.push("This slot already has a final status — nothing changed (history is immutable)");
  }

  if (input.dqReasonId) {
    await sql`
      update sales.opportunity set qualified = false, dq_stage = 'setting', dq_reason_id = ${input.dqReasonId}
      where id = ${ctx.opportunity_id}`;
    results.push("Disqualified at setting");
  }

  await handleFollowUp(ctx, input.followUp, results);
  await queueSyncOut(ctx, null, buildNote(ctx.full_name, input), results);
  return finish(results);
}

export type PostCallInput = {
  callId: string;
  repId: string;
  notes: string;
  objectionTypeIds?: string[];
};

export async function submitPostCall(input: PostCallInput) {
  await logSubmission("post_call_notes", input.repId, input.callId, input);
  const results: string[] = ["Notes logged"];
  for (const objId of input.objectionTypeIds ?? []) {
    await sql`
      insert into sales.objection (strategy_call_id, objection_type_id, led_to_loss, source)
      values (${input.callId}, ${objId}, false, 'rep_logged')`;
  }
  const [ctx] = await sql`
    select o.close_id as opp_close_id, ct.close_id as lead_close_id, ct.full_name, o.id as opportunity_id
    from sales.call c join sales.opportunity o on o.id = c.opportunity_id
    join core.contact ct on ct.id = o.contact_id where c.id = ${input.callId}`;
  if (ctx?.lead_close_id) {
    await queueWriteback("close", "close_create_note", ctx.lead_close_id,
      { lead_id: ctx.lead_close_id, note: `Post-call notes from dashboard for ${ctx.full_name}:\n${input.notes}` }, "dashboard_form");
    try { await dispatchPending(); results.push("Note pushed to Close"); } catch { /* retried by cron */ }
  } else {
    results.push("Close not linked on this record — note stays local");
  }
  return finish(results);
}
