import { sql } from "./db";

// The forget-proofing counter: things an admin has not decided yet, plus
// sources that went silent. Everything still records regardless; the mapping
// items only affect counting, and staleness only affects freshness.
export type NeedsAttention = {
  newCalendars: number;      // never reviewed by an admin
  uncountedCalls: number;    // calls sitting on those calendars
  unmappedStages: number;    // Close labels awaiting a meaning
  newForms: number;          // forms nobody decided on (recording, not counting)
  staleSources: string[];    // e.g. "Close: quiet for 2.1 days"
};

const STALE_HOURS = 36;

export async function needsAttention(): Promise<NeedsAttention> {
  const [row] = await sql`
    select
      (select count(*) from sync.calendar_map where reviewed_at is null)::int as new_calendars,
      (select count(*) from sales.call c join sync.calendar_map cm on cm.id = c.calendar_map_id
        where cm.reviewed_at is null)::int as uncounted_calls,
      (select count(*) from sync.stage_map where mapped_stage is null and platform = 'close')::int as unmapped_stages,
      (select count(*) from sync.form_map where reviewed_at is null)::int as new_forms`;
  // staleness: a live-wired source whose last event is older than expected
  // (close/ghl/stripe are event-driven; nmi joins once Silent Post is on).
  const last = await sql`
    select provider, max(received_at) as last_at from sync.raw_events
    where provider in ('close', 'ghl', 'stripe') group by provider`;
  const staleSources: string[] = [];
  for (const r of last) {
    const hours = (Date.now() - new Date(r.last_at).getTime()) / 36e5;
    if (hours > STALE_HOURS) {
      const name = r.provider === "ghl" ? "GHL" : r.provider[0].toUpperCase() + r.provider.slice(1);
      staleSources.push(`${name}: quiet for ${(hours / 24).toFixed(1)} days`);
    }
  }
  return {
    newCalendars: Number(row.new_calendars),
    uncountedCalls: Number(row.uncounted_calls),
    unmappedStages: Number(row.unmapped_stages),
    newForms: Number(row.new_forms),
    staleSources,
  };
}
