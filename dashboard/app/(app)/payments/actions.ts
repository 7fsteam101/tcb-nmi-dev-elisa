"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/settings";
import { createPaymentLink } from "@/lib/nmi-links";

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
                                        processor, external_id, url, status, created_by_user_id)
      values (${amount}, ${(formData.get("description") as string) || null}, ${name}, ${email ?? null},
              ${contactId}, 'stripe', ${null}, ${null}, 'created', ${user.id})`;
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
  }, user.id);
  revalidatePath("/payments");
  return result;
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
