import { sql } from "./db";
import { queueWriteback, dispatchPending } from "./sync/writeback";

// Shared form-processing logic. Every submission:
//   1. lands in sales.report_submission (audit trail; duplicates visible)
//   2. normalizes into the business tables (call/appointment/deal/...)
//   3. queues write-backs so Close (and GHL) reflect the outcome
// Write-backs only queue when the record has a close_id (demo/manual rows don't).

export type SalesCallInput = {
  appointmentId: string;
  repId: string;
  outcome: "taken" | "no_show" | "cancelled_by_lead" | "cancelled_by_team";
  disposition?: "closed" | "follow_up" | "dq_on_call" | "no_decision";
  offerMade?: boolean;
  pricingPlanId?: string;
  tcvMinor?: number;
  firstPaymentMinor?: number;
  dqReasonId?: string;
  lostReasonId?: string;
  objectionTypeIds?: string[];
  notes?: string;
  submittedByUserId: string;
};

async function apptContext(appointmentId: string) {
  const [row] = await sql`
    select a.id as appointment_id, a.status as appointment_status, c.id as call_id,
           o.id as opportunity_id, o.close_id as opp_close_id, o.stage,
           ct.id as contact_id, ct.close_id as lead_close_id, ct.full_name, c.is_demo,
           ct.ghl_marketing_id, ct.ghl_repair_id
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
  const [row] = await sql`
    insert into sales.report_submission (type, rep_id, strategy_call_id, submitted_at, status, is_duplicate, on_time, payload)
    values (${type}, ${repId}, ${callId}, now(), 'validated', ${Number(dupe?.n ?? 0) > 0}, true, ${sql.json(payload as never)})
    returning id`;
  if (Number(dupe?.n ?? 0) > 0) {
    await sql`
      update sales.report_submission set status = 'superseded'
      where type = ${type} and strategy_call_id = ${callId} and id <> ${row.id} and status = 'validated'`;
  }
  return row.id as string;
}

export async function submitSalesCall(input: SalesCallInput) {
  const ctx = await apptContext(input.appointmentId);
  await logSubmission("sales_call", input.repId, ctx.call_id, input);
  const results: string[] = [];

  // 1) the slot outcome (terminal slots stay immutable — only move live slots)
  if (["scheduled", "confirmed"].includes(ctx.appointment_status)) {
    await sql`update sales.appointment set status = ${input.outcome} where id = ${input.appointmentId}`;
  }

  if (input.outcome !== "taken") {
    const stage = input.outcome === "no_show" ? "no_show"
      : input.outcome === "cancelled_by_lead" ? "call_canceled_by_lead" : "call_canceled_by_team";
    await sql`update sales.opportunity set stage = ${stage} where id = ${ctx.opportunity_id}`;
    results.push(`Recorded ${input.outcome.replaceAll("_", " ")}`);
    await queueCloseSync(ctx, stage, `Call outcome logged from dashboard: ${input.outcome}. ${input.notes ?? ""}`, results);
    return finish(results);
  }

  // 2) taken call: disposition + offer
  await sql`
    update sales.call set occurred_at = coalesce(occurred_at, now()),
      offer_made = ${input.offerMade ?? false}, disposition = ${input.disposition ?? "no_decision"},
      rep_id = coalesce(rep_id, ${input.repId})
    where id = ${ctx.call_id}`;
  results.push("Call marked taken");

  // 3) objections
  for (const objId of input.objectionTypeIds ?? []) {
    await sql`
      insert into sales.objection (strategy_call_id, objection_type_id, led_to_loss, source)
      values (${ctx.call_id}, ${objId}, ${input.disposition === "dq_on_call"}, 'rep_logged')`;
  }

  let stage: string | null = null;
  if (input.disposition === "closed") {
    // 4) the deal chain: deal -> plan v1 -> receivables -> fulfilment
    const [plan] = await sql`
      select pp.id, pp.name as plan_type, pp.installments, pp.installment_amount_minor, pp.requires_first_last
      from marketing.pricing_plan pp where pp.id = ${input.pricingPlanId ?? null}`;
    if (!plan) throw new Error("Pick the pricing plan that was sold");
    const tcv = input.tcvMinor ?? plan.installments * plan.installment_amount_minor;
    stage = plan.plan_type === "pif" ? "won_pif" : "won_pp";

    const [deal] = await sql`
      insert into sales.deal (opportunity_id, contact_id, closer_rep_id, offer_id, total_contract_value_minor,
                              plan_type_snapshot, deal_close_date, status, is_demo)
      values (${ctx.opportunity_id}, ${ctx.contact_id}, ${input.repId},
              (select id from marketing.offer where type = 'core'), ${tcv}, ${plan.plan_type}, current_date, 'active', ${ctx.is_demo})
      returning id`;
    const [pplan] = await sql`
      insert into finance.payment_plan (deal_id, version, plan_type, total_minor, is_current, is_demo)
      values (${deal.id}, 1, ${plan.plan_type}, ${tcv}, true, ${ctx.is_demo}) returning id`;

    const per = Math.round(tcv / plan.installments);
    for (let k = 1; k <= plan.installments; k++) {
      // first+last upfront: installments 1 and N are both due at close
      const dueAtClose = k === 1 || (plan.requires_first_last && k === plan.installments);
      await sql`
        insert into finance.receivable (payment_plan_id, deal_id, installment_no, due_date, amount_minor, status, is_demo)
        values (${pplan.id}, ${deal.id}, ${k},
                current_date + make_interval(months => ${dueAtClose ? 0 : k - 1}),
                ${per}, 'scheduled', ${ctx.is_demo})`;
    }
    if (input.firstPaymentMinor && input.firstPaymentMinor > 0) {
      const [recv] = await sql`
        select id from finance.receivable where deal_id = ${deal.id} and installment_no = 1`;
      const [pay] = await sql`
        insert into finance.successful_payment (deal_id, receivable_id, rep_id, processor, type, amount_minor, occurred_at, is_demo)
        values (${deal.id}, ${recv.id}, ${input.repId}, 'nmi',
                ${plan.plan_type === "pif" ? "pif" : "deposit"}, ${input.firstPaymentMinor}, now(), ${ctx.is_demo})
        returning id`;
      await sql`update finance.receivable set status = 'paid', paid_at = current_date, payment_id = ${pay.id} where id = ${recv.id}`;
      results.push("First payment recorded");
    }
    await sql`
      insert into delivery.fulfilment (deal_id, contact_id, onboarded_at, program_start, program_end, onboarding_complete, status, is_demo)
      values (${deal.id}, ${ctx.contact_id}, null, current_date, current_date + interval '6 months', false, 'active', ${ctx.is_demo})`;
    await sql`update core.contact set lifecycle_status = 'customer' where id = ${ctx.contact_id} and lifecycle_status not in ('do_not_contact')`;
    await sql`update sales.opportunity set stage = ${stage}, closed_at = now() where id = ${ctx.opportunity_id}`;
    results.push(`Deal won (${String(plan.plan_type).toUpperCase()}) — onboarding record created`);
  } else if (input.disposition === "dq_on_call") {
    stage = "dq_on_call";
    await sql`
      update sales.opportunity set stage = 'dq_on_call', qualified = false, dq_stage = 'closing',
        dq_reason_id = ${input.dqReasonId ?? null}, closed_at = now()
      where id = ${ctx.opportunity_id}`;
    results.push("Disqualified on call");
  } else if (input.disposition === "follow_up") {
    stage = "follow_up_call_booked";
    await sql`update sales.opportunity set stage = 'follow_up_call_booked' where id = ${ctx.opportunity_id}`;
    results.push("Marked for follow-up");
  } else {
    stage = "warm_list";
    await sql`update sales.opportunity set stage = 'warm_list', lost_reason_id = ${input.lostReasonId ?? null} where id = ${ctx.opportunity_id}`;
    results.push("No decision — moved to warm list");
  }

  await queueCloseSync(ctx, stage, buildNote(ctx.full_name, input), results);
  return finish(results);
}

function buildNote(name: string, input: SalesCallInput): string {
  const lines = [
    `Sales call logged from the TCB dashboard for ${name}.`,
    `Outcome: ${input.outcome}${input.disposition ? ` / ${input.disposition}` : ""}. Offer made: ${input.offerMade ? "yes" : "no"}.`,
  ];
  if (input.notes) lines.push(`Notes: ${input.notes}`);
  return lines.join("\n");
}

// Every form outcome fans out to all three systems: Supabase (already written),
// Close (stage + note), and GHL (note on the contact in its sub-account).
async function queueCloseSync(ctx: any, stage: string | null, note: string, results: string[]) {
  if (stage && ctx.opp_close_id) {
    await queueWriteback("close", "close_update_opportunity_stage", ctx.opp_close_id, { stage_label: stage }, "dashboard_form");
    results.push(`Close opportunity stage push queued (${stage})`);
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
  newTime?: string;
  notes?: string;
};

export async function submitMissedCall(input: MissedCallInput) {
  const ctx = await apptContext(input.appointmentId);
  await logSubmission("missed_call", input.repId, ctx.call_id, input);
  const results: string[] = [];

  if (["scheduled", "confirmed"].includes(ctx.appointment_status)) {
    if (input.what === "rescheduled") {
      await sql`
        update sales.appointment set status = 'rescheduled', rescheduled_at = now(), moved_by = 'closer',
          reason_id = ${input.reasonId ?? null} where id = ${input.appointmentId}`;
      const [prev] = await sql`select seq from sales.appointment where id = ${input.appointmentId}`;
      await sql`update sales.appointment set is_current = false where call_id = ${ctx.call_id}`;
      await sql`
        insert into sales.appointment (call_id, seq, scheduled_for, status, is_current, is_demo)
        values (${ctx.call_id}, ${prev.seq + 1}, ${input.newTime ?? new Date().toISOString()}, 'scheduled', true, ${ctx.is_demo})`;
      await sql`update sales.call set current_scheduled_at = ${input.newTime ?? null} where id = ${ctx.call_id}`;
      results.push("Reschedule recorded — old slot kept in history, new slot live");
    } else {
      await sql`
        update sales.appointment set status = ${input.what}, reason_id = ${input.reasonId ?? null}
        where id = ${input.appointmentId}`;
      const stage = input.what === "no_show" ? "no_show"
        : input.what === "cancelled_by_lead" ? "call_canceled_by_lead" : "call_canceled_by_team";
      await sql`update sales.opportunity set stage = ${stage} where id = ${ctx.opportunity_id}`;
      results.push(`Recorded ${input.what.replaceAll("_", " ")}`);
      await queueCloseSync(ctx, stage, `Missed-call report from dashboard: ${input.what}. ${input.notes ?? ""}`, results);
      return finish(results);
    }
  } else {
    results.push("This slot already has a final status — nothing changed (history is immutable)");
  }
  await queueCloseSync(ctx, null, `Missed-call report from dashboard: ${input.what}. ${input.notes ?? ""}`, results);
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
