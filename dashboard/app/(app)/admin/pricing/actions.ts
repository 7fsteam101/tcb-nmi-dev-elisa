"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";

async function guard() {
  const user = await requireSession();
  if (user.role !== "admin") throw new Error("Admins only");
}

export async function togglePlanAction(id: string) {
  await guard();
  await sql`
    update marketing.pricing_plan set effective_to = case when effective_to is null then current_date else null end
    where id = ${id}`;
  revalidatePath("/admin/pricing");
}

export async function updatePlanAmountAction(id: string, dollars: string) {
  await guard();
  const minor = Math.round(parseFloat(dollars) * 100);
  if (!Number.isFinite(minor) || minor <= 0) return;
  await sql`update marketing.pricing_plan set installment_amount_minor = ${minor} where id = ${id}`;
  revalidatePath("/admin/pricing");
}

export async function addPlanAction(_prev: unknown, formData: FormData) {
  try {
    await guard();
    const name = String(formData.get("name"));
    const installments = parseInt(String(formData.get("installments")), 10);
    const amount = Math.round(parseFloat(String(formData.get("amount"))) * 100);
    const firstLast = formData.get("firstLast") === "on";
    if (!installments || !amount) return { ok: false, message: "Installments and amount required" };
    await sql`
      insert into marketing.pricing_plan (offer_id, name, version, installments, installment_amount_minor, requires_first_last, effective_from)
      values ((select id from marketing.offer where type = 'core'), ${name}::public.plan_type,
              coalesce((select max(version) + 1 from marketing.pricing_plan pp join marketing.offer o on o.id = pp.offer_id where o.type = 'core' and pp.name = ${name}::public.plan_type), 1),
              ${installments}, ${amount}, ${firstLast}, current_date)`;
    revalidatePath("/admin/pricing");
    return { ok: true, message: "Plan added — selectable on the Sales Call form now" };
  } catch (err) {
    return { ok: false, message: String(err instanceof Error ? err.message : err) };
  }
}

export async function toggleOfferAction(id: string) {
  await guard();
  await sql`update marketing.offer set active = not active where id = ${id}`;
  revalidatePath("/admin/pricing");
}
