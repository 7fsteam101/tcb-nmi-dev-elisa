import { sql } from "@/lib/db";
import { CalendarEditor } from "./editor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function CalendarsAdmin() {
  // ALL calendars, tracked first: the admin decides tracking here, so untracked
  // ones must be visible (POLICY 2026-07-09: tracking follows this mapping).
  const calendars = await sql`
    select cm.id, coalesce(nullif(c.account_label, ''), cm.location_id) as location_id,
           cm.calendar_id, cm.calendar_name, cm.call_type, cm.is_booking, cm.active
    from sync.calendar_map cm
    left join sync.connections c on c.provider = 'ghl' and c.external_account_id = cm.location_id
    order by cm.active desc, location_id, cm.calendar_name nulls last`;
  return <CalendarEditor calendars={calendars as never} />;
}
