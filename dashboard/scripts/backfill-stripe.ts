import { sql } from "../lib/db";
import { getProviderToken } from "../lib/sync/providers";
import { storeAndProcess } from "../lib/sync/ingest";

// Stripe history import: pages ALL charges and runs the $25 booking fees
// through the same idempotent ingest as the live webhook (re-runnable; a
// re-imported charge is a no-op). Needs a restricted key: Charges Read.
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
  console.log(JSON.stringify({ charges_seen: seen, imported: booking, skipped_refunded_or_failed: skipped }));
  process.exit(0);
};
main().catch((e) => { console.error(e); process.exit(1); });
