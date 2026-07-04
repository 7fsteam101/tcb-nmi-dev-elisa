"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";

async function guardWrite() {
  const user = await requireSession();
  if (!["admin", "leadership"].includes(user.role)) throw new Error("Admins and leadership only");
  return user;
}

const ALL_ROLES = ["admin", "leadership", "closer", "setter", "csm"] as const;
// Text OID: a text[] passed with an explicit element type never triggers the
// pg_type bootstrap (fetch_types is off), so this is the safe way to bind an array.
const TEXT_OID = 25;

export async function createAnnouncementAction(_prev: unknown, formData: FormData) {
  try {
    const user = await guardWrite();
    const title = String(formData.get("title") ?? "").trim();
    if (!title) return { ok: false, message: "Title required" };
    // Whitelist + dedupe the selected roles. Empty, or every role selected,
    // both mean "everyone" -> store null so the read-side filter treats it as open.
    const picked = formData.getAll("roles").map(String).filter((r): r is (typeof ALL_ROLES)[number] => (ALL_ROLES as readonly string[]).includes(r));
    const roles = [...new Set(picked)];
    const audience = roles.length === 0 || roles.length === ALL_ROLES.length ? null : sql.array(roles, TEXT_OID);
    await sql`
      insert into core.announcement (title, body, level, pinned_to_banner, audience_roles, starts_at, ends_at, created_by_user_id)
      values (${title}, ${(formData.get("body") as string) || null}, ${String(formData.get("level") ?? "info")},
              ${formData.get("pinned") === "on"}, ${audience},
              ${(formData.get("starts") as string) || null}, ${(formData.get("ends") as string) || null}, ${user.id})`;
    revalidatePath("/announcements"); revalidatePath("/", "layout");
    return { ok: true, message: "Posted" };
  } catch (err) {
    return { ok: false, message: String(err instanceof Error ? err.message : err) };
  }
}

export async function toggleAnnouncementAction(id: string, field: "active" | "pinned_to_banner") {
  await guardWrite();
  if (field === "active") await sql`update core.announcement set active = not active where id = ${id}`;
  else await sql`update core.announcement set pinned_to_banner = not pinned_to_banner where id = ${id}`;
  revalidatePath("/announcements"); revalidatePath("/", "layout");
}
