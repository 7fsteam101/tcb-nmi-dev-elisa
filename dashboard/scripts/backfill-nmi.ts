import { sql } from "../lib/db";
import { getProviderToken } from "../lib/sync/providers";
import { findContact } from "../lib/sync/contacts";

// NMI history import (idempotent on nmi_transaction_id, re-runnable):
//   sales (approved)   -> finance.successful_payment, matched to the contact by
//                         email/phone and to their most recent deal
//   refunds/credits    -> finance.reversal linked to the reversed payment
// Payment type: pif when the amount equals the matched deal's TCV, else installment.
// Unmatched payments import with deal_id null (visible in the cash drill as unlinked).
const QUERY = "https://secure.networkmerchants.com/api/query.php";

function extract(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m && m[1] !== "" ? m[1] : null;
}

// NMI dates: YYYYMMDDhhmmss (gateway local time; treated as ET)
function nmiDate(s: string | null): string | null {
  if (!s || s.length < 8) return null;
  const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10) || "12"}:${s.slice(10, 12) || "00"}:${s.slice(12, 14) || "00"}-04:00`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toISOString();
}

const main = async () => {
  const key = await getProviderToken("nmi");
  if (!key) throw new Error("no nmi key");
  const stats = { txns: 0, payments: 0, matchedContact: 0, matchedDeal: 0, pif: 0, reversals: 0, skipped: 0, existing: 0 };

  // pull in 6-month windows from 2025-01-01 to now (bounded payloads)
  const windows: [string, string][] = [];
  let from = new Date("2025-01-01T00:00:00Z");
  while (from.getTime() < Date.now()) {
    const to = new Date(Math.min(from.getTime() + 183 * 864e5, Date.now()));
    windows.push([
      from.toISOString().slice(0, 10).replace(/-/g, "") + "000000",
      to.toISOString().slice(0, 10).replace(/-/g, "") + "235959",
    ]);
    from = to;
  }

  const seen = new Set<string>(
    (await sql`select nmi_transaction_id from finance.successful_payment where nmi_transaction_id is not null`)
      .map((r: any) => r.nmi_transaction_id),
  );

  for (const [start, end] of windows) {
    const res = await fetch(`${QUERY}?security_key=${key}&start_date=${start}&end_date=${end}`);
    const xml = await res.text();
    if (xml.includes("error_response")) throw new Error(xml.slice(0, 200));

    for (const block of xml.split("<transaction>").slice(1)) {
      const txn = block.split("</transaction>")[0];
      stats.txns++;
      const txnId = extract(txn, "transaction_id");
      if (!txnId) continue;
      const condition = extract(txn, "condition");
      const email = extract(txn, "email");
      const phone = extract(txn, "phone");
      const first = extract(txn, "first_name") ?? "";
      const last = extract(txn, "last_name") ?? "";

      // actions carry the money: sale/refund/credit with amount + date + success
      const actions = [...txn.matchAll(/<action>([\s\S]*?)<\/action>/g)].map((m) => m[1]);
      const saleAction = actions.find((a) => ["sale", "capture"].includes(extract(a, "action_type") ?? "") && extract(a, "success") === "1");
      const refundAction = actions.find((a) => ["refund", "credit", "void"].includes(extract(a, "action_type") ?? "") && extract(a, "success") === "1");

      const contactId = (email || phone)
        ? await findContact({ email: email ?? undefined, phone: phone ?? undefined })
        : null;
      if (contactId) stats.matchedContact++;

      if (saleAction && ["complete", "pendingsettlement", "pending"].includes(condition ?? "")) {
        if (seen.has(txnId)) { stats.existing++; }
        else {
          const amountMinor = Math.round(parseFloat(extract(saleAction, "amount") ?? "0") * 100);
          if (amountMinor <= 0) { stats.skipped++; continue; }
          const when = nmiDate(extract(saleAction, "date")) ?? new Date().toISOString();
          let dealId: string | null = null, repId: string | null = null, type = "installment";
          if (contactId) {
            const [deal] = await sql`
              select id, closer_rep_id, total_contract_value_minor from sales.deal
              where contact_id = ${contactId} order by deal_close_date desc limit 1`;
            if (deal) {
              dealId = deal.id; repId = deal.closer_rep_id; stats.matchedDeal++;
              if (Number(deal.total_contract_value_minor) === amountMinor) { type = "pif"; stats.pif++; }
            }
          }
          await sql`
            insert into finance.successful_payment (deal_id, rep_id, processor, type, amount_minor, occurred_at, nmi_transaction_id)
            values (${dealId}, ${repId}, 'nmi', ${type}::public.payment_type, ${amountMinor}, ${when}, ${txnId})`;
          seen.add(txnId);
          stats.payments++;
        }
      }

      if (refundAction) {
        const amountMinor = Math.round(parseFloat(extract(refundAction, "amount") ?? "0") * 100);
        const when = nmiDate(extract(refundAction, "date")) ?? new Date().toISOString();
        const existingRev = await sql`
          select 1 from finance.reversal where reason = ${"nmi txn " + txnId} limit 1`;
        if (!existingRev.length && amountMinor > 0) {
          const [pay] = await sql`
            select id, deal_id from finance.successful_payment where nmi_transaction_id = ${txnId} limit 1`;
          await sql`
            insert into finance.reversal (deal_id, payment_id, type, amount_minor, reason, occurred_at)
            values (${pay?.deal_id ?? null}, ${pay?.id ?? null},
                    ${(extract(refundAction, "action_type") === "void" ? "refund" : extract(refundAction, "action_type") === "credit" ? "refund" : "refund")},
                    ${amountMinor}, ${"nmi txn " + txnId}, ${when})`;
          stats.reversals++;
        }
      }
    }
  }
  console.log(JSON.stringify(stats));
  process.exit(0);
};
main().catch((e) => { console.error(e); process.exit(1); });
