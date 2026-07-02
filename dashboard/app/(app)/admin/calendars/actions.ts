"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";

async function guard() {
  const user = await requireSession();
  if (user.role !== "admin") throw new Error("Admins only");
}

export async function setCalendarTypeAction(id: string, callType: string) {
  await guard();
  await sql`update sync.calendar_map set call_type = ${callType} where id = ${id}`;
  revalidatePath("/admin/calendars");
}

export async function toggleCalendarBookingAction(id: string) {
  await guard();
  await sql`update sync.calendar_map set is_booking = not is_booking where id = ${id}`;
  revalidatePath("/admin/calendars");
}

export async function renameCalendarAction(id: string, name: string) {
  await guard();
  await sql`update sync.calendar_map set calendar_name = ${name.trim() || null} where id = ${id}`;
  revalidatePath("/admin/calendars");
}

export async function addCalendarAction(_prev: unknown, formData: FormData) {
  try {
    await guard();
    const locationId = String(formData.get("locationId") ?? "").trim();
    const calendarId = String(formData.get("calendarId") ?? "").trim();
    const name = String(formData.get("name") ?? "").trim() || null;
    const callType = String(formData.get("callType") ?? "strategy");
    if (!locationId || !calendarId) return { ok: false, message: "Location id and calendar id required" };
    await sql`
      insert into sync.calendar_map (location_id, calendar_id, calendar_name, call_type)
      values (${locationId}, ${calendarId}, ${name}, ${callType})
      on conflict (location_id, calendar_id) do update set calendar_name = excluded.calendar_name, call_type = excluded.call_type`;
    revalidatePath("/admin/calendars");
    return { ok: true, message: "Calendar mapped" };
  } catch (err) {
    return { ok: false, message: String(err instanceof Error ? err.message : err) };
  }
}
