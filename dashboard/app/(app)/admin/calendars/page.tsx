import { sql } from "@/lib/db";
import { CalendarEditor } from "./editor";

export const dynamic = "force-dynamic";

export default async function CalendarsAdmin() {
  const calendars = await sql`
    select id, location_id, calendar_id, calendar_name, call_type, is_booking
    from sync.calendar_map where active order by location_id, calendar_name nulls last`;
  return <CalendarEditor calendars={calendars as never} />;
}
