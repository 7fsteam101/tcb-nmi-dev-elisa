"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/settings";
import { createPaymentLink, recordNmiPayment } from "@/lib/nmi-links";
import { chargeVault, ok } from "@/lib/nmi";

// Sane ceiling for a manual admin charge, a guard against a fat-fingered amount
// moving an absurd sum. Raise here if a legitimate charge ever exceeds it.
const MAX_MANUAL_CHARGE_MINOR = 10_000_00; // $10,000

// Whether the Stripe processor may be offered at all. Two independent gates,
// both re-checked server-side: the app_setting flag AND the caller being an
// admin. Closers / leadership / others can never pick Stripe.
async function stripeAllowed(role: string): Promise<boolean> {
  if (role !== "admin") return false;
  const flag = await getSetting<string>("payment_links_stripe_enabled", "false");
  return flag === "true";
}

export async function createPaymentLinkAction(_prev: unknown, formData: FormData) {
  const user = await requireSession();
  if (!["admin", "leadership", "closer"].includes(user.role))
    return { ok: false, message: "Not allowed" };

  const amount = formData.get("amount") ? Math.round(parseFloat(String(formData.get("amount"))) * 100) : 0;
  const processorRaw = String(formData.get("processor") ?? "nmi");
  const contactId = (formData.get("contactId") as string) || null;
  const productId = (formData.get("productId") as string) || null;
  const isPlan = String(formData.get("planType")) === "plan";
  const FREQS = ["monthly", "biweekly", "weekly", "custom"];
  const freqRaw = String(formData.get("frequency") ?? "");
  const frequency = isPlan && FREQS.includes(freqRaw) ? freqRaw : null;
  const installments = isPlan ? Math.max(2, parseInt(String(formData.get("installments"))) || 2) : null;
  let customSchedule: { no: number; dueDate: string; amountMinor: number }[] | undefined;
  const csRaw = formData.get("customSchedule");
  if (isPlan && frequency === "custom" && csRaw) {
    try {
      const parsed = JSON.parse(String(csRaw));
      if (Array.isArray(parsed) && parsed.length > 1) customSchedule = parsed;
    } catch { /* ignore malformed schedule */ }
  }

  // Resolve the picked contact's name + email from core.contact so we copy the
  // real values onto the payment_link row (the picker only sends the id).
  let name: string | null = null;
  let email: string | null = null;
  if (contactId) {
    const rows = await sql`
      select full_name, primary_email from core.contact where id = ${contactId}`;
    if (rows.length) {
      name = (rows[0].full_name as string) ?? null;
      email = (rows[0].primary_email as string) ?? null;
    }
  }

  // Stripe path: re-check BOTH gates before honoring processor='stripe'. If not
  // allowed, fall back to NMI. Stripe link generation is not wired yet, so this
  // records a placeholder row (status 'created') with no fabricated URL.
  if (processorRaw === "stripe") {
    if (!(await stripeAllowed(user.role)))
      return { ok: false, message: "Stripe is not enabled for your account." };
    if (!contactId || !name)
      return { ok: false, message: "Pick a contact for the Stripe link." };
    if (!amount || amount <= 0) return { ok: false, message: "Enter an amount." };

    await sql`
      insert into finance.payment_link (amount_minor, description, customer_name, customer_email, contact_id,
                                        product_id, frequency, installments, processor, external_id, url, status, created_by_user_id)
      values (${amount}, ${(formData.get("description") as string) || null}, ${name}, ${email ?? null},
              ${contactId}, ${productId}, ${frequency}, ${installments}, 'stripe', ${null}, ${null}, 'created', ${user.id})`;
    revalidatePath("/payments");
    return {
      ok: true,
      message: "Stripe link recorded as a placeholder. Live Stripe link generation activates once the Stripe connector is wired.",
    };
  }

  // NMI path (default). Copy the picked contact's name/email; fall back to the
  // free-text fields only when no contact was chosen.
  const result = await createPaymentLink({
    amountMinor: amount,
    description: (formData.get("description") as string) || undefined,
    customerName: name ?? ((formData.get("customerName") as string) || undefined),
    customerEmail: email ?? ((formData.get("customerEmail") as string) || undefined),
    contactId: contactId ?? undefined,
    productId: productId ?? undefined,
    frequency: frequency ?? undefined,
    installments: installments ?? undefined,
    customSchedule,
  }, user.id);
  revalidatePath("/payments");
  return result;
}

// Admin-only "Charge Now": charge a client's saved card (the NMI Customer Vault
// token on a payment link) on demand. Uses the same chargeVault + recordNmiPayment
// primitives as the receivables cron, but tags the payment type 'manual' and
// records the acting admin. Guarded three ways: admin role, a max cap, and a 60s
// same-amount dedupe so a double-submit cannot double-charge a real card.
export async function chargeNowAction(_prev: unknown, formData: FormData) {
  const user = await requireSession();
  if (user.role !== "admin") return { ok: false, message: "Admins only." };

  const linkId = String(formData.get("linkId") ?? "");
  const amount = formData.get("amount") ? Math.round(parseFloat(String(formData.get("amount"))) * 100) : 0;
  if (!linkId) return { ok: false, message: "Missing payment link." };
  if (!amount || amount <= 0) return { ok: false, message: "Enter an amount greater than zero." };
  if (amount > MAX_MANUAL_CHARGE_MINOR) return { ok: false, message: "Amount exceeds the manual-charge limit." };

  const [link] = await sql`
    select id, token, contact_id, nmi_customer_vault_id, customer_name
    from finance.payment_link where id = ${linkId} limit 1`;
  if (!link) return { ok: false, message: "Payment link not found." };
  if (!link.nmi_customer_vault_id) return { ok: false, message: "No saved card on file for this link." };

  // Idempotency: refuse an identical manual charge (same contact + amount) made
  // in the last 60s. successful_payment has no link/vault column, so contact+amount
  // is the tightest available key; the DB's unique nmi_transaction_id only dedupes
  // the *recording*, not a second real NMI sale from a double-click.
  const [recent] = await sql`
    select sp.id from finance.successful_payment sp
    where sp.type = 'manual' and sp.amount_minor = ${amount}
      and sp.contact_id is not distinct from ${link.contact_id ?? null}
      and sp.occurred_at > now() - interval '60 seconds'
    limit 1`;
  if (recent) return { ok: false, message: "An identical charge was just made. Wait a minute before retrying." };

  const res = await chargeVault({ amountMinor: amount, vaultId: link.nmi_customer_vault_id, planId: link.token, orderId: link.id });
  if (!ok(res)) return { ok: false, message: res.responsetext || "The card was declined." };

  await recordNmiPayment({
    linkId: link.id, contactId: link.contact_id ?? null, amountMinor: amount,
    nmiTxnId: res.transactionid, type: "manual", chargedByUserId: user.id, markLinkPaid: false,
  });
  revalidatePath("/payments");
  const usd = (amount / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
  return { ok: true, message: `Charged ${usd} to the saved card.` };
}

// Admin-only toggle for whether Stripe is offered on the payment-links form.
export async function setStripeEnabledAction(_prev: unknown, formData: FormData) {
  const user = await requireSession();
  if (user.role !== "admin") return { ok: false, message: "Admins only" };
  const enabled = String(formData.get("enabled")) === "true";
  await setSetting("payment_links_stripe_enabled", enabled ? "true" : "false");
  revalidatePath("/payments");
  return { ok: true, message: enabled ? "Stripe option enabled." : "Stripe option disabled." };
}
