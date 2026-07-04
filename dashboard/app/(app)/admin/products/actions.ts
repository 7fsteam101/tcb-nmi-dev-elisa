"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";

// Only these cadence values are accepted; anything else is stored as null so a
// bad form value can never reach the payment_cadence enum cast.
const CADENCES = ["monthly", "biweekly", "weekly", "custom"] as const;
type Cadence = (typeof CADENCES)[number];

function cadenceOrNull(raw: string): Cadence | null {
  return (CADENCES as readonly string[]).includes(raw) ? (raw as Cadence) : null;
}

// Writes are limited to admin + leadership. Everyone else is read-only.
async function guard() {
  const user = await requireSession();
  if (user.role !== "admin" && user.role !== "leadership") throw new Error("Admins and leadership only");
}

export async function listProducts() {
  await requireSession();
  const rows = await sql`
    select id, name, description, amount_minor, active, allow_plan,
           default_installments, default_frequency, sort_order
    from finance.payment_product
    order by sort_order nulls last, name`;
  return rows;
}

// Dollars in the UI, minor units in the column: multiply by 100.
function dollarsToMinor(raw: string): number | null {
  const minor = Math.round(parseFloat(raw) * 100);
  return Number.isFinite(minor) && minor >= 0 ? minor : null;
}

// A blank / non-positive installments field means "no default" -> null.
function installmentsOrNull(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return null;
  const n = parseInt(trimmed, 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function sortOrderOrDefault(raw: string): number {
  const n = parseInt(raw.trim(), 10);
  return Number.isFinite(n) ? n : 0;
}

export async function saveProductAction(_prev: unknown, formData: FormData) {
  try {
    await guard();
    const id = String(formData.get("id") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const description = String(formData.get("description") ?? "").trim();
    const amountMinor = dollarsToMinor(String(formData.get("price") ?? ""));
    const active = formData.get("active") === "on";
    const allowPlan = formData.get("allow_plan") === "on";
    const defaultInstallments = installmentsOrNull(String(formData.get("default_installments") ?? ""));
    const defaultFrequency = cadenceOrNull(String(formData.get("default_frequency") ?? ""));
    const sortOrder = sortOrderOrDefault(String(formData.get("sort_order") ?? ""));

    if (!name) return { ok: false, message: "Name required" };
    if (amountMinor === null) return { ok: false, message: "A valid price is required" };

    if (id) {
      await sql`
        update finance.payment_product set
          name = ${name},
          description = ${description === "" ? null : description},
          amount_minor = ${amountMinor},
          active = ${active},
          allow_plan = ${allowPlan},
          default_installments = ${defaultInstallments ?? null},
          default_frequency = ${defaultFrequency ?? null}::public.payment_cadence,
          sort_order = ${sortOrder},
          updated_at = now()
        where id = ${id}`;
      revalidatePath("/admin/products");
      return { ok: true, message: `Updated ${name}` };
    }

    await sql`
      insert into finance.payment_product
        (name, description, amount_minor, active, allow_plan, default_installments, default_frequency, sort_order)
      values
        (${name}, ${description === "" ? null : description}, ${amountMinor}, ${active}, ${allowPlan},
         ${defaultInstallments ?? null}, ${defaultFrequency ?? null}::public.payment_cadence, ${sortOrder})`;
    revalidatePath("/admin/products");
    return { ok: true, message: `Added ${name}` };
  } catch (err) {
    return { ok: false, message: String(err instanceof Error ? err.message : err) };
  }
}

export async function toggleProductAction(id: string) {
  await guard();
  await sql`update finance.payment_product set active = not active, updated_at = now() where id = ${id}`;
  revalidatePath("/admin/products");
}

export async function deleteProductAction(id: string) {
  await guard();
  await sql`delete from finance.payment_product where id = ${id}`;
  revalidatePath("/admin/products");
}
