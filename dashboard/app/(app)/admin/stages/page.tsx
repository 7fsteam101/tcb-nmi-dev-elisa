import { sql } from "@/lib/db";
import { StageEditor } from "./editor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Admin -> Stages: the mapping from platform stage labels (Close) to our
// pipeline enum. Unmapped labels (auto-registered by the sync) surface on top;
// an admin assigns the meaning and reporting keeps working when the client
// invents new stages. Counts-only-when-mapped, same pattern as Calendars.
export default async function StagesAdmin() {
  const rows = await sql`
    select id, platform, external_label, mapped_stage, active, first_seen
    from sync.stage_map order by active asc, external_label`;
  const stageOptions = await sql`
    select enumlabel as value from pg_enum e join pg_type t on t.oid = e.enumtypid
    where t.typname = 'opportunity_stage' order by e.enumsortorder`;
  return <StageEditor rows={rows as never} stageOptions={(stageOptions as never as { value: string }[]).map((s) => s.value)} />;
}
