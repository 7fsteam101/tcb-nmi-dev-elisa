import { sql } from "../db";
import { getProviderToken } from "./providers";
import { findContact } from "./contacts";
import { notifyEvent } from "../notify";
import { money } from "../format";

// NMI transaction pull (idempotent on nmi_transaction_id). Two callers:
//   - the daily cron (sinceDays ~3) so approved sales land even before the
//     Silent Post webhook is switched on in the NMI portal
//   - the full-history import script (wide window)
// Approved sales -> finance.successful_payment (contact matched by email/phone,
// deal = the contact's most recent; pif when the amount equals the deal TCV).
// Refunds/credits/voids -> finance.reversal linked to the reversed payment.
const QUERY = "https://secure.networkmerchants.com/api/query.php";

const extract = (block: string, tag: string): string | null => {
  const m = block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m && m[1] !== "" ? m[1] : null;
};

// NMI dates: YYYYMMDDhhmmss, gateway local time treated as ET
const nmiDate = (s: string | null): string | null => {
  if (!s || s.length < 8) return null;
  const iso = `${s.slice(0, 4)}-${s.slice(4, 6)}-${s.slice(6, 8)}T${s.slice(8, 10) || "12"}:${s.slice(10, 12) || "00"}:${s.slice(12, 14) || "00"}-04:00`;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d.toISOString();
};

// notify: fire Slack payment events for fresh inserts (the daily cron wants
// them; the wide-window history import must stay silent).
export async function pullNmiWindow(startIso: string, endIso: string, notify = false) {
  const key = await getProviderToken("nmi");
  if (!key) return { error: "no nmi key" };
  const stats = { txns: 0, payments: 0, reversals: 0, existing: 0, skipped: 0 };

  const start = startIso.slice(0, 10).replace(/-/g, "") + "000000";
  const end = endIso.slice(0, 10).replace(/-/g, "") + "235959";
  const res = await fetch(`${QUERY}?security_key=${key}&start_date=${start}&end_date=${end}`);
  const xml = await res.text();
  if (xml.includes("error_response")) return { error: xml.slice(0, 200) };

  const seen = new Set<string>(
    (await sql`select nmi_transaction_id from finance.successful_payment where nmi_transaction_id is not null`)
      .map((r: any) => r.nmi_transaction_id as string),
  );

  for (const block of xml.split("<transaction>").slice(1)) {
    const txn = block.split("</transaction>")[0];
    stats.txns++;
    const txnId = extract(txn, "transaction_id");
    if (!txnId) continue;
    const condition = extract(txn, "condition");
    const email = extract(txn, "email");
    const phone = extract(txn, "phone");

    const actions = [...txn.matchAll(/<action>([\s\S]*?)<\/action>/g)].map((m) => m[1]);
    const saleAction = actions.find((a) => ["sale", "capture"].includes(extract(a, "action_type") ?? "") && extract(a, "success") === "1");
    const refundAction = actions.find((a) => ["refund", "credit", "void"].includes(extract(a, "action_type") ?? "") && extract(a, "success") === "1");

    const contactId = (email || phone) ? await findContact({ email: email ?? undefined, phone: phone ?? undefined }) : null;

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
            dealId = deal.id; repId = deal.closer_rep_id;
            if (Number(deal.total_contract_value_minor) === amountMinor) type = "pif";
          }
        }
        await sql`
          insert into finance.successful_payment (deal_id, contact_id, rep_id, processor, type, amount_minor, occurred_at, nmi_transaction_id, product_type)
          values (${dealId}, ${contactId ?? null}, ${repId}, 'nmi', ${type}::public.payment_type, ${amountMinor}, ${when}, ${txnId}, 'high_ticket'::public.product_tier)`;
        seen.add(txnId);
        stats.payments++;
        if (notify) {
          let contactName: string | null = null;
          if (contactId) {
            const [ct] = await sql`select full_name from core.contact where id = ${contactId} limit 1`;
            contactName = ct?.full_name ?? null;
          }
          await notifyEvent("payment_succeeded", {
            contact_name: contactName ?? "unknown",
            amount: money(amountMinor),
            processor: "NMI",
            plan_type: type,
            collected_pct: "",
            deal_value: "",
          }, amountMinor);
        }
      }
    }

    if (refundAction) {
      const amountMinor = Math.round(parseFloat(extract(refundAction, "amount") ?? "0") * 100);
      const when = nmiDate(extract(refundAction, "date")) ?? new Date().toISOString();
      if (amountMinor > 0) {
        const existingRev = await sql`select 1 from finance.reversal where reason = ${"nmi txn " + txnId} limit 1`;
        if (!existingRev.length) {
          const [pay] = await sql`select id, deal_id from finance.successful_payment where nmi_transaction_id = ${txnId} limit 1`;
          await sql`
            insert into finance.reversal (deal_id, payment_id, type, amount_minor, reason, occurred_at)
            values (${pay?.deal_id ?? null}, ${pay?.id ?? null}, 'refund', ${amountMinor}, ${"nmi txn " + txnId}, ${when})`;
          stats.reversals++;
          if (notify) {
            await notifyEvent("payment_refunded", {
              contact_name: email ?? "",
              amount: money(amountMinor),
              kind: "refund",
            }, amountMinor);
          }
        }
      }
    }
  }
  return stats;
}

/** Daily freshness: the last few days, cheap and idempotent. */
export async function pullNmiRecent(days = 3) {
  const start = new Date(Date.now() - days * 864e5).toISOString();
  return pullNmiWindow(start, new Date().toISOString(), true);
}
