"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/settings";

// The lookup tables the forms read live. Whitelist — nothing else is editable
// through this action.
const TABLES: Record<string, { schema: string; table: string; label: string }> = {
  dq_reason: { schema: "core", table: "dq_reason", label: "DQ reasons" },
  lost_reason: { schema: "core", table: "lost_reason", label: "Lost reasons" },
  cancellation_reason: { schema: "core", table: "cancellation_reason", label: "Cancellation reasons" },
  objection_type: { schema: "core", table: "objection_type", label: "Objection types" },
  source_channel: { schema: "core", table: "source_channel", label: "Source channels" },
};

async function guard(key: string) {
  const user = await requireSession();
  if (user.role !== "admin") throw new Error("Admins only");
  const t = TABLES[key];
  if (!t) throw new Error("Unknown option list");
  return t;
}

export async function addOptionAction(_prev: unknown, formData: FormData) {
  try {
    const t = await guard(String(formData.get("list")));
    const name = String(formData.get("name") ?? "").trim();
    if (!name) return { ok: false, message: "Name required" };
    await sql`
      insert into ${sql(t.schema)}.${sql(t.table)} (name, sort_order)
      values (${name}, (select coalesce(max(sort_order), 0) + 1 from ${sql(t.schema)}.${sql(t.table)} where sort_order < 99))`;
    revalidatePath("/admin/options");
    return { ok: true, message: `Added to ${t.label} — live on the forms now` };
  } catch (err) {
    return { ok: false, message: String(err instanceof Error ? err.message : err) };
  }
}

export async function renameOptionAction(list: string, id: string, name: string) {
  const t = await guard(list);
  if (!name.trim()) return;
  await sql`update ${sql(t.schema)}.${sql(t.table)} set name = ${name.trim()} where id = ${id}`;
  revalidatePath("/admin/options");
}

export async function toggleOptionAction(list: string, id: string) {
  const t = await guard(list);
  await sql`update ${sql(t.schema)}.${sql(t.table)} set active = not active where id = ${id}`;
  revalidatePath("/admin/options");
}

export async function moveOptionAction(list: string, id: string, dir: "up" | "down") {
  const t = await guard(list);
  const rows = await sql`
    select id, sort_order from ${sql(t.schema)}.${sql(t.table)} order by sort_order nulls last, name`;
  const i = rows.findIndex((r: any) => r.id === id);
  const j = dir === "up" ? i - 1 : i + 1;
  if (i < 0 || j < 0 || j >= rows.length) return;
  await sql`update ${sql(t.schema)}.${sql(t.table)} set sort_order = ${rows[j].sort_order ?? j + 1} where id = ${rows[i].id}`;
  await sql`update ${sql(t.schema)}.${sql(t.table)} set sort_order = ${rows[i].sort_order ?? i + 1} where id = ${rows[j].id}`;
  revalidatePath("/admin/options");
}

// --- Sync policy -------------------------------------------------------
// Master switch for the outbound GHL -> Close push (core.app_setting
// "close_push_enabled", default OFF). It stays OFF until the pipeline
// cutover retires the client's booking Zap; flipping it ON hands the Close
// card moves (bookings, no-shows, lead cancels) to our write-back queue.

export async function closePushEnabled(): Promise<boolean> {
  const user = await requireSession();
  if (user.role !== "admin") throw new Error("Admins only");
  return getSetting<boolean>("close_push_enabled", false);
}

export async function toggleClosePushAction() {
  const user = await requireSession();
  if (user.role !== "admin") throw new Error("Admins only");
  const on = await getSetting<boolean>("close_push_enabled", false);
  await setSetting("close_push_enabled", !on);
  revalidatePath("/admin/options");
}

export async function listOptions() {
  const user = await requireSession();
  if (user.role !== "admin") throw new Error("Admins only");
  const result: Record<string, { label: string; rows: any[] }> = {};
  for (const [key, t] of Object.entries(TABLES)) {
    const rows = await sql`
      select id, name, sort_order, active from ${sql(t.schema)}.${sql(t.table)}
      order by sort_order nulls last, name`;
    result[key] = { label: t.label, rows };
  }
  return result;
}
