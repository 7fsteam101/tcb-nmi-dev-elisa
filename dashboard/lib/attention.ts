import { sql } from "./db";

// The forget-proofing counter: things an admin has not decided yet.
// Everything still records regardless; these only affect counting/mapping.
export type NeedsAttention = {
  newCalendars: number;      // never reviewed by an admin
  uncountedCalls: number;    // calls sitting on those calendars
  unmappedStages: number;    // Close labels awaiting a meaning
};

export async function needsAttention(): Promise<NeedsAttention> {
  const [row] = await sql`
    select
      (select count(*) from sync.calendar_map where reviewed_at is null)::int as new_calendars,
      (select count(*) from sales.call c join sync.calendar_map cm on cm.id = c.calendar_map_id
        where cm.reviewed_at is null)::int as uncounted_calls,
      (select count(*) from sync.stage_map where mapped_stage is null and platform = 'close')::int as unmapped_stages`;
  return {
    newCalendars: Number(row.new_calendars),
    uncountedCalls: Number(row.uncounted_calls),
    unmappedStages: Number(row.unmapped_stages),
  };
}
