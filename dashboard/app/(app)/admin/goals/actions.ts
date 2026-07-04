"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { isMoneyMetric, type Metric, type Period } from "@/lib/goals";

// Goals CRUD. Writes are admin or leadership; the parent /admin layout already
// gates the whole section to admins, but leadership is allowed to author goals
// so the guard is stated explicitly here.
const METRICS: Metric[] = ["calls_booked", "calls_taken", "cash_collected", "deals_won", "clients"];
const PERIODS: Period[] = ["weekly", "monthly", "quarterly"];

async function guard() {
  const user = await requireSession();
  if (user.role !== "admin" && user.role !== "leadership") throw new Error("Admins and leadership only");
}

// target arrives as dollars for cash_collected (store minor units); else an integer count.
function targetToStored(metric: Metric, raw: string): number | null {
  const n = parseFloat(raw);
  if (!Number.isFinite(n) || n <= 0) return null;
  return isMoneyMetric(metric) ? Math.round(n * 100) : Math.round(n);
}

export async function saveGoalAction(_prev: unknown, formData: FormData) {
  try {
    await guard();
    const id = String(formData.get("id") ?? "").trim() || null;
    const scope = String(formData.get("scope") ?? "company");
    const metric = String(formData.get("metric") ?? "") as Metric;
    const period = String(formData.get("period") ?? "monthly") as Period;
    const repId = String(formData.get("repId") ?? "").trim() || null;

    if (scope !== "company" && scope !== "rep") return { ok: false, message: "Pick a scope" };
    if (!METRICS.includes(metric)) return { ok: false, message: "Pick a metric" };
    if (!PERIODS.includes(period)) return { ok: false, message: "Pick a period" };
    if (scope === "rep" && !repId) return { ok: false, message: "Pick a rep for a per-rep goal" };

    const target = targetToStored(metric, String(formData.get("target") ?? ""));
    if (target === null) return { ok: false, message: "Enter a target greater than zero" };

    const finalRepId = scope === "rep" ? repId : null;

    if (id) {
      await sql`
        update core.goal
          set scope = ${scope}, rep_id = ${finalRepId ?? null}, metric = ${metric},
              period = ${period}, target_value = ${target}
          where id = ${id}`;
    } else {
      await sql`
        insert into core.goal (scope, rep_id, metric, period, target_value)
        values (${scope}, ${finalRepId ?? null}, ${metric}, ${period}, ${target})`;
    }
    revalidatePath("/admin/goals");
    return { ok: true, message: id ? "Goal updated" : "Goal created" };
  } catch (err) {
    return { ok: false, message: String(err instanceof Error ? err.message : err) };
  }
}

export async function deleteGoalAction(id: string) {
  await guard();
  await sql`delete from core.goal where id = ${id}`;
  revalidatePath("/admin/goals");
}
