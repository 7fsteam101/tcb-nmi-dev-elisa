import crypto from "crypto";
import { sql } from "./db";

// Branded NMI checkout: a payment_link now carries a public token and a URL to our
// own pay page (pay.thecreditbrothers.com/pay/<token>). The card is taken on that
// page (Collect.js / wallets), so link creation no longer calls NMI; the charge and
// the installment schedule happen at /api/charge when the customer pays.

const PAY_BASE = process.env.NEXT_PUBLIC_PAY_BASE_URL || process.env.NEXT_PUBLIC_APP_URL || "https://tcb-sales-system.vercel.app";

export type Installment = { no: number; dueDate: string; amountMinor: number };

/** Split a total into N installments on a cadence; installment #1 is due today. */
export function computeSchedule(totalMinor: number, installments: number, frequency: string | null, firstIso?: string): Installment[] {
  const n = Math.max(1, installments || 1);
  const base = Math.floor(totalMinor / n);
  const start = firstIso ? new Date(firstIso) : new Date();
  const step = (d: Date, i: number) => {
    const x = new Date(d);
    if (frequency === "weekly") x.setDate(x.getDate() + 7 * i);
    else if (frequency === "biweekly") x.setDate(x.getDate() + 14 * i);
    else x.setMonth(x.getMonth() + i); // monthly / custom default
    return x;
  };
  return Array.from({ length: n }, (_, i) => ({
    no: i + 1,
    dueDate: step(start, i).toISOString().slice(0, 10),
    amountMinor: i === n - 1 ? totalMinor - base * (n - 1) : base, // last absorbs rounding
  }));
}

export async function createPaymentLink(
  input: {
    amountMinor: number; description?: string; customerName?: string; customerEmail?: string;
    contactId?: string; productId?: string; frequency?: string; installments?: number;
  },
  userId: string,
) {
  if (!input.amountMinor || input.amountMinor <= 0) return { ok: false as const, message: "Enter an amount." };
  const token = crypto.randomUUID().replace(/-/g, "");
  const url = `${PAY_BASE}/pay/${token}`;
  const expires = new Date(); expires.setDate(expires.getDate() + 30);

  const [row] = await sql`
    insert into finance.payment_link (amount_minor, description, customer_name, customer_email, contact_id,
                                      product_id, frequency, installments, processor, token, url, status, expires_at, created_by_user_id)
    values (${input.amountMinor}, ${input.description ?? null}, ${input.customerName ?? null}, ${input.customerEmail ?? null},
            ${input.contactId ?? null}, ${input.productId ?? null}, ${input.frequency ?? null}, ${input.installments ?? null},
            'nmi', ${token}, ${url}, 'pending', ${expires.toISOString()}, ${userId})
    returning id`;

  return { ok: true as const, id: row.id, url, token,
    message: `Payment link ready: ${url}` };
}

export async function getPaymentLinkByToken(token: string) {
  const [row] = await sql`
    select id, amount_minor, description, customer_name, customer_email, contact_id, product_id,
           frequency, installments, processor, token, url, status, expires_at, viewed_at,
           nmi_customer_vault_id, nmi_subscription_id, paid_payment_id
    from finance.payment_link where token = ${token} limit 1`;
  return row ?? null;
}

export async function listPaymentLinks() {
  return sql`
    select pl.id, pl.amount_minor, pl.description, pl.customer_name, pl.customer_email,
           pl.processor, pl.status, pl.url, pl.token, pl.external_id, pl.frequency, pl.installments, pl.created_at, u.full_name as creator
    from finance.payment_link pl
    left join core.app_user u on u.id = pl.created_by_user_id
    order by pl.created_at desc limit 50`;
}

/** Record a settled NMI charge against a link: successful_payment + mark receivable + link status. */
export async function recordNmiPayment(input: {
  linkId: string; contactId: string | null; amountMinor: number; nmiTxnId: string;
  productType?: "high_ticket" | "low_ticket"; markLinkPaid?: boolean; paymentLinkForVault?: boolean;
}): Promise<string> {
  // resolve a deal for attribution (the contact's most recent won deal), best-effort
  const dealRows = input.contactId
    ? await sql`select id from sales.deal where contact_id = ${input.contactId} order by created_at desc limit 1`
    : [];
  const dealId = dealRows[0]?.id ?? null;
  const [pay] = await sql`
    insert into finance.successful_payment (deal_id, contact_id, processor, type, amount_minor, occurred_at,
                                            nmi_transaction_id, product_type)
    values (${dealId}, ${input.contactId}, 'nmi', 'installment', ${input.amountMinor}, now(),
            ${input.nmiTxnId}, ${input.productType ?? "high_ticket"}::public.product_tier)
    on conflict do nothing
    returning id`;
  const paymentId = pay?.id ?? (await sql`select id from finance.successful_payment where nmi_transaction_id = ${input.nmiTxnId} limit 1`)[0]?.id;

  // mark the earliest open matching receivable paid (same amount, via the deal)
  if (dealId && paymentId) {
    await sql`
      update finance.receivable set status = 'paid', paid_at = current_date, payment_id = ${paymentId}
      where id = (select id from finance.receivable where deal_id = ${dealId} and status <> 'paid'
                  and amount_minor = ${input.amountMinor} order by installment_no limit 1)`;
  }
  if (input.markLinkPaid) {
    await sql`update finance.payment_link set status = 'paid', paid_payment_id = ${paymentId} where id = ${input.linkId}`;
  }
  return paymentId as string;
}
