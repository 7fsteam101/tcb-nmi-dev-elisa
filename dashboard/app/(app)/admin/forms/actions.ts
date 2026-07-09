"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";

async function guard() {
  const user = await requireSession();
  if (user.role !== "admin") throw new Error("Admins only");
}

// Counts-as-lead: the admin decision that makes a form's submissions count as
// lead opt-ins (July 9 policy: tracking follows the mapping). Re-applies to the
// form's historical opt-ins so past data follows the decision.
export async function toggleFormCountsAction(id: string) {
  await guard();
  const [row] = await sql`
    update sync.form_map set counts_as_lead = not counts_as_lead, reviewed_at = now()
    where id = ${id} returning form_id, counts_as_lead`;
  if (row) await sql`update sales.opt_in set counted = ${row.counts_as_lead} where form_id = ${row.form_id}`;
  revalidatePath("/admin/forms");
}

export async function renameFormAction(id: string, name: string) {
  await guard();
  await sql`update sync.form_map set form_name = ${name.trim() || null}, reviewed_at = now() where id = ${id}`;
  revalidatePath("/admin/forms");
}
