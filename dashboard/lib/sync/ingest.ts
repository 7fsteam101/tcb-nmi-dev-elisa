import { sql } from "../db";
import { normalizeEvent } from "./normalize";
import type { Provider } from "./providers";

// Landing zone: every payload is stored first (idempotent on
// connection+external_id+event_type), then normalized into business tables.
// A re-delivered webhook is a no-op.
export async function storeAndProcess(
  connectionId: string,
  provider: Provider,
  externalId: string,
  eventType: string,
  payload: unknown,
) {
  const inserted = await sql`
    insert into sync.raw_events (connection_id, provider, external_id, event_type, payload)
    values (${connectionId}, ${provider}, ${externalId}, ${eventType}, ${sql.json(payload as never)})
    on conflict (connection_id, external_id, event_type) do nothing
    returning id`;
  if (inserted.length === 0) return { duplicate: true };

  const rawId = inserted[0].id as string;
  try {
    const note = await normalizeEvent(provider, eventType, payload);
    await sql`
      update sync.raw_events set status = 'processed', processed_at = now(),
        payload = payload || ${sql.json({ _normalize_note: note ?? "ok" } as never)}
      where id = ${rawId}`;
    return { duplicate: false, note };
  } catch (err) {
    await sql`
      update sync.raw_events set status = 'failed',
        payload = payload || ${sql.json({ _error: String(err) } as never)}
      where id = ${rawId}`;
    throw err;
  }
}

/** Retry any failed/pending events (cron sweep). */
export async function processPending(limit = 50) {
  const rows = await sql`
    select id, provider, event_type, payload from sync.raw_events
    where status in ('pending', 'failed') order by received_at asc limit ${limit}`;
  let ok = 0, failed = 0;
  for (const r of rows) {
    try {
      await normalizeEvent(r.provider, r.event_type, r.payload);
      await sql`update sync.raw_events set status = 'processed', processed_at = now() where id = ${r.id}`;
      ok++;
    } catch (err) {
      await sql`
        update sync.raw_events set status = 'failed',
          payload = payload || ${sql.json({ _error: String(err) } as never)}
        where id = ${r.id}`;
      failed++;
    }
  }
  return { ok, failed };
}
