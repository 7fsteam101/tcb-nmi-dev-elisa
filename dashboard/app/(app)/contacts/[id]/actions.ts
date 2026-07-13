"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { isDemoMode } from "@/lib/settings";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_FILE_BYTES = 4 * 1024 * 1024;

// Adds a note, optionally with file attachments (multipart FormData "files").
// Attachments are stored as bytea in core.note_attachment (4MB/file cap,
// re-checked here regardless of the client gate) and served back through
// /api/attachments/[id]. Note + attachments commit atomically (sql.begin pins
// one pooled connection, which is exactly what the transaction pooler expects).
export async function addContactNoteAction(_prev: unknown, formData: FormData) {
  const user = await requireSession();
  if (user?.id) {
    const [row] = await sql`select can_view_notes from core.app_user where id = ${user.id}`;
    if (row && row.can_view_notes === false) return { ok: false, message: "You do not have access to notes" };
  }
  const contactId = String(formData.get("contactId") ?? "");
  const body = String(formData.get("body") ?? "").trim();
  if (!UUID.test(contactId)) return { ok: false, message: "Bad contact" };
  if (!body) return { ok: false, message: "Write something first" };

  // an empty file input still submits one zero-byte part; keep real files only
  const raw = formData.getAll("files").filter(
    (f): f is File => f instanceof File && f.size > 0 && f.name !== "",
  );
  const files: { name: string; type: string; buf: Buffer }[] = [];
  for (const f of raw) {
    if (f.size > MAX_FILE_BYTES) return { ok: false, message: `${f.name} is over the 4MB limit` };
    const buf = Buffer.from(await f.arrayBuffer());
    if (buf.length > MAX_FILE_BYTES) return { ok: false, message: `${f.name} is over the 4MB limit` };
    files.push({ name: f.name, type: f.type || "application/octet-stream", buf });
  }

  const demo = await isDemoMode();
  await sql.begin(async (tx) => {
    const [note] = await tx`
      insert into core.contact_note (contact_id, body, author_user_id, is_demo)
      values (${contactId}, ${body}, ${user.id}, ${demo}) returning id`;
    for (const f of files) {
      await tx`
        insert into core.note_attachment (note_id, filename, mime, size_bytes, data)
        values (${note.id}, ${f.name}, ${f.type}, ${f.buf.length}, ${f.buf})`;
    }
  });
  revalidatePath(`/contacts/${contactId}`);
  return {
    ok: true,
    message: files.length > 0 ? `Note added with ${files.length} attachment${files.length > 1 ? "s" : ""}` : "Note added",
  };
}
