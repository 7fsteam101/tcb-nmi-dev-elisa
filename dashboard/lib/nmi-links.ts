import { sql } from "./db";
import { getProviderToken } from "./sync/providers";

// NMI payment links via the Invoicing API (transact.php, invoicing=add_invoice).
// With only a gateway security key this is the reliable, documented path: NMI
// creates an invoice and EMAILS the customer a hosted pay link, returning the
// invoice_id. There is no separately-returned public URL in the classic API, so
// customer_email is required and the row lands as status='sent' (NMI mails it).
// When the payment settles, the NMI webhook/reconcile flips it to 'paid'.
const TRANSACT = "https://secure.networkmerchants.com/api/transact.php";

function parseKV(body: string): Record<string, string> {
  return Object.fromEntries(new URLSearchParams(body).entries());
}

export async function createPaymentLink(
  input: {
    amountMinor: number; description?: string; customerName?: string; customerEmail?: string;
    contactId?: string; productId?: string; frequency?: string; installments?: number;
  },
  userId: string,
) {
  const key = await getProviderToken("nmi");
  if (!key) return { ok: false as const, message: "NMI is not connected yet. Add the gateway key in Connections first." };
  if (!input.customerEmail) return { ok: false as const, message: "A customer email is required — NMI emails the pay link to it." };
  if (!input.amountMinor || input.amountMinor <= 0) return { ok: false as const, message: "Enter an amount." };

  // For a plan, the first NMI invoice is the per-installment amount; the total
  // contract value is stored on the row. Full recurring auto-billing (charging
  // installments 2..N on the frequency) activates with the NMI recurring connector.
  const isPlan = !!input.installments && input.installments > 1;
  const chargeMinor = isPlan ? Math.round(input.amountMinor / input.installments!) : input.amountMinor;

  const [first, ...rest] = (input.customerName ?? "").trim().split(" ");
  const params = new URLSearchParams({
    security_key: key,
    invoicing: "add_invoice",
    amount: (chargeMinor / 100).toFixed(2),
    email: input.customerEmail,
    payment_terms: "upon_receipt",
    order_description: input.description ?? "The Credit Brothers",
    ...(first ? { first_name: first } : {}),
    ...(rest.length ? { last_name: rest.join(" ") } : {}),
  });

  let res: Response;
  try {
    res = await fetch(TRANSACT, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: params });
  } catch (err) {
    return { ok: false as const, message: `NMI request failed: ${String(err)}` };
  }
  const kv = parseKV(await res.text());
  const ok = kv.response === "1" || kv.response_code === "100";
  const invoiceId = kv.invoice_id ?? kv.transactionid ?? null;

  const [row] = await sql`
    insert into finance.payment_link (amount_minor, description, customer_name, customer_email, contact_id,
                                      product_id, frequency, installments, processor, external_id, url, status, created_by_user_id)
    values (${input.amountMinor}, ${input.description ?? null}, ${input.customerName ?? null}, ${input.customerEmail},
            ${input.contactId ?? null}, ${input.productId ?? null}, ${input.frequency ?? null}, ${input.installments ?? null},
            'nmi', ${invoiceId}, null, ${ok ? "sent" : "failed"}, ${userId})
    returning id`;

  if (!ok) return { ok: false as const, message: `NMI rejected the invoice: ${kv.responsetext ?? "unknown error"}` };
  return {
    ok: true as const, id: row.id,
    message: isPlan
      ? `First installment invoice (${(chargeMinor / 100).toLocaleString("en-US", { style: "currency", currency: "USD" })}) emailed to ${input.customerEmail}. Recurring auto-billing activates with the NMI recurring connector.`
      : `Invoice emailed to ${input.customerEmail}.`,
  };
}

export async function listPaymentLinks() {
  return sql`
    select pl.id, pl.amount_minor, pl.description, pl.customer_name, pl.customer_email,
           pl.processor, pl.status, pl.url, pl.external_id, pl.frequency, pl.installments, pl.created_at, u.full_name as creator
    from finance.payment_link pl
    left join core.app_user u on u.id = pl.created_by_user_id
    order by pl.created_at desc limit 50`;
}
