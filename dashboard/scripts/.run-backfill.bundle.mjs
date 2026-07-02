// lib/db.ts
import postgres from "postgres";
var globalForDb = globalThis;
var sql = globalForDb.sql ?? postgres(process.env.DATABASE_URL, {
  ssl: "require",
  prepare: false,
  // required in transaction-pooling mode
  max: 4,
  idle_timeout: 20,
  connect_timeout: 15
});
if (process.env.NODE_ENV !== "production") globalForDb.sql = sql;

// lib/sync/providers.ts
var ENV_FALLBACK = {
  close: process.env.CLOSE_API_KEY,
  meta: process.env.META_ACCESS_TOKEN
};
async function getConnection(provider, externalAccountId) {
  const rows = externalAccountId ? await sql`select * from sync.connections where provider = ${provider} and external_account_id = ${externalAccountId} limit 1` : await sql`select * from sync.connections where provider = ${provider} and status = 'connected' order by created_at limit 1`;
  return rows[0] ?? null;
}
async function getProviderToken(provider, externalAccountId) {
  const conn = await getConnection(provider, externalAccountId);
  if (conn?.token_secret_ref) {
    const rows = await sql`
      select decrypted_secret from vault.decrypted_secrets where id = ${conn.token_secret_ref}`;
    if (rows.length) return rows[0].decrypted_secret;
  }
  return ENV_FALLBACK[provider] ?? null;
}
async function markSynced(connectionId, error) {
  await sql`
    update sync.connections
    set last_synced_at = case when ${error ?? null}::text is null then now() else last_synced_at end,
        last_error = ${error ?? null},
        status = case when ${error ?? null}::text is null then 'connected'::sync.connection_status else 'error'::sync.connection_status end
    where id = ${connectionId}`;
}
async function ensureConnection(provider, externalAccountId, label) {
  const rows = await sql`
    insert into sync.connections (provider, external_account_id, account_label, status)
    values (${provider}, ${externalAccountId}, ${label}, 'connected')
    on conflict (provider, external_account_id) do update set updated_at = now()
    returning id`;
  return rows[0].id;
}

// lib/sync/contacts.ts
async function findContact(c) {
  const rows = await sql`
    select ct.id from core.contact ct
    where (${c.closeId ?? null}::text is not null and ct.close_id = ${c.closeId ?? null})
       or (${c.ghlMarketingId ?? null}::text is not null and ct.ghl_marketing_id = ${c.ghlMarketingId ?? null})
       or (${c.email ?? null}::text is not null and lower(ct.primary_email) = lower(${c.email ?? ""}))
       or (${c.phone ?? null}::text is not null and ct.primary_phone = ${c.phone ?? ""})
       or exists (
         select 1 from core.contact_identifier ci where ci.contact_id = ct.id and (
           (ci.type = 'email' and ${c.email ?? null}::text is not null and lower(ci.value) = lower(${c.email ?? ""})) or
           (ci.type = 'phone' and ${c.phone ?? null}::text is not null and ci.value = ${c.phone ?? ""})))
    limit 1`;
  return rows[0]?.id ?? null;
}
async function upsertContact(c) {
  const existing = await findContact(c);
  if (existing) {
    await sql`
      update core.contact set
        close_id = coalesce(close_id, ${c.closeId ?? null}),
        ghl_marketing_id = coalesce(ghl_marketing_id, ${c.ghlMarketingId ?? null}),
        ghl_repair_id = coalesce(ghl_repair_id, ${c.ghlRepairId ?? null}),
        full_name = coalesce(full_name, ${c.fullName ?? null})
      where id = ${existing}`;
    if (c.email) {
      await sql`
        insert into core.contact_identifier (contact_id, type, value, is_primary)
        select ${existing}, 'email', ${c.email}, false
        where not exists (
          select 1 from core.contact_identifier where contact_id = ${existing} and type = 'email' and lower(value) = lower(${c.email}))
        and not exists (select 1 from core.contact where id = ${existing} and lower(primary_email) = lower(${c.email}))`;
    }
    if (c.phone) {
      await sql`
        insert into core.contact_identifier (contact_id, type, value, is_primary)
        select ${existing}, 'phone', ${c.phone}, false
        where not exists (
          select 1 from core.contact_identifier where contact_id = ${existing} and type = 'phone' and value = ${c.phone})
        and not exists (select 1 from core.contact where id = ${existing} and primary_phone = ${c.phone})`;
    }
    return { id: existing, created: false };
  }
  const rows = await sql`
    insert into core.contact (full_name, first_name, last_name, primary_email, primary_phone,
                              lifecycle_status, close_id, ghl_marketing_id, ghl_repair_id)
    values (${c.fullName ?? [c.firstName, c.lastName].filter(Boolean).join(" ") ?? "Unknown"},
            ${c.firstName ?? null}, ${c.lastName ?? null}, ${c.email ?? null}, ${c.phone ?? null},
            'lead', ${c.closeId ?? null}, ${c.ghlMarketingId ?? null}, ${c.ghlRepairId ?? null})
    returning id`;
  return { id: rows[0].id, created: true };
}
var WON_STAGES = ["deposit", "won_pif", "won_pp", "closed_won", "active_partner"];
var CLOSED_STAGES = [...WON_STAGES, "lost", "dq_on_call", "call_canceled_by_team", "not_a_fit"];

// lib/sync/normalize.ts
var slug = (s) => s.toLowerCase().replace(/['’]/g, "").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
var STAGE_ALIASES = {
  // the redesigned 18-stage pipeline (spec)
  lead_opt_in: "lead_opt_in",
  strategy_call_booked: "strategy_call_booked",
  intake_form_submitted: "intake_form_submitted",
  audit_complete: "audit_complete",
  intake_form_needed: "intake_form_needed",
  call_confirmed: "call_confirmed",
  no_show: "no_show",
  call_canceled_by_lead: "call_canceled_by_lead",
  call_cancelled_by_lead: "call_canceled_by_lead",
  call_canceled_by_team: "call_canceled_by_team",
  call_cancelled_by_team: "call_canceled_by_team",
  follow_up_call_booked: "follow_up_call_booked",
  warm_list: "warm_list",
  contract_sent: "contract_sent",
  contract_signed: "contract_signed",
  deposit: "deposit",
  won_pif: "won_pif",
  won_pp: "won_pp",
  lost: "lost",
  dq_on_call: "dq_on_call",
  dqd_on_call: "dq_on_call",
  // the LIVE pipeline in their Close org today (incl. the partner track)
  eligibility_call_booked: "eligibility_call_booked",
  intake_submitted: "intake_form_submitted",
  call_completed: "call_completed",
  closing: "closing",
  closed_won: "closed_won",
  interested_partner: "interested_partner",
  active_partner: "active_partner",
  not_a_fit: "not_a_fit"
};
var mapCloseStage = (label) => STAGE_ALIASES[slug(label)] ?? null;
var WON = ["deposit", "won_pif", "won_pp", "closed_won", "active_partner"];
var TERMINAL = [...WON, "lost", "dq_on_call", "call_canceled_by_team", "not_a_fit"];

// lib/sync/backfill.ts
var CLOSE = "https://api.close.com/api/v1";
async function closeGet(key, path) {
  const res = await fetch(`${CLOSE}${path}`, {
    headers: { Authorization: "Basic " + Buffer.from(`${key}:`).toString("base64") }
  });
  if (!res.ok) throw new Error(`Close GET ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}
async function runCloseBackfill(budgetMs = 45e3) {
  const key = await getProviderToken("close");
  if (!key) return { ok: false, message: "No Close API key connected yet" };
  const connectionId = await ensureConnection("close", "default", "Close");
  const started = Date.now();
  const [conn] = await sql`select sync_cursor from sync.connections where id = ${connectionId}`;
  const cursor = conn?.sync_cursor ?? {};
  let leadSkip = Number(cursor.backfill_lead_skip ?? 0);
  let oppSkip = Number(cursor.backfill_opp_skip ?? 0);
  let leadsDone = Boolean(cursor.backfill_leads_done);
  let leads = 0, opps = 0, unmappedStages = [];
  const [run] = await sql`
    insert into sync.sync_runs (connection_id, run_type, status) values (${connectionId}, 'backfill', 'running') returning id`;
  try {
    while (!leadsDone && Date.now() - started < budgetMs) {
      const page = await closeGet(key, `/lead/?_skip=${leadSkip}&_limit=100&_fields=id,display_name,contacts,date_created`);
      for (const lead of page.data ?? []) {
        const primary = lead.contacts?.[0];
        const { id: contactId } = await upsertContact({
          closeId: lead.id,
          fullName: lead.display_name,
          email: primary?.emails?.[0]?.email,
          phone: primary?.phones?.[0]?.phone
        });
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
    let oppsDone = false;
    while (leadsDone && Date.now() - started < budgetMs) {
      const page = await closeGet(key, `/opportunity/?_skip=${oppSkip}&_limit=100&_fields=id,lead_id,lead_name,status_label,value,date_created,date_won`);
      for (const opp of page.data ?? []) {
        const stage = opp.status_label ? mapCloseStage(opp.status_label) : null;
        if (opp.status_label && !stage) {
          if (!unmappedStages.includes(opp.status_label)) unmappedStages.push(opp.status_label);
          continue;
        }
        const { id: contactId } = await upsertContact({ closeId: opp.lead_id, fullName: opp.lead_name });
        const terminal = ["deposit", "won_pif", "won_pp", "lost", "dq_on_call", "call_canceled_by_team"].includes(stage ?? "");
        await sql`
          insert into sales.opportunity (contact_id, stage, opened_at, close_id, cohort_month, closed_at)
          values (${contactId}, ${stage ?? "lead_opt_in"}, coalesce(${opp.date_created ?? null}, now()), ${opp.id},
                  date_trunc('month', coalesce(${opp.date_created ?? null}::timestamptz, now()))::date,
                  ${terminal ? opp.date_won ?? opp.date_created ?? (/* @__PURE__ */ new Date()).toISOString() : null})
          on conflict (close_id) where close_id is not null
          do update set stage = excluded.stage, closed_at = excluded.closed_at`;
        opps++;
      }
      oppSkip += (page.data ?? []).length;
      if (!page.has_more) {
        oppsDone = true;
        break;
      }
      await saveCursor(connectionId, { backfill_lead_skip: leadSkip, backfill_leads_done: leadsDone, backfill_opp_skip: oppSkip });
    }
    const finished = leadsDone && oppsDone;
    if (finished) await saveCursor(connectionId, { backfill_lead_skip: 0, backfill_leads_done: false, backfill_opp_skip: 0 });
    await sql`
      update sync.sync_runs set status = ${finished ? "success" : "partial"}, finished_at = now(),
        rows_in = ${leads + opps}, rows_normalized = ${leads + opps},
        details = ${sql.json({ leads, opps, finished, unmappedStages })}
      where id = ${run.id}`;
    await markSynced(connectionId);
    return {
      ok: true,
      message: finished ? `Backfill complete: ${leads} leads, ${opps} opportunities this pass.${unmappedStages.length ? ` Unmapped stages skipped: ${unmappedStages.join(", ")}` : ""}` : `Backfill in progress: +${leads} leads, +${opps} opportunities. Click again to continue.`,
      finished
    };
  } catch (err) {
    await sql`update sync.sync_runs set status = 'error', finished_at = now(), error = ${String(err)} where id = ${run.id}`;
    await markSynced(connectionId, String(err));
    return { ok: false, message: String(err instanceof Error ? err.message : err) };
  }
}
async function saveCursor(connectionId, cursor) {
  await sql`update sync.connections set sync_cursor = sync_cursor || ${sql.json(cursor)} where id = ${connectionId}`;
}

// scripts/run-backfill.ts
var main = async () => {
  let pass = 1;
  while (true) {
    const r = await runCloseBackfill(12e4);
    console.log(`pass ${pass}: ${r.message}`);
    if (!r.ok || r.finished) break;
    pass++;
  }
  process.exit(0);
};
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
