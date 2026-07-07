import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { getPaymentLinkByToken, scheduleFor, recordNmiPayment } from "@/lib/nmi-links";
import { saleAndVault, addSubscription, ok } from "@/lib/nmi";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Public endpoint the branded pay page posts to. Takes the first installment,
// vaults the card, and (for a plan) schedules the remaining installments.
export async function POST(req: NextRequest) {
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ ok: false, message: "Bad request" }, { status: 400 }); }
  const { token, name, email, phone, zip, paymentToken, card } = body ?? {};
  if (!token) return NextResponse.json({ ok: false, message: "Missing token" }, { status: 400 });

  const link: any = await getPaymentLinkByToken(token);
  if (!link) return NextResponse.json({ ok: false, message: "Payment link not found" }, { status: 404 });
  if (link.status === "paid") return NextResponse.json({ ok: false, message: "This link has already been paid." }, { status: 409 });
  if (link.expires_at && new Date(link.expires_at) < new Date()) return NextResponse.json({ ok: false, message: "This link has expired." }, { status: 410 });

  const total = link.amount_minor as number;
  const n = (link.installments as number) || 1;
  const isPlan = n > 1;
  const isCustom = Array.isArray(link.custom_schedule) && link.custom_schedule.length > 1;
  const schedule = scheduleFor(link);
  const firstAmount = isPlan ? schedule[0].amountMinor : total;
  const productType: "high_ticket" | "low_ticket" = total <= 5000 ? "low_ticket" : "high_ticket";

  const source = paymentToken ? { paymentToken } : card ? { ccnumber: card.ccnumber, ccexp: card.ccexp, cvv: card.cvv } : null;
  if (!source) return NextResponse.json({ ok: false, message: "No payment method provided." }, { status: 400 });

  const [first, ...rest] = String(name ?? link.customer_name ?? "").trim().split(" ");

  // 1. charge installment #1 + vault the card
  const sale = await saleAndVault({
    amountMinor: firstAmount,
    source,
    firstName: first || undefined,
    lastName: rest.join(" ") || undefined,
    email: email || link.customer_email || undefined,
    phone: phone || undefined,
    zip: zip || undefined,
    planId: token,
    orderId: link.id,
  });

  if (!ok(sale)) {
    await sql`update finance.payment_link set status = 'failed' where id = ${link.id}`;
    return NextResponse.json({ ok: false, message: sale.responsetext || "Card was declined. Please try another card." }, { status: 402 });
  }

  const vaultId = sale.customer_vault_id || null;
  await sql`update finance.payment_link set nmi_customer_vault_id = ${vaultId}, viewed_at = coalesce(viewed_at, now()) where id = ${link.id}`;
  await recordNmiPayment({
    linkId: link.id, contactId: link.contact_id ?? null, amountMinor: firstAmount,
    nmiTxnId: sale.transactionid, productType, markLinkPaid: true,
  });

  // 2. schedule the remaining installments against the vaulted card (does not charge today)
  let scheduleMsg = "";
  if (isPlan && vaultId && isCustom) {
    // custom amounts/dates cannot be a fixed subscription: mark #1 paid in the
    // stored schedule; the receivables cron charges each remaining one on its date.
    const updated = (link.custom_schedule as any[]).map((s, i) =>
      i === 0 ? { ...s, status: "paid", txnId: sale.transactionid } : s);
    await sql`update finance.payment_link set custom_schedule = ${sql.json(updated as never)} where id = ${link.id}`;
    scheduleMsg = ` The remaining ${n - 1} payments will charge on their scheduled dates.`;
  } else if (isPlan && vaultId) {
    const startDate = schedule[1].dueDate.replace(/-/g, ""); // installment #2, YYYYMMDD
    const sub = await addSubscription({
      vaultId,
      planPayments: n - 1,
      planAmountMinor: schedule[1].amountMinor,
      frequency: link.frequency || "monthly",
      startDate,
      sourceTransactionId: sale.transactionid,
      planId: token,
    });
    if (ok(sub) && sub.subscription_id) {
      await sql`update finance.payment_link set nmi_subscription_id = ${sub.subscription_id} where id = ${link.id}`;
      scheduleMsg = ` The remaining ${n - 1} payments are scheduled.`;
    } else {
      await sql`update finance.payment_link set status = 'paid' where id = ${link.id}`;
      scheduleMsg = ` (First payment received. Scheduling the rest needs a quick follow-up.)`;
      console.error("NMI add_subscription failed for link", link.id, sub.responsetext);
    }
  }

  return NextResponse.json({ ok: true, message: `Payment received.${scheduleMsg}`, transactionId: sale.transactionid });
}
