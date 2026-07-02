import { sql } from "../lib/db";
import { getProviderToken } from "../lib/sync/providers";
import { upsertContact } from "../lib/sync/contacts";

// Links every NMI payment to its payer (payment.contact_id), creating contact
// records for payers who do not exist yet (created_source = 'nmi_successful_payment',
// lifecycle = customer: they paid). Approved by Katie 2026-07-02. Re-runnable.
const QUERY = "https://secure.networkmerchants.com/api/query.php";

function extract(block: string, tag: string): string | null {
  const m = block.match(new RegExp(`<${tag}>([^<]*)</${tag}>`));
  return m && m[1] !== "" ? m[1] : null;
}

const main = async () => {
  const key = await getProviderToken("nmi");
  if (!key) throw new Error("no nmi key");
  const stats = { paymentsSeen: 0, linkedExisting: 0, contactsCreated: 0, alreadyLinked: 0, noPayerData: 0 };

  // payments that still need a payer
  const pending = new Map<string, string>(); // nmi_transaction_id -> payment id
  for (const r of await sql`
    select id, nmi_transaction_id from finance.successful_payment
    where processor = 'nmi' and contact_id is null and nmi_transaction_id is not null`) {
    pending.set(r.nmi_transaction_id, r.id);
  }
  stats.alreadyLinked = Number((await sql`
    select count(*) as n from finance.successful_payment where processor = 'nmi' and contact_id is not null`)[0].n);

  let from = new Date("2025-01-01T00:00:00Z");
  while (from.getTime() < Date.now() && pending.size > 0) {
    const to = new Date(Math.min(from.getTime() + 183 * 864e5, Date.now()));
    const start = from.toISOString().slice(0, 10).replace(/-/g, "") + "000000";
    const end = to.toISOString().slice(0, 10).replace(/-/g, "") + "235959";
    from = to;
    const res = await fetch(`${QUERY}?security_key=${key}&start_date=${start}&end_date=${end}`);
    const xml = await res.text();

    for (const block of xml.split("<transaction>").slice(1)) {
      const txn = block.split("</transaction>")[0];
      const txnId = extract(txn, "transaction_id");
      if (!txnId || !pending.has(txnId)) continue;
      stats.paymentsSeen++;
      const email = extract(txn, "email");
      const phone = extract(txn, "phone");
      const first = extract(txn, "first_name");
      const last = extract(txn, "last_name");
      if (!email && !phone && !first) { stats.noPayerData++; pending.delete(txnId); continue; }

      const { id: contactId, created } = await upsertContact({
        email: email ?? undefined,
        phone: phone ?? undefined,
        firstName: first ?? undefined,
        lastName: last ?? undefined,
        fullName: [first, last].filter(Boolean).join(" ") || (email ?? "NMI payer"),
        createdSource: "nmi_successful_payment",
      });
      if (created) {
        stats.contactsCreated++;
        await sql`update core.contact set lifecycle_status = 'customer' where id = ${contactId}`;
      } else {
        stats.linkedExisting++;
        await sql`update core.contact set lifecycle_status = 'customer' where id = ${contactId} and lifecycle_status = 'lead'`;
      }
      await sql`update finance.successful_payment set contact_id = ${contactId} where id = ${pending.get(txnId) ?? null}`;
      pending.delete(txnId);
    }
  }
  console.log(JSON.stringify({ ...stats, unresolved: pending.size }));
  process.exit(0);
};
main().catch((e) => { console.error(e); process.exit(1); });
