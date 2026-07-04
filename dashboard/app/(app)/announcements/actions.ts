"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";

async function guardWrite() {
  const user = await requireSession();
  if (!["admin", "leadership"].includes(user.role)) throw new Error("Admins and leadership only");
  return user;
}

export async function createAnnouncementAction(_prev: unknown, formData: FormData) {
  try {
    const user = await guardWrite();
    const title = String(formData.get("title") ?? "").trim();
    if (!title) return { ok: false, message: "Title required" };
    await sql`
      insert into core.announcement (title, body, level, pinned_to_banner, starts_at, ends_at, created_by_user_id)
      values (${title}, ${(formData.get("body") as string) || null}, ${String(formData.get("level") ?? "info")},
              ${formData.get("pinned") === "on"},
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
