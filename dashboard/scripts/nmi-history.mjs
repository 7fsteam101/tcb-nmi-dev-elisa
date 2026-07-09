// One-time NMI full-history import (2023-01-01 -> now), idempotent on
// nmi_transaction_id. Plain JS twin of lib/sync/nmi-pull.ts for local runs
// (tsx is broken on Node 25). Windows of ~6 months.
import postgres from "postgres";
const sql = postgres(process.env.DATABASE_URL, { ssl: "require", prepare: false, fetch_types: false, max: 2, onnotice: () => {} });
const [c] = await sql`select token_secret_ref from sync.connections where provider='nmi' and token_secret_ref is not null limit 1`;
const [k] = await sql`select decrypted_secret as v from vault.decrypted_secrets where id=${c.token_secret_ref}`;
const KEY = k.v;
const extract = (b, t) => { const m = b.match(new RegExp(`<${t}>([^<]*)</${t}>`)); return m && m[1] !== "" ? m[1] : null; };
const nmiDate = (s) => { if (!s || s.length < 8) return null;
  const iso = `${s.slice(0,4)}-${s.slice(4,6)}-${s.slice(6,8)}T${s.slice(8,10)||"12"}:${s.slice(10,12)||"00"}:${s.slice(12,14)||"00"}-04:00`;
  const d = new Date(iso); return isNaN(d.getTime()) ? null : d.toISOString(); };
async function findContact(email, phone) {
  if (email) {
    const r = await sql`select ct.id from core.contact ct where ct.merged_into_contact_id is null and (lower(ct.primary_email)=lower(${email}) or exists (select 1 from core.contact_identifier ci where ci.contact_id=ct.id and ci.type='email' and lower(ci.value)=lower(${email}))) limit 1`;
    if (r.length) return r[0].id;
  }
  if (phone) {
    const p = String(phone).replace(/[^0-9]/g, "").slice(-10);
    if (p.length === 10) {
      const r = await sql`select ct.id from core.contact ct where ct.merged_into_contact_id is null and (regexp_replace(coalesce(ct.primary_phone,''),'[^0-9]','','g') like ${"%"+p} or exists (select 1 from core.contact_identifier ci where ci.contact_id=ct.id and ci.type='phone' and regexp_replace(ci.value,'[^0-9]','','g') like ${"%"+p})) limit 1`;
      if (r.length) return r[0].id;
    }
  }
  return null;
}
const seen = new Set((await sql`select nmi_transaction_id from finance.successful_payment where nmi_transaction_id is not null`).map(r=>r.nmi_transaction_id));
const stats = { txns:0, payments:0, reversals:0, existing:0 };
let from = new Date("2023-01-01T00:00:00Z");
while (from.getTime() < Date.now()) {
  const to = new Date(Math.min(from.getTime() + 183*864e5, Date.now()));
  let windowOk = false;
  for (let attempt = 1; attempt <= 3 && !windowOk; attempt++) {
  try {
  const start = from.toISOString().slice(0,10).replace(/-/g,"") + "000000";
  const end = to.toISOString().slice(0,10).replace(/-/g,"") + "235959";
  const res = await fetch(`https://secure.networkmerchants.com/api/query.php?security_key=${KEY}&start_date=${start}&end_date=${end}`);
  const xml = await res.text();
  if (xml.includes("error_response")) { console.log("window error:", xml.slice(0,150)); windowOk = true; continue; }
  for (const block of xml.split("<transaction>").slice(1)) {
    const txn = block.split("</transaction>")[0];
    stats.txns++;
    const txnId = extract(txn, "transaction_id"); if (!txnId) continue;
    const condition = extract(txn, "condition");
    const email = extract(txn, "email"); const phone = extract(txn, "phone");
    const actions = [...txn.matchAll(/<action>([\s\S]*?)<\/action>/g)].map(m=>m[1]);
    const sale = actions.find(a=>["sale","capture"].includes(extract(a,"action_type")??"") && extract(a,"success")==="1");
    const refund = actions.find(a=>["refund","credit","void"].includes(extract(a,"action_type")??"") && extract(a,"success")==="1");
    const contactId = (email||phone) ? await findContact(email, phone) : null;
    if (sale && ["complete","pendingsettlement","pending"].includes(condition??"")) {
      if (seen.has(txnId)) stats.existing++;
      else {
        const amt = Math.round(parseFloat(extract(sale,"amount")??"0")*100);
        if (amt > 0) {
          const when = nmiDate(extract(sale,"date")) ?? new Date().toISOString();
          let dealId=null, repId=null, type="installment";
          if (contactId) {
            const [deal] = await sql`select id, closer_rep_id, total_contract_value_minor from sales.deal where contact_id=${contactId} order by deal_close_date desc limit 1`;
            if (deal) { dealId=deal.id; repId=deal.closer_rep_id; if (Number(deal.total_contract_value_minor)===amt) type="pif"; }
          }
          await sql`insert into finance.successful_payment (deal_id, contact_id, rep_id, processor, type, amount_minor, occurred_at, nmi_transaction_id, product_type)
            values (${dealId}, ${contactId}, ${repId}, 'nmi', ${type}::public.payment_type, ${amt}, ${when}, ${txnId}, 'high_ticket'::public.product_tier)`;
          seen.add(txnId); stats.payments++;
        }
      }
    }
    if (refund) {
      const amt = Math.round(parseFloat(extract(refund,"amount")??"0")*100);
      const when = nmiDate(extract(refund,"date")) ?? new Date().toISOString();
      if (amt > 0) {
        const ex = await sql`select 1 from finance.reversal where reason = ${"nmi txn "+txnId} limit 1`;
        if (!ex.length) {
          const [pay] = await sql`select id, deal_id from finance.successful_payment where nmi_transaction_id=${txnId} limit 1`;
          await sql`insert into finance.reversal (deal_id, payment_id, type, amount_minor, reason, occurred_at)
            values (${pay?.deal_id ?? null}, ${pay?.id ?? null}, 'refund', ${amt}, ${"nmi txn "+txnId}, ${when})`;
          stats.reversals++;
        }
      }
    }
  }
    windowOk = true;
    console.log(`window done through ${to.toISOString().slice(0,10)}:`, JSON.stringify(stats));
  } catch (e) { console.log(`window retry ${attempt}: ${String(e).slice(0,80)}`); await new Promise(r=>setTimeout(r,3000*attempt)); }
  }
  from = to;
}
console.log("NMI HISTORY COMPLETE:", JSON.stringify(stats));
await sql.end(); process.exit(0);
