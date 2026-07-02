import { getProviderToken, ensureConnection, markSynced } from "./providers";
import { storeAndProcess } from "./ingest";

// Daily safety net under the Stripe webhook: re-pull everything CREATED in the
// last few days (charges, refunds, disputes) and replay it through the same
// idempotent ingest. Anything the webhook already delivered de-dupes to a
// no-op; anything it missed lands now. The caller wires this into the cron.

/** Page a Stripe list endpoint filtered to created >= sinceUnix, feeding every item to onItem. */
async function pageStripe(key: string, endpoint: string, sinceUnix: number, onItem: (item: any) => Promise<void>) {
  let startingAfter: string | null = null;
  while (true) {
    const url = new URL(`https://api.stripe.com/v1/${endpoint}`);
    url.searchParams.set("limit", "100");
    url.searchParams.set("created[gte]", String(sinceUnix));
    if (startingAfter) url.searchParams.set("starting_after", startingAfter);
    const res = await fetch(url, { headers: { Authorization: `Bearer ${key}` } });
    if (!res.ok) throw new Error(`stripe ${endpoint} failed: ${res.status} ${await res.text()}`);
    const page = await res.json();
    for (const item of page.data ?? []) await onItem(item);
    if (!page.data?.length || !page.has_more) break;
    startingAfter = page.data[page.data.length - 1].id;
  }
}

export async function reconcileStripe({ sinceDays = 3 } = {}) {
  const key = await getProviderToken("stripe");
  if (!key) return { skipped: true };
  const connectionId = await ensureConnection("stripe", "default", "Stripe");
  const since = Math.floor(Date.now() / 1000) - sinceDays * 86_400;

  let charges = 0, refunds = 0, disputes = 0;
  try {
    // charges: replay exactly what a charge.succeeded webhook would have sent.
    // Succeeded-only (the list API also returns failed/pending); later-refunded
    // charges still go through so the payment and its refund reversal pair up.
    await pageStripe(key, "charges", since, async (ch) => {
      if (ch.status !== "succeeded") return;
      await storeAndProcess(connectionId, "stripe", ch.id, "charge.succeeded", {
        id: ch.id,
        type: "charge.succeeded",
        data: { object: ch },
      });
      charges++;
    });

    await pageStripe(key, "refunds", since, async (refund) => {
      await storeAndProcess(connectionId, "stripe", "refund:" + refund.id, "refund.created", {
        id: "refund:" + refund.id,
        type: "refund.created",
        data: { object: refund },
      });
      refunds++;
    });

    await pageStripe(key, "disputes", since, async (d) => {
      await storeAndProcess(connectionId, "stripe", "dispute:" + d.id, "charge.dispute.updated", {
        id: "dispute:" + d.id,
        type: "charge.dispute.updated",
        data: { object: d },
      });
      disputes++;
    });

    await markSynced(connectionId);
    return { skipped: false, charges, refunds, disputes };
  } catch (err) {
    await markSynced(connectionId, String(err));
    return { skipped: false, charges, refunds, disputes, error: String(err) };
  }
}
