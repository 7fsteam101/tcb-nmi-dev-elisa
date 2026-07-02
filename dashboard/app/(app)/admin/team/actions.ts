"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";

async function guard() {
  const user = await requireSession();
  if (user.role !== "admin") throw new Error("Admins only");
}

export async function addRepAction(_prev: unknown, formData: FormData) {
  try {
    await guard();
    const name = String(formData.get("name") ?? "").trim();
    const email = String(formData.get("email") ?? "").trim() || null;
    const role = String(formData.get("role") ?? "closer");
    if (!name) return { ok: false, message: "Name required" };
    await sql`insert into sales.rep (full_name, email, role) values (${name}, ${email}, ${role})`;
    revalidatePath("/admin/team");
    return { ok: true, message: `${name} added — available on the forms now` };
  } catch (err) {
    return { ok: false, message: String(err instanceof Error ? err.message : err) };
  }
}

export async function toggleRepAction(id: string) {
  await guard();
  await sql`update sales.rep set active = not active where id = ${id}`;
  revalidatePath("/admin/team");
}

export async function setRepRoleAction(id: string, role: string) {
  await guard();
  await sql`update sales.rep set role = ${role} where id = ${id}`;
  revalidatePath("/admin/team");
}
