import { sql } from "../lib/db";
import { getProviderToken } from "../lib/sync/providers";
import { findContact } from "../lib/sync/contacts";

// One-off reconcile after the first Close backfill:
// 1. Every Close lead id must resolve to a contact. Merged duplicates get a
//    POINTER row (close_id + merged_into_contact_id -> canonical) so future
//    webhooks about that lead land on the right person.
// 2. Stub contacts created during the opportunity pass (a merged lead's opp
//    arriving before the pointer existed) get merged into their canonical
//    person, and their opportunities repointed.
const CLOSE = "https://api.close.com/api/v1";

const main = async () => {
  const key = await getProviderToken("close");
  if (!key) throw new Error("no close key");
  const auth = { Authorization: "Basic " + Buffer.from(`${key}:`).toString("base64") };

  let skip = 0, pointers = 0, stubsMerged = 0, unresolved = 0;
  while (true) {
    const res = await fetch(`${CLOSE}/lead/?_skip=${skip}&_limit=100&_fields=id,display_name,contacts`, { headers: auth });
    const page = await res.json();
    for (const lead of page.data ?? []) {
      const existing = await sql`select id from core.contact where close_id = ${lead.id}`;
      if (existing.length) continue; // resolves directly (canonical or existing pointer)
      // find the canonical person by any of the lead's emails/phones
      let canonical: string | null = null;
      for (const c of lead.contacts ?? []) {
        for (const e of c.emails ?? []) { canonical ??= await findContact({ email: e.email }); }
        for (const p of c.phones ?? []) { canonical ??= await findContact({ phone: p.phone }); }
        if (canonical) break;
      }
      if (!canonical) { unresolved++; continue; }
      await sql`
        insert into core.contact (full_name, close_id, merged_into_contact_id, lifecycle_status)
        values (${lead.display_name ?? "Merged duplicate"}, ${lead.id}, ${canonical}, 'lead')`;
      pointers++;
    }
    skip += (page.data ?? []).length;
    if (!page.has_more) break;
  }

  // stubs from the opportunity pass: contact rows with a close_id but no email,
  // no phone, no identifiers — try to fold them into a canonical person by
  // pulling the lead's real emails/phones from Close
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
    let canonical: string | null = null;
    for (const c of lead.contacts ?? []) {
      for (const e of c.emails ?? []) { canonical ??= await findContact({ email: e.email }); }
      for (const p of c.phones ?? []) { canonical ??= await findContact({ phone: p.phone }); }
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
main().catch((e) => { console.error(e); process.exit(1); });
