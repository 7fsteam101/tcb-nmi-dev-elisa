import { sql } from "../lib/db";
import { getProviderToken } from "../lib/sync/providers";

// Enrichment pass over Close custom fields (runs on the existing read key):
//  1. contacts gain their GHL Marketing/Repair ids + Monday id (fill-if-empty,
//     never overwrite) -> GHL sync matches instantly on connect
//  2. the REAL rep roster from "Sendblue Lead Owner (+Email)" -> sales.rep,
//     and contact.owner_rep_id set
//  3. closed_won opportunities gain deal + fulfilment records (TCV from the
//     Close opportunity value, close date from date_won) -> revenue KPIs live
//  PII fields (IDIQ/MSIQ credentials, SSN) are intentionally NOT read.
const CLOSE = "https://api.close.com/api/v1";
const CF = {
  ghlMarketing: "cf_1nCiAzHjEeMcPgMQ0aKNCCTu70DJGy2QvTLdPmZJ1fs",
  ghlRepair: "cf_ZXycgPt0ctj1yqllCaIXkUY0bmWZrmCuGJOiQm5w67k",
  mondayLead: "cf_9ep3oWZi8SeqXyBsTNnlbQhXCRy2b55urWdCCChjVwc",
  sendblueOwner: "cf_RSdm8pY1gD7nDJS18Yy3iEl6qUSFAlD4D2NEP9yYLug",
  sendblueEmail: "cf_qZPwLJCk7T0nmXsv3aZnnljH6pVqVntTM1ejEwaXPfM",
};

const cfValue = (lead: any, id: string): string | null => {
  const v = lead.custom?.[id] ?? lead[`custom.${id}`] ?? null;
  const s = Array.isArray(v) ? v[0] : v;
  return s === null || s === undefined || String(s).trim() === "" ? null : String(s).trim();
};

const main = async () => {
  const key = await getProviderToken("close");
  if (!key) throw new Error("no close key");
  const auth = { Authorization: "Basic " + Buffer.from(`${key}:`).toString("base64") };
  const stats = { linkedGhlMkt: 0, linkedGhlRepair: 0, linkedMonday: 0, owners: 0, newReps: 0, deals: 0, zeroValueDeals: 0 };

  // --- pass 1: leads -> join keys + owners -------------------------------
  const fields = `id,display_name,custom.${CF.ghlMarketing},custom.${CF.ghlRepair},custom.${CF.mondayLead},custom.${CF.sendblueOwner},custom.${CF.sendblueEmail}`;
  const repByKey = new Map<string, string>(); // lower(name/email) -> rep id
  for (const r of await sql`select id, full_name, email from sales.rep`) {
    repByKey.set(r.full_name.toLowerCase(), r.id);
    if (r.email) repByKey.set(r.email.toLowerCase(), r.id);
  }

  let skip = 0;
  while (true) {
    const res = await fetch(`${CLOSE}/lead/?_skip=${skip}&_limit=100&_fields=${encodeURIComponent(fields)}`, { headers: auth });
    if (!res.ok) throw new Error(`lead page failed: ${res.status}`);
    const page = await res.json();
    for (const lead of page.data ?? []) {
      const ghlMkt = cfValue(lead, CF.ghlMarketing);
      const ghlRep = cfValue(lead, CF.ghlRepair);
      const monday = cfValue(lead, CF.mondayLead);
      const ownerName = cfValue(lead, CF.sendblueOwner);
      const ownerEmail = cfValue(lead, CF.sendblueEmail);

      // resolve the canonical contact (pointer-aware)
      const rows = await sql`
        select coalesce(c2.id, c1.id) as id
        from core.contact c1 left join core.contact c2 on c2.id = c1.merged_into_contact_id
        where c1.close_id = ${lead.id} limit 1`;
      if (!rows.length) continue;
      const contactId = rows[0].id;

      if (ghlMkt || ghlRep || monday) {
        const [before] = await sql`select ghl_marketing_id, ghl_repair_id, monday_lead_id from core.contact where id = ${contactId}`;
        await sql`
          update core.contact set
            ghl_marketing_id = coalesce(ghl_marketing_id, ${ghlMkt}),
            ghl_repair_id = coalesce(ghl_repair_id, ${ghlRep}),
            monday_lead_id = coalesce(monday_lead_id, ${monday})
          where id = ${contactId}`;
        if (ghlMkt && !before.ghl_marketing_id) stats.linkedGhlMkt++;
        if (ghlRep && !before.ghl_repair_id) stats.linkedGhlRepair++;
        if (monday && !before.monday_lead_id) stats.linkedMonday++;
      }

      if (ownerName || ownerEmail) {
        let repId = repByKey.get((ownerEmail ?? "").toLowerCase()) ?? repByKey.get((ownerName ?? "").toLowerCase());
        if (!repId) {
          const [rep] = await sql`
            insert into sales.rep (full_name, email, role, sendblue_owner, sendblue_owner_email, active)
            values (${ownerName ?? ownerEmail}, ${ownerEmail}, 'closer', ${ownerName}, ${ownerEmail}, true)
            returning id`;
          repId = rep.id;
          if (ownerName) repByKey.set(ownerName.toLowerCase(), repId!);
          if (ownerEmail) repByKey.set(ownerEmail.toLowerCase(), repId!);
          stats.newReps++;
        }
        await sql`update core.contact set owner_rep_id = coalesce(owner_rep_id, ${repId ?? null}) where id = ${contactId}`;
        stats.owners++;
      }
    }
    skip += (page.data ?? []).length;
    if (!page.has_more) break;
  }

  // --- pass 2: won opportunities -> deal + fulfilment --------------------
  // RULE (Katie 2026-07-02): deals are born from the Sales Call Report, never
  // from Close. This pass was the one-time historical bootstrap; it now runs
  // only with CREATE_DEALS=1 set explicitly.
  if (process.env.CREATE_DEALS !== "1") {
    console.log(JSON.stringify({ ...stats, note: "deal creation skipped — deals come from the Sales Call Report (set CREATE_DEALS=1 only for a deliberate historical bootstrap)" }));
    process.exit(0);
  }
  let oskip = 0;
  const [offer] = await sql`select id from marketing.offer where type = 'core'`;
  while (true) {
    const res = await fetch(
      `${CLOSE}/opportunity/?_skip=${oskip}&_limit=100&_fields=id,lead_id,status_label,status_type,value,date_won,date_created,user_name`,
      { headers: auth });
    if (!res.ok) throw new Error(`opp page failed: ${res.status}`);
    const page = await res.json();
    for (const opp of page.data ?? []) {
      if (opp.status_type !== "won" || String(opp.status_label).toLowerCase().includes("partner")) continue;
      const [o] = await sql`select id, contact_id from sales.opportunity where close_id = ${opp.id}`;
      if (!o) continue;
      const existing = await sql`select 1 from sales.deal where opportunity_id = ${o.id}`;
      if (existing.length) continue;
      const tcv = Number(opp.value ?? 0);
      if (tcv === 0) stats.zeroValueDeals++;
      const closerRepId = repByKey.get(String(opp.user_name ?? "").toLowerCase()) ?? null;
      const closeDate = (opp.date_won ?? opp.date_created ?? new Date().toISOString()).slice(0, 10);
      const [deal] = await sql`
        insert into sales.deal (opportunity_id, contact_id, closer_rep_id, offer_id, total_contract_value_minor, deal_close_date, status)
        values (${o.id}, ${o.contact_id}, ${closerRepId}, ${offer.id}, ${tcv}, ${closeDate}, 'active')
        returning id`;
      await sql`
        insert into delivery.fulfilment (deal_id, contact_id, program_start, program_end, onboarding_complete, status)
        values (${deal.id}, ${o.contact_id}, ${closeDate}, ${closeDate}::date + interval '6 months', false, 'active')`;
      await sql`update core.contact set lifecycle_status = 'customer' where id = ${o.contact_id} and lifecycle_status = 'lead'`;
      stats.deals++;
    }
    oskip += (page.data ?? []).length;
    if (!page.has_more) break;
  }

  console.log(JSON.stringify(stats));
  process.exit(0);
};
main().catch((e) => { console.error(e); process.exit(1); });
