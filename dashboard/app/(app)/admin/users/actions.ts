"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireSession, hashPassword } from "@/lib/auth";
import { PAGES, type PageKey } from "@/lib/access";

async function guard() {
  const user = await requireSession();
  if (user.role !== "admin") throw new Error("Admins only");
  return user;
}

export async function addUserAction(_prev: unknown, formData: FormData) {
  try {
    await guard();
    const email = String(formData.get("email") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim();
    const role = String(formData.get("role") ?? "closer");
    const password = String(formData.get("password") ?? "");
    const repId = (formData.get("repId") as string) || null;
    if (!email || !name || password.length < 10)
      return { ok: false, message: "Email, name, and a 10+ character password required" };
    await sql`
      insert into core.app_user (email, full_name, password_hash, role, rep_id)
      values (${email}, ${name}, ${hashPassword(password)}, ${role}, ${repId})`;
    revalidatePath("/admin/users");
    return { ok: true, message: `${name} can sign in now — hand them the temp password and have them change it in Settings` };
  } catch (err) {
    return { ok: false, message: String(err).includes("duplicate") ? "That email already has a login" : String(err) };
  }
}

export async function toggleUserActiveAction(id: string) {
  const me = await guard();
  if (me.id === id) return; // no locking yourself out
  await sql`update core.app_user set active = not active where id = ${id}`;
  revalidatePath("/admin/users");
}

export async function setUserRoleAction(id: string, role: string) {
  const me = await guard();
  if (me.id === id && role !== "admin") return; // no demoting yourself
  await sql`update core.app_user set role = ${role} where id = ${id}`;
  revalidatePath("/admin/users");
}

export async function setUserRepAction(id: string, repId: string) {
  await guard();
  await sql`update core.app_user set rep_id = ${repId || null} where id = ${id}`;
  revalidatePath("/admin/users");
}

/** Toggle whether a user can see contact notes + attachments (Notes tab, activity entries, /api/attachments). */
export async function setNotesVisibilityAction(id: string, value: boolean) {
  await guard();
  await sql`update core.app_user set can_view_notes = ${value} where id = ${id}`;
  revalidatePath("/admin/users");
}

/** Toggle one page for one user: allow -> deny -> (via clear) back to role default. */
export async function setPageOverrideAction(id: string, page: string, value: boolean) {
  await guard();
  if (!PAGES.includes(page as PageKey)) return;
  await sql`
    update core.app_user set page_overrides = page_overrides || ${sql.json({ [page]: value } as never)}
    where id = ${id}`;
  revalidatePath("/admin/users");
}

export async function clearOverridesAction(id: string) {
  await guard();
  await sql`update core.app_user set page_overrides = '{}' where id = ${id}`;
  revalidatePath("/admin/users");
}

export async function resetPasswordAction(_prev: unknown, formData: FormData) {
  try {
    await guard();
    const id = String(formData.get("userId"));
    const password = String(formData.get("password") ?? "");
    if (password.length < 10) return { ok: false, message: "10+ characters" };
    await sql`update core.app_user set password_hash = ${hashPassword(password)} where id = ${id}`;
    return { ok: true, message: "Password reset — hand it over and have them change it" };
  } catch (err) {
    return { ok: false, message: String(err instanceof Error ? err.message : err) };
  }
}
