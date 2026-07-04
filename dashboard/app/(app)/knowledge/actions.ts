"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";

async function guardWrite() {
  const user = await requireSession();
  if (!["admin", "leadership"].includes(user.role)) throw new Error("Admins and leadership only");
  return user;
}

export async function createArticleAction(_prev: unknown, formData: FormData) {
  let newId: string;
  try {
    const user = await guardWrite();
    const title = String(formData.get("title") ?? "").trim();
    if (!title) return { ok: false, message: "Title required" };
    const [row] = await sql`
      insert into core.kb_article (title, category, body, published, updated_by_user_id)
      values (${title}, ${(formData.get("category") as string) || null}, ${(formData.get("body") as string) || ""},
              ${formData.get("published") === "on"}, ${user.id})
      returning id`;
    newId = row.id;
  } catch (err) {
    return { ok: false, message: String(err instanceof Error ? err.message : err) };
  }
  revalidatePath("/knowledge");
  redirect(`/knowledge/${newId}`);
}

export async function saveArticleAction(_prev: unknown, formData: FormData) {
  try {
    const user = await guardWrite();
    const id = String(formData.get("id"));
    await sql`
      update core.kb_article set
        title = ${String(formData.get("title") ?? "").trim()},
        category = ${(formData.get("category") as string) || null},
        body = ${(formData.get("body") as string) || ""},
        published = ${formData.get("published") === "on"},
        updated_by_user_id = ${user.id}
      where id = ${id}`;
    revalidatePath(`/knowledge/${id}`); revalidatePath("/knowledge");
    return { ok: true, message: "Saved" };
  } catch (err) {
    return { ok: false, message: String(err instanceof Error ? err.message : err) };
  }
}
