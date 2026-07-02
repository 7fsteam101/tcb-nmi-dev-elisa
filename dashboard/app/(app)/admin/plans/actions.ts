"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";

// The re-split flow — the fix for the "plan changed but the schedule went stale"
// bug class. A re-split NEVER edits rows: it retires the current plan version,
// creates version+1, and generates a fresh schedule for the remaining balance.
// Paid installments and the old schedule stay in history untouched.
export async function resplitPlanAction(_prev: unknown, formData: FormData) {
  const user = await requireSession();
  if (user.role !== "admin") return { ok: false, message: "Admins only" };
  try {
    const dealId = String(formData.get("dealId"));
    const planType = String(formData.get("planType"));
    const installments = parseInt(String(formData.get("installments")), 10);
    const firstDue = String(formData.get("firstDue"));
    if (!dealId || !installments || installments < 1 || !firstDue)
      return { ok: false, message: "Deal, installments, and first due date required" };

    const [deal] = await sql`
      select d.id, d.total_contract_value_minor, d.is_demo,
        coalesce((select sum(p.amount_minor) from finance.successful_payment p
                  where p.deal_id = d.id and p.type <> 'booking_25'), 0) as paid_minor,
        (select pp.version from finance.payment_plan pp where pp.deal_id = d.id and pp.is_current) as current_version
      from sales.deal d where d.id = ${dealId}`;
    if (!deal) return { ok: false, message: "Deal not found" };

    const remaining = Number(deal.total_contract_value_minor) - Number(deal.paid_minor);
    if (remaining <= 0) return { ok: false, message: "Nothing left to schedule — the deal is fully collected" };

    const per = Math.floor(remaining / installments);
    const lastExtra = remaining - per * installments; // last installment absorbs rounding

    // retire the current version, create the next one
    await sql`update finance.payment_plan set is_current = false, superseded_at = now() where deal_id = ${dealId} and is_current`;
    const [plan] = await sql`
      insert into finance.payment_plan (deal_id, version, plan_type, total_minor, is_current, is_demo)
      values (${dealId}, ${Number(deal.current_version ?? 0) + 1}, ${planType}::public.plan_type, ${remaining}, true, ${deal.is_demo})
      returning id, version`;
    for (let k = 1; k <= installments; k++) {
      await sql`
        insert into finance.receivable (payment_plan_id, deal_id, installment_no, due_date, amount_minor, status, is_demo)
        values (${plan.id}, ${dealId}, ${k}, ${firstDue}::date + make_interval(months => ${k - 1}),
                ${k === installments ? per + lastExtra : per}, 'scheduled', ${deal.is_demo})`;
    }
    revalidatePath("/admin/plans");
    revalidatePath("/receivables");
    return {
      ok: true,
      message: `Version ${plan.version} created: ${installments} x $${(per / 100).toLocaleString()} for the remaining $${(remaining / 100).toLocaleString()}. Old schedule preserved in history.`,
    };
  } catch (err) {
    return { ok: false, message: String(err instanceof Error ? err.message : err) };
  }
}
