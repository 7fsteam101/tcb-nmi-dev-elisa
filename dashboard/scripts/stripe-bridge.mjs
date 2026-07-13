// Stripe history backfill: pages every charge (+refunds, +disputes) and feeds
// them through the DEPLOYED /api/webhooks/stripe endpoint with deterministic
// event ids, so prod logic normalizes and reruns dedupe. Same pattern as the
// GHL bridge.
const SK = process.env.STRIPE_KEY;
const HOOK = `https://tcb-sales-system.vercel.app/api/webhooks/stripe?secret=${process.env.WEBHOOK_SECRET}`;
const AUTH = "Basic " + Buffer.from(`${SK}:`).toString("base64");

let sent = 0, failed = 0;
const queue = [];
async function post(envelope) {
  queue.push(fetch(HOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope) })
    .then((r) => { r.ok ? sent++ : failed++; }).catch(() => { failed++; }));
  if (queue.length >= 4) { await Promise.all(queue); queue.length = 0; }
}

async function page(path, params = "") {
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      const res = await fetch(`https://api.stripe.com/v1/${path}?limit=100${params}`, { headers: { Authorization: AUTH } });
      return await res.json();
    } catch (err) {
      if (attempt === 4) throw err;
      console.log(`  fetch retry ${attempt} (${String(err.cause?.code ?? err).slice(0, 40)})`);
      await new Promise((r) => setTimeout(r, attempt * 2000));
    }
  }
}

let after = "", charges = 0, refunds = 0;
for (let i = 0; i < 200; i++) {
  const res = await page("charges", after ? `&starting_after=${after}` : "");
  const batch = res.data ?? [];
  if (!batch.length) break;
  for (const ch of batch) {
    if (ch.status === "succeeded" && ch.paid) {
      await post({ id: `backfill_${ch.id}`, type: "charge.succeeded", data: { object: ch } });
      charges++;
    }
    if ((ch.amount_refunded ?? 0) > 0) {
      await post({ id: `backfill_refund_${ch.id}`, type: "charge.refunded", data: { object: ch } });
      refunds++;
    }
  }
  after = batch[batch.length - 1].id;
  if (charges % 500 < 100) console.log(`charges so far: ${charges} (refunds ${refunds})`);
  if (!res.has_more) break;
}
console.log(`charges done: ${charges}, refunds: ${refunds}`);

let dafter = "", disputes = 0;
for (let i = 0; i < 20; i++) {
  const res = await page("disputes", dafter ? `&starting_after=${dafter}` : "");
  const batch = res.data ?? [];
  if (!batch.length) break;
  for (const d of batch) {
    const closed = ["won", "lost", "charge_refunded", "warning_closed"].includes(d.status);
    await post({ id: `backfill_dispute_${d.id}`, type: closed ? "charge.dispute.closed" : "charge.dispute.created", data: { object: d } });
    disputes++;
  }
  dafter = batch[batch.length - 1].id;
  if (!res.has_more) break;
}
await Promise.all(queue);
console.log(`STRIPE BRIDGE COMPLETE: charges=${charges} refunds=${refunds} disputes=${disputes} posts sent=${sent} failed=${failed}`);
process.exit(0);
