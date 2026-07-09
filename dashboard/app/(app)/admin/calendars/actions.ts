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

// Paid attribute: whether this calendar takes the booking fee. Syncs the
// attribute onto the calendar's historical calls (display-only field).
export async function toggleCalendarBookingAction(id: string) {
  await guard();
  const [row] = await sql`update sync.calendar_map set is_booking = not is_booking where id = ${id} returning is_booking, active`;
  if (row?.active) await sql`update sales.call set is_paid_booking = ${row.is_booking} where calendar_map_id = ${id}`;
  revalidatePath("/admin/calendars");
}

// Tracked: the admin decision that makes a calendar's calls count in the funnel
// (POLICY 2026-07-09: tracking follows the mapping; paid/free never filters).
// Re-flags the calendar's historical calls so past data follows the decision.
export async function toggleCalendarActiveAction(id: string) {
  await guard();
  const [row] = await sql`update sync.calendar_map set active = not active where id = ${id} returning active, is_booking`;
  await sql`update sales.call set is_booking = ${row.active},
    is_paid_booking = ${row.active ? row.is_booking : null}
    where calendar_map_id = ${id}`;
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
