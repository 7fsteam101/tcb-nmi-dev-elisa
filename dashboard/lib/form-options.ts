import { sql } from "./db";
import { isDemoMode } from "./settings";

// Option lists the rep forms need. CONSOLIDATED to 3 sequential queries: the
// transaction pooler serializes cold connection handshakes, so an 8-way
// Promise.all here could exceed the serverless time limit (the forms-page 504s).
export async function formOptions() {
  const demo = await isDemoMode();

  // one pass for every {id,name} lookup list
  const lookups = await sql`
    select 'dq' as list, id, name, sort_order from core.dq_reason where active
    union all select 'lost', id, name, sort_order from core.lost_reason where active
    union all select 'cancel', id, name, sort_order from core.cancellation_reason where active
    union all select 'objection', id, name, sort_order from core.objection_type where active
    order by list, sort_order nulls last, name`;
  const pick = (list: string) => lookups.filter((r: any) => r.list === list).map((r: any) => ({ id: r.id, label: r.name }));

  // one pass for reps + plans (labeled union, distinct shapes packed as jsonb)
  const repsPlans = await sql`
    select 'rep' as kind, id, full_name as a, role::text as b, null::int as n1, null::int as n2 from sales.rep
      where active and role in ('closer','hybrid','setter')
    union all
    select 'plan', pp.id, pp.name::text, null, pp.installments, pp.installment_amount_minor
      from marketing.pricing_plan pp join marketing.offer o on o.id = pp.offer_id
      where o.type = 'core' and (pp.effective_to is null or pp.effective_to >= current_date)
    order by kind, a`;

  // one pass for both call selectors
  const calls = await sql`
    select 'appt' as kind, a.id, a.scheduled_for as at, a.status::text as status, ct.full_name
    from sales.appointment a
    join sales.call c on c.id = a.call_id
    join sales.opportunity o on o.id = c.opportunity_id
    join core.contact ct on ct.id = o.contact_id
    where a.is_current and a.is_demo = ${demo}
      and a.scheduled_for between now() - interval '7 days' and now() + interval '7 days'
    union all
    select 'taken', c.id, c.occurred_at, null, ct.full_name
    from sales.call c
    join sales.opportunity o on o.id = c.opportunity_id
    join core.contact ct on ct.id = o.contact_id
    where c.type = 'strategy' and c.occurred_at is not null and c.is_demo = ${demo}
    order by kind, at desc
    limit 150`;

  return {
    appointments: calls.filter((r: any) => r.kind === "appt").slice(0, 100).map((a: any) => ({
      id: a.id,
      label: `${a.full_name} — ${new Date(a.at).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: "America/New_York" })} (${a.status})`,
    })),
    takenCalls: calls.filter((r: any) => r.kind === "taken").slice(0, 50).map((c: any) => ({
      id: c.id,
      label: `${c.full_name} — taken ${new Date(c.at).toLocaleDateString("en-US", { month: "short", day: "numeric" })}`,
    })),
    reps: repsPlans.filter((r: any) => r.kind === "rep").map((r: any) => ({ id: r.id, label: `${r.a} (${r.b})` })),
    plans: repsPlans.filter((r: any) => r.kind === "plan").map((p: any) => ({
      id: p.id,
      label: `${String(p.a).toUpperCase()} — ${p.n1} x $${(p.n2 / 100).toLocaleString()}`,
      totalMinor: p.n1 * p.n2,
    })),
    dqReasons: pick("dq"),
    lostReasons: pick("lost"),
    cancelReasons: pick("cancel"),
    objectionTypes: pick("objection"),
  };
}

export type FormOptions = Awaited<ReturnType<typeof formOptions>>;
