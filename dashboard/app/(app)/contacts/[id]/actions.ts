"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { isDemoMode } from "@/lib/settings";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export async function addContactNoteAction(_prev: unknown, formData: FormData) {
  const user = await requireSession();
  const contactId = String(formData.get("contactId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!UUID.test(contactId)) return { ok: false, message: "Bad contact" };
  if (!body) return { ok: false, message: "Write something first" };
  const demo = await isDemoMode();
  await sql`insert into core.contact_note (contact_id, body, author_user_id, is_demo)
            values (${contactId}, ${body}, ${user.id}, ${demo})`;
  revalidatePath(`/contacts/${contactId}`);
  return { ok: true, message: "Note added" };
}
