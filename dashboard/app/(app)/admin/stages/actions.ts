"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";

async function admin() {
  const user = await requireSession();
  if (user.role !== "admin") throw new Error("Admins only");
}

/** Assign the system meaning to a platform stage label and activate it. */
export async function setStageMappingAction(id: string, stage: string) {
  await admin();
  await sql`update sync.stage_map set mapped_stage = ${stage}::public.opportunity_stage, active = true where id = ${id}`;
  revalidatePath("/admin/stages");
}

/** Deactivate a mapping: the label is recorded but stops driving stage changes. */
export async function deactivateStageAction(id: string) {
  await admin();
  await sql`update sync.stage_map set active = false where id = ${id}`;
  revalidatePath("/admin/stages");
}
