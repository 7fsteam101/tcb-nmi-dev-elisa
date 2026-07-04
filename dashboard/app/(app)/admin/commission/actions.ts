"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";

// Per-rep commission-rule toggles. Admin-only writes. A row in
// sales.rep_commission_setting overrides the rule's default_enabled for that rep;
// upsert on the (rep_id, rule_id) primary key.
async function guard() {
  const user = await requireSession();
  if (user.role !== "admin") throw new Error("Admins only");
}

export async function setRuleEnabledAction(repId: string, ruleId: string, enabled: boolean) {
  await guard();
  await sql`
    insert into sales.rep_commission_setting (rep_id, rule_id, enabled)
    values (${repId}, ${ruleId}, ${enabled})
    on conflict (rep_id, rule_id) do update set enabled = excluded.enabled`;
  revalidatePath("/admin/commission");
}
