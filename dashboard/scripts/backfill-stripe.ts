import { sql } from "../lib/db";
import { getProviderToken } from "../lib/sync/providers";
import { storeAndProcess } from "../lib/sync/ingest";

// Stripe history import: pages ALL charges, refunds, and disputes and runs
// them through the same idempotent ingest as the live webhook (re-runnable; a
// re-imported record is a no-op). Needs a restricted key with read access to
// charges, refunds, and disputes.

/** Page a Stripe list endpoint (starting_after cursor) and feed every item to onItem. */
async function pageStripe(key: string, endpoint: string, onItem: (item: any) => Promise<void>) {
  let startingAfter: string | null = null;
  while (true) {
    const url = new URL(`https://api.stripe.com/v1/${endpoint}`);
    url.searchParams.set("limit", "100");
    if (startingAfter) url.searchParams.set("starting_after", startingAfter);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`stripe ${endpoint} failed: ${res.status} ${await res.text()}`);
    const page = await res.json();
    for (const item of page.data ?? []) await onItem(item);
    if (!page.data?.length || !page.has_more) break;
    startingAfter = page.data[page.data.length - 1].id;
  }
}

const main = async () => {
  const key = await getProviderToken("stripe");
  if (!key) throw new Error("no stripe key connected");
  const [conn] = await sql`select id from sync.connections where provider = 'stripe' order by created_at limit 1`;
  if (!conn) throw new Error("no stripe connection row");

  let startingAfter: string | null = null;
  let seen = 0, booking = 0, skipped = 0;
  while (true) {
    const url = new URL("https://api.stripe.com/v1/charges");
    url.searchParams.set("limit", "100");
    if (startingAfter) url.searchParams.set("starting_after", startingAfter);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`stripe charges failed: ${res.status} ${await res.text()}`);
    const page = await res.json();
    for (const ch of page.data ?? []) {
      seen++;
      if (ch.status !== "succeeded" || ch.refunded === true) { skipped++; continue; }
      // the $25 booking fee is the only thing on their Stripe; tolerate minor price variants
      await storeAndProcess(conn.id, "stripe", ch.id, "charge.succeeded", {
        id: ch.id,
        type: "charge.succeeded",
        data: { object: ch },
      });
      booking++;
      startingAfter = ch.id;
    }
    if (page.data?.length) startingAfter = page.data[page.data.length - 1].id;
    if (!page.has_more) break;
  }

  // refunds pass: reversal rows that net out cash + feed the refund-rate widget
  let refunds = 0;
  await pageStripe(key, "refunds", async (refund) => {
    await storeAndProcess(conn.id, "stripe", "refund:" + refund.id, "refund.created", {
      id: "refund:" + refund.id,
      type: "refund.created",
      data: { object: refund },
    });
    refunds++;
  });

  // disputes pass: case lifecycle -> finance.dispute (+ reversal when funds withdrawn/lost)
  let disputes = 0;
  await pageStripe(key, "disputes", async (d) => {
    await storeAndProcess(conn.id, "stripe", "dispute:" + d.id, "charge.dispute.updated", {
      id: "dispute:" + d.id,
      type: "charge.dispute.updated",
      data: { object: d },
    });
    disputes++;
  });

  console.log(JSON.stringify({
    charges_seen: seen,
    imported: booking,
    skipped_refunded_or_failed: skipped,
    refunds_imported: refunds,
    disputes_imported: disputes,
  }));
  process.exit(0);
};
main().catch((e) => { console.error(e); process.exit(1); });
