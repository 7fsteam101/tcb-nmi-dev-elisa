import crypto from "crypto";
import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getPaymentLinkByToken, recordNmiPayment } from "@/lib/nmi-links";
import { verifyWebhookSignature } from "@/lib/nmi";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// NMI Event Webhook: fires per charge on the scheduled installments (and refunds /
// chargebacks). Signature-verified (Webhook-Signature: t=<nonce>,s=<hmac>), and
// idempotent on event_id via sync.raw_events, so NMI's up-to-20 retries are safe.
export async function POST(req: NextRequest) {
  const raw = await req.text();
  if (!verifyWebhookSignature(req.headers.get("webhook-signature"), raw)) {
    return NextResponse.json({ ok: false, message: "bad signature" }, { status: 401 });
  }

  let evt: any;
  try { evt = JSON.parse(raw); } catch { return NextResponse.json({ ok: false }, { status: 400 }); }
  const eventId: string = evt.event_id ?? evt.event_body?.transaction_id ?? crypto.randomUUID();
  const eventType: string = evt.event_type ?? "unknown";
  const bodyData = evt.event_body ?? {};

  // land it idempotently; if we have seen this event, ack and stop
  const conn = (await sql`select id from sync.connections where provider = 'nmi' order by created_at limit 1`)[0];
  const landed = await sql`
    insert into sync.raw_events (connection_id, provider, external_id, event_type, payload, status, received_at)
    values (${conn?.id ?? null}, 'nmi', ${eventId}, ${eventType}, ${sql.json(evt)}, 'pending', now())
    on conflict (connection_id, external_id, event_type) do nothing
    returning id`;
  if (!landed.length) return NextResponse.json({ ok: true, message: "duplicate, ignored" });

  try {
    const linkToken: string | undefined = bodyData.merchant_defined_field_1 || bodyData.merchant_defined_field?.["1"];
    const amountMinor = Math.round(parseFloat(bodyData.action?.amount ?? bodyData.requested_amount ?? "0") * 100);
    const txnId: string = bodyData.transaction_id ?? bodyData.transactionid ?? eventId;

    if (eventType.startsWith("transaction.sale.success") && linkToken && amountMinor > 0) {
      const link: any = await getPaymentLinkByToken(linkToken);
      // skip the very first sale (already recorded synchronously by /api/charge for this txn)
      const already = await sql`select 1 from finance.successful_payment where nmi_transaction_id = ${txnId} limit 1`;
      if (!already.length) {
        await recordNmiPayment({
          linkId: link?.id ?? "", contactId: link?.contact_id ?? null, amountMinor,
          nmiTxnId: txnId, productType: amountMinor <= 5000 ? "low_ticket" : "high_ticket", markLinkPaid: false,
        });
      }
    } else if (eventType.startsWith("transaction.refund") || eventType.startsWith("transaction.void") || eventType.includes("chargeback")) {
      const [origPay] = await sql`select id, deal_id from finance.successful_payment where nmi_transaction_id = ${bodyData.original_transaction_id ?? txnId} limit 1`;
      await sql`
        insert into finance.reversal (payment_id, deal_id, type, amount_minor, reason, occurred_at)
        values (${origPay?.id ?? null}, ${origPay?.deal_id ?? null},
                ${eventType.includes("chargeback") ? "chargeback" : "refund"}::finance.reversal_type, ${amountMinor},
                ${"NMI " + eventType}, now())
        on conflict do nothing`;
    }

    await sql`update sync.raw_events set status = 'processed', processed_at = now() where id = ${landed[0].id}`;
  } catch (err) {
    await sql`update sync.raw_events set status = 'failed' where id = ${landed[0].id}`;
    console.error("nmi-events processing error", err);
    // still 200 so NMI does not hammer retries on a poison event; we have it stored
  }

  return NextResponse.json({ ok: true });
}
