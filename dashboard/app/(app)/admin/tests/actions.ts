"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { setContactTestFlag, sweepTestRules } from "@/lib/sync/test-rules";

async function guard() {
  const user = await requireSession();
  if (user.role !== "admin") throw new Error("Admins only");
}

export async function addTestRuleAction(_prev: unknown, formData: FormData) {
  try {
    await guard();
    const kind = String(formData.get("kind") ?? "keyword");
    const value = String(formData.get("value") ?? "").trim().toLowerCase();
    if (!value) return { ok: false, message: "Value required" };
    if (!["email", "keyword"].includes(kind)) return { ok: false, message: "Bad kind" };
    if (kind === "keyword" && value.length < 3) return { ok: false, message: "Keywords need at least 3 characters" };
    await sql`insert into core.test_rule (kind, value) values (${kind}, ${value}) on conflict do nothing`;
    const flagged = await sweepTestRules(); // apply the new rule immediately
    revalidatePath("/admin/tests");
    return { ok: true, message: flagged > 0 ? `Rule added; ${flagged} contact${flagged === 1 ? "" : "s"} flagged` : "Rule added" };
  } catch (err) {
    return { ok: false, message: String(err instanceof Error ? err.message : err) };
  }
}

// Removing a rule stops FUTURE flagging; already-flagged contacts stay flagged
// (untrack them individually below) so removing a rule never silently changes numbers.
export async function deleteTestRuleAction(id: string) {
  await guard();
  await sql`delete from core.test_rule where id = ${id}`;
  revalidatePath("/admin/tests");
}

export async function untrackTestContactAction(contactId: string) {
  await guard();
  await setContactTestFlag(contactId, false, null);
  revalidatePath("/admin/tests");
}

export async function flagTestContactAction(contactId: string) {
  await guard();
  await setContactTestFlag(contactId, true, "flagged manually in Admin, Test data");
  revalidatePath("/admin/tests");
}

export async function runSweepAction() {
  await guard();
  const flagged = await sweepTestRules();
  revalidatePath("/admin/tests");
  return { flagged };
}
