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

// lib/sync/contacts.ts
async function findContact(c) {
  const rows = await sql`
    select ct.id, ct.merged_into_contact_id from core.contact ct
    where (${c.closeId ?? null}::text is not null and ct.close_id = ${c.closeId ?? null})
       or (${c.ghlMarketingId ?? null}::text is not null and ct.ghl_marketing_id = ${c.ghlMarketingId ?? null})
       or (${c.email ?? null}::text is not null and lower(ct.primary_email) = lower(${c.email ?? ""}))
       or (${c.phone ?? null}::text is not null and ct.primary_phone = ${c.phone ?? ""})
       or exists (
         select 1 from core.contact_identifier ci where ci.contact_id = ct.id and (
           (ci.type = 'email' and ${c.email ?? null}::text is not null and lower(ci.value) = lower(${c.email ?? ""})) or
           (ci.type = 'phone' and ${c.phone ?? null}::text is not null and ci.value = ${c.phone ?? ""})))
    limit 1`;
  if (!rows.length) return null;
  let id = rows[0].id, merged = rows[0].merged_into_contact_id, hops = 0;
  while (merged && hops < 3) {
    const next = await sql`select id, merged_into_contact_id from core.contact where id = ${merged}`;
    if (!next.length) break;
    id = next[0].id;
    merged = next[0].merged_into_contact_id;
    hops++;
  }
  return id;
}
var WON_STAGES = ["deposit", "won_pif", "won_pp", "closed_won", "active_partner"];
var CLOSED_STAGES = [...WON_STAGES, "lost", "dq_on_call", "call_canceled_by_team", "not_a_fit"];

// scripts/reconcile-merged.ts
var CLOSE = "https://api.close.com/api/v1";
var main = async () => {
  const key = await getProviderToken("close");
  if (!key) throw new Error("no close key");
  const auth = { Authorization: "Basic " + Buffer.from(`${key}:`).toString("base64") };
  let skip = 0, pointers = 0, stubsMerged = 0, unresolved = 0;
  while (true) {
    const res = await fetch(`${CLOSE}/lead/?_skip=${skip}&_limit=100&_fields=id,display_name,contacts`, { headers: auth });
    const page = await res.json();
    for (const lead of page.data ?? []) {
      const existing = await sql`select id from core.contact where close_id = ${lead.id}`;
      if (existing.length) continue;
      let canonical = null;
      for (const c of lead.contacts ?? []) {
        for (const e of c.emails ?? []) {
          canonical ??= await findContact({ email: e.email });
        }
        for (const p of c.phones ?? []) {
          canonical ??= await findContact({ phone: p.phone });
        }
        if (canonical) break;
      }
      if (!canonical) {
        unresolved++;
        continue;
      }
      await sql`
        insert into core.contact (full_name, close_id, merged_into_contact_id, lifecycle_status)
        values (${lead.display_name ?? "Merged duplicate"}, ${lead.id}, ${canonical}, 'lead')`;
      pointers++;
    }
    skip += (page.data ?? []).length;
    if (!page.has_more) break;
  }
  const stubs = await sql`
    select ct.id, ct.close_id from core.contact ct
    where ct.close_id is not null and ct.primary_email is null and ct.primary_phone is null
      and ct.merged_into_contact_id is null and not ct.is_demo
      and not exists (select 1 from core.contact_identifier ci where ci.contact_id = ct.id)
      and exists (select 1 from sales.opportunity o where o.contact_id = ct.id)`;
  for (const stub of stubs) {
    const res = await fetch(`${CLOSE}/lead/${stub.close_id}/?_fields=id,display_name,contacts`, { headers: auth });
    if (!res.ok) continue;
    const lead = await res.json();
    let canonical = null;
    for (const c of lead.contacts ?? []) {
      for (const e of c.emails ?? []) {
        canonical ??= await findContact({ email: e.email });
      }
      for (const p of c.phones ?? []) {
        canonical ??= await findContact({ phone: p.phone });
      }
      if (canonical) break;
    }
    if (!canonical || canonical === stub.id) continue;
    await sql`update sales.opportunity set contact_id = ${canonical} where contact_id = ${stub.id}`;
    await sql`update core.contact set merged_into_contact_id = ${canonical} where id = ${stub.id}`;
    stubsMerged++;
  }
  console.log(`pointer rows created: ${pointers}, stubs merged: ${stubsMerged}, unresolved: ${unresolved}`);
  process.exit(0);
};
main().catch((e) => {
  console.error(e);
  process.exit(1);
});
