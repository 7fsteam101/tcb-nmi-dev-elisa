import { sql } from "./db";
import { isDemoMode } from "./settings";

// Option lists the rep forms need, loaded server-side.
export async function formOptions() {
  const demo = await isDemoMode();
  const [appointments, reps, plans, dqReasons, lostReasons, cancelReasons, objectionTypes, takenCalls] = await Promise.all([
    sql`
      select a.id, a.scheduled_for, a.status, ct.full_name
      from sales.appointment a
      join sales.call c on c.id = a.call_id
      join sales.opportunity o on o.id = c.opportunity_id
      join core.contact ct on ct.id = o.contact_id
      where a.is_current and a.is_demo = ${demo}
        and a.scheduled_for between now() - interval '7 days' and now() + interval '7 days'
      order by a.scheduled_for desc limit 100`,
    sql`select id, full_name, role from sales.rep where active and role in ('closer','hybrid','setter') order by full_name`,
    sql`
      select pp.id, pp.name, pp.installments, pp.installment_amount_minor
      from marketing.pricing_plan pp join marketing.offer o on o.id = pp.offer_id
      where o.type = 'core' and (pp.effective_to is null or pp.effective_to >= current_date)
      order by pp.installments`,
    sql`select id, name from core.dq_reason where active order by sort_order`,
    sql`select id, name from core.lost_reason where active order by sort_order`,
    sql`select id, name from core.cancellation_reason where active order by sort_order`,
    sql`select id, name from core.objection_type where active order by sort_order`,
    sql`
      select c.id, c.occurred_at, ct.full_name
      from sales.call c
      join sales.opportunity o on o.id = c.opportunity_id
      join core.contact ct on ct.id = o.contact_id
      where c.type = 'strategy' and c.occurred_at is not null and c.is_demo = ${demo}
      order by c.occurred_at desc limit 50`,
  ]);
  return {
    appointments: appointments.map((a: any) => ({
      id: a.id, label: `${a.full_name} — ${new Date(a.scheduled_for).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })} (${a.status})`,
    })),
    reps: reps.map((r: any) => ({ id: r.id, label: `${r.full_name} (${r.role})` })),
    plans: plans.map((p: any) => ({
      id: p.id, label: `${String(p.name).toUpperCase()} — ${p.installments} x $${(p.installment_amount_minor / 100).toLocaleString()}`,
      totalMinor: p.installments * p.installment_amount_minor,
    })),
    dqReasons: dqReasons.map((r: any) => ({ id: r.id, label: r.name })),
    lostReasons: lostReasons.map((r: any) => ({ id: r.id, label: r.name })),
    cancelReasons: cancelReasons.map((r: any) => ({ id: r.id, label: r.name })),
    objectionTypes: objectionTypes.map((r: any) => ({ id: r.id, label: r.name })),
    takenCalls: takenCalls.map((c: any) => ({
      id: c.id, label: `${c.full_name} — taken ${new Date(c.occurred_at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
    })),
  };
}

export type FormOptions = Awaited<ReturnType<typeof formOptions>>;
