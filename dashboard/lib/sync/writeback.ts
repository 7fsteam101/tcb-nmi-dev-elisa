import { sql } from "../db";
import { getProviderToken, getConnection } from "./providers";

// Two-way sync: dashboard/form edits push OUT to Close and GHL through this
// queue. Curated allow-list; anything not listed never dispatches.
const ALLOWED = new Set([
  "close_update_opportunity_stage", // payload: { stage_label }
  "close_create_note",              // payload: { lead_id, note }
  "ghl_create_contact_note",        // payload: { note } target = ghl contact id
]);

export async function queueWriteback(
  provider: "close" | "ghl",
  operation: string,
  targetExternalId: string,
  payload: Record<string, unknown>,
  origin = "dashboard",
) {
  if (!ALLOWED.has(operation)) throw new Error(`Write-back operation not on the allow-list: ${operation}`);
  const conn = await getConnection(provider);
  await sql`
    insert into sync.writeback_queue (connection_id, operation, target_external_id, payload, enabled, origin)
    values (${conn?.id ?? (await bootstrapConnection(provider))}, ${operation}, ${targetExternalId},
            ${sql.json(payload as never)}, true, ${origin})`;
}

async function bootstrapConnection(provider: string): Promise<string> {
  const rows = await sql`
    insert into sync.connections (provider, external_account_id, account_label, status)
    values (${provider}, ${"default"}, ${provider + " (pending credentials)"}, 'connected')
    on conflict (provider, external_account_id) do update set updated_at = now()
    returning id`;
  return rows[0].id;
}

// -- Close API ----------------------------------------------------------
const CLOSE = "https://api.close.com/api/v1";
const closeAuth = (key: string) => "Basic " + Buffer.from(`${key}:`).toString("base64");
let stageIdCache: Record<string, string> | null = null;
const slug = (s: string) => s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");

async function closeStageId(key: string, stageLabel: string): Promise<string> {
  if (!stageIdCache) {
    const res = await fetch(`${CLOSE}/status/opportunity/`, { headers: { Authorization: closeAuth(key) } });
    if (!res.ok) throw new Error(`Close status list failed: ${res.status}`);
    const body = await res.json();
    stageIdCache = {};
    // slug-matched so "won_pif" finds "Won PIF" however Close spells it
    for (const s of body.data ?? []) stageIdCache[slug(s.label)] = s.id;
  }
  // fallbacks: the new "Sales" pipeline (live 2026-07-07) carries the redesigned
  // stages directly, so these now only catch strays: a legacy internal
  // 'strategy_call_booked' maps to the new Self Booked, and if a new-pipeline
  // label is ever missing we fall back to the old-pipeline equivalents.
  const OUTBOUND_FALLBACKS: Record<string, string[]> = {
    strategy_call_booked: ["self_booked", "strategy_call_booked"],
    won_pif: ["closed_won"], won_pp: ["closed_won"], deposit: ["closed_won"],
    dq_on_call: ["not_a_fit"], intake_form_submitted: ["intake_submitted"],
    follow_up_call_booked: ["call_completed"], warm_list: ["call_completed"],
  };
  const want = slug(stageLabel);
  const id = stageIdCache[want] ?? (OUTBOUND_FALLBACKS[want] ?? []).map((f) => stageIdCache![f]).find(Boolean);
  if (!id) throw new Error(`Close has no opportunity status matching "${stageLabel}" (or a known fallback)`);
  return id;
}

async function dispatchClose(key: string, op: string, targetId: string, payload: any) {
  if (op === "close_update_opportunity_stage") {
    const statusId = await closeStageId(key, payload.stage_label);
    const res = await fetch(`${CLOSE}/opportunity/${targetId}/`, {
      method: "PUT",
      headers: { Authorization: closeAuth(key), "Content-Type": "application/json" },
      body: JSON.stringify({ status_id: statusId }),
    });
    if (!res.ok) throw new Error(`Close opportunity update failed: ${res.status} ${await res.text()}`);
  } else if (op === "close_create_note") {
    const res = await fetch(`${CLOSE}/activity/note/`, {
      method: "POST",
      headers: { Authorization: closeAuth(key), "Content-Type": "application/json" },
      body: JSON.stringify({ lead_id: payload.lead_id, note: payload.note }),
    });
    if (!res.ok) throw new Error(`Close note failed: ${res.status} ${await res.text()}`);
  } else throw new Error(`Unknown close op ${op}`);
}

// -- GHL API (needs the Marketplace app token) ---------------------------
async function dispatchGhl(token: string, op: string, targetId: string, payload: any) {
  if (op === "ghl_create_contact_note") {
    const res = await fetch(`https://services.leadconnectorhq.com/contacts/${targetId}/notes`, {
      method: "POST",
      headers: { Authorization: `Bearer ${token}`, Version: "2021-07-28", "Content-Type": "application/json" },
      body: JSON.stringify({ body: payload.note }),
    });
    if (!res.ok) throw new Error(`GHL note failed: ${res.status} ${await res.text()}`);
  } else throw new Error(`Unknown ghl op ${op}`);
}

/** Push pending write-backs out. Rows without credentials stay pending (not failed). */
export async function dispatchPending(limit = 25) {
  const rows = await sql`
    select q.id, q.operation, q.target_external_id, q.payload, q.attempts, c.provider
    from sync.writeback_queue q join sync.connections c on c.id = q.connection_id
    where q.status = 'pending' and q.enabled and q.attempts < 5
    order by q.created_at asc limit ${limit}`;
  let sent = 0, waiting = 0, failed = 0;
  for (const r of rows) {
    const token = await getProviderToken(r.provider);
    if (!token) { waiting++; continue; } // dormant until the key/OAuth lands
    try {
      if (r.provider === "close") await dispatchClose(token, r.operation, r.target_external_id, r.payload);
      else if (r.provider === "ghl") await dispatchGhl(token, r.operation, r.target_external_id, r.payload);
      await sql`update sync.writeback_queue set status = 'sent', sent_at = now(), attempts = attempts + 1 where id = ${r.id}`;
      sent++;
    } catch (err) {
      await sql`
        update sync.writeback_queue set attempts = attempts + 1, last_error = ${String(err)},
          status = case when attempts + 1 >= 5 then 'failed'::sync.writeback_status else 'pending'::sync.writeback_status end
        where id = ${r.id}`;
      failed++;
    }
  }
  return { sent, waiting, failed };
}
