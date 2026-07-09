import { sql } from "../db";
import { getProviderToken, ensureConnection, markSynced } from "./providers";
import { upsertContact } from "./contacts";
import { mapCloseStage } from "./normalize";

// Close backfill: page through ALL historical leads and opportunities and land
// them through the same matching rules as the live sync. Safe to re-run —
// everything upserts by close_id. Runs in batches so it fits serverless time
// limits; each call processes up to `budgetMs` and reports where it stopped.
const CLOSE = "https://api.close.com/api/v1";

async function closeGet(key: string, path: string) {
  const res = await fetch(`${CLOSE}${path}`, {
    headers: { Authorization: "Basic " + Buffer.from(`${key}:`).toString("base64") },
  });
  if (!res.ok) throw new Error(`Close GET ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

export async function runCloseBackfill(budgetMs = 45_000) {
  const key = await getProviderToken("close");
  if (!key) return { ok: false, message: "No Close API key connected yet" };
  const connectionId = await ensureConnection("close", "default", "Close");
  const started = Date.now();

  // resume cursor lives on the connection
  const [conn] = await sql`select sync_cursor from sync.connections where id = ${connectionId}`;
  const cursor = (conn?.sync_cursor as any) ?? {};
  let leadSkip = Number(cursor.backfill_lead_skip ?? 0);
  let oppSkip = Number(cursor.backfill_opp_skip ?? 0);
  let leadsDone = Boolean(cursor.backfill_leads_done);
  let leads = 0, opps = 0, unmappedStages: string[] = [];

  const [run] = await sql`
    insert into sync.sync_runs (connection_id, run_type, status) values (${connectionId}, 'backfill', 'running') returning id`;

  try {
    // -- 1) leads → contacts (with all emails/phones as identifiers)
    while (!leadsDone && Date.now() - started < budgetMs) {
      const page = await closeGet(key, `/lead/?_skip=${leadSkip}&_limit=100&_fields=id,display_name,contacts,date_created`);
      for (const lead of page.data ?? []) {
        const primary = lead.contacts?.[0];
        const { id: contactId } = await upsertContact({
          closeId: lead.id,
          fullName: lead.display_name,
          email: primary?.emails?.[0]?.email,
          phone: primary?.phones?.[0]?.phone,
          createdSource: "close_import",
        });
        // every extra email/phone on every Close contact becomes an identifier (append-only)
        for (const c of lead.contacts ?? []) {
          for (const e of c.emails ?? []) {
            await sql`
              insert into core.contact_identifier (contact_id, type, value, is_primary)
              select ${contactId}, 'email', ${e.email}, false
              where not exists (select 1 from core.contact_identifier where contact_id = ${contactId} and type = 'email' and lower(value) = lower(${e.email}))
                and not exists (select 1 from core.contact where id = ${contactId} and lower(primary_email) = lower(${e.email}))`;
          }
          for (const p of c.phones ?? []) {
            await sql`
              insert into core.contact_identifier (contact_id, type, value, is_primary)
              select ${contactId}, 'phone', ${p.phone}, false
              where not exists (select 1 from core.contact_identifier where contact_id = ${contactId} and type = 'phone' and value = ${p.phone})
                and not exists (select 1 from core.contact where id = ${contactId} and primary_phone = ${p.phone})`;
          }
        }
        leads++;
      }
      leadSkip += (page.data ?? []).length;
      if (!page.has_more) leadsDone = true;
      await saveCursor(connectionId, { backfill_lead_skip: leadSkip, backfill_leads_done: leadsDone, backfill_opp_skip: oppSkip });
    }

    // -- 2) opportunities → mirror by close_id (faithful, any stage)
    let oppsDone = false;
    while (leadsDone && Date.now() - started < budgetMs) {
      const page = await closeGet(key, `/opportunity/?_skip=${oppSkip}&_limit=100&_fields=id,lead_id,lead_name,status_label,value,date_created,date_won`);
      for (const opp of page.data ?? []) {
        const stage = opp.status_label ? await mapCloseStage(opp.status_label) : null;
        if (opp.status_label && !stage) {
          if (!unmappedStages.includes(opp.status_label)) unmappedStages.push(opp.status_label);
          continue;
        }
        const { id: contactId } = await upsertContact({ closeId: opp.lead_id, fullName: opp.lead_name, createdSource: "close_import" });
        // same TERMINAL set the live sync uses (normalize.ts) so import + live agree on closed_at
        const terminal = ["deposit", "won_pif", "won_pp", "closed_won", "active_partner", "lost", "dq_on_call", "call_canceled_by_team", "not_a_fit"].includes(stage ?? "");
        await sql`
          insert into sales.opportunity (contact_id, stage, opened_at, close_id, cohort_month, closed_at)
          values (${contactId}, ${stage ?? "lead_opt_in"}, coalesce(${opp.date_created ?? null}, now()), ${opp.id},
                  date_trunc('month', coalesce(${opp.date_created ?? null}::timestamptz, now()))::date,
                  ${terminal ? opp.date_won ?? opp.date_created ?? new Date().toISOString() : null})
          on conflict (close_id) where close_id is not null
          do update set stage = excluded.stage, closed_at = excluded.closed_at`;
        opps++;
      }
      oppSkip += (page.data ?? []).length;
      if (!page.has_more) { oppsDone = true; break; }
      await saveCursor(connectionId, { backfill_lead_skip: leadSkip, backfill_leads_done: leadsDone, backfill_opp_skip: oppSkip });
    }

    const finished = leadsDone && oppsDone;
    if (finished) await saveCursor(connectionId, { backfill_lead_skip: 0, backfill_leads_done: false, backfill_opp_skip: 0 });
    await sql`
      update sync.sync_runs set status = ${finished ? "success" : "partial"}, finished_at = now(),
        rows_in = ${leads + opps}, rows_normalized = ${leads + opps},
        details = ${sql.json({ leads, opps, finished, unmappedStages } as never)}
      where id = ${run.id}`;
    await markSynced(connectionId);
    return {
      ok: true,
      message: finished
        ? `Backfill complete: ${leads} leads, ${opps} opportunities this pass.${unmappedStages.length ? ` Unmapped stages skipped: ${unmappedStages.join(", ")}` : ""}`
        : `Backfill in progress: +${leads} leads, +${opps} opportunities. Click again to continue.`,
      finished,
    };
  } catch (err) {
    await sql`update sync.sync_runs set status = 'error', finished_at = now(), error = ${String(err)} where id = ${run.id}`;
    await markSynced(connectionId, String(err));
    return { ok: false, message: String(err instanceof Error ? err.message : err) };
  }
}

async function saveCursor(connectionId: string, cursor: Record<string, unknown>) {
  await sql`update sync.connections set sync_cursor = sync_cursor || ${sql.json(cursor as never)} where id = ${connectionId}`;
}
