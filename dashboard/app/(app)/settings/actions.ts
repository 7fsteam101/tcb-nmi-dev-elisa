"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireSession, hashPassword, verifyPassword } from "@/lib/auth";
import { setSetting } from "@/lib/settings";

export async function toggleDemoAction() {
  const user = await requireSession();
  if (user.role !== "admin") return;
  const rows = await sql`select value from core.app_setting where key = 'demo_mode'`;
  await setSetting("demo_mode", !(rows[0]?.value === true));
  revalidatePath("/", "layout");
}

export async function changePasswordAction(_prev: unknown, formData: FormData) {
  const user = await requireSession();
  const current = String(formData.get("current") ?? "");
  const next = String(formData.get("next") ?? "");
  if (next.length < 10) return { ok: false, message: "New password needs at least 10 characters" };
  const rows = await sql`select password_hash from core.app_user where id = ${user.id}`;
  if (!rows.length || !verifyPassword(current, rows[0].password_hash))
    return { ok: false, message: "Current password is wrong" };
  await sql`update core.app_user set password_hash = ${hashPassword(next)} where id = ${user.id}`;
  return { ok: true, message: "Password changed" };
}

export async function addUserAction(_prev: unknown, formData: FormData) {
  const user = await requireSession();
  if (user.role !== "admin") return { ok: false, message: "Only admins can add users" };
  const email = String(formData.get("email") ?? "").trim();
  const name = String(formData.get("name") ?? "").trim();
  const role = String(formData.get("role") ?? "closer");
  const password = String(formData.get("password") ?? "");
  if (!email || !name || password.length < 10)
    return { ok: false, message: "Email, name, and a 10+ character password required" };
  try {
    await sql`
      insert into core.app_user (email, full_name, password_hash, role)
      values (${email}, ${name}, ${hashPassword(password)}, ${role})`;
    revalidatePath("/settings");
    return { ok: true, message: `${name} can now sign in` };
  } catch (err) {
    return { ok: false, message: String(err).includes("duplicate") ? "That email already has a login" : String(err) };
  }
}
