import crypto from "crypto";
import { sql } from "./db";
import { getVaultCardCached, cancelSubscription, ok, type VaultCard } from "./nmi";

// =============================================================================
// Customer Billing Portal — data layer (v1)
//
// The ONE security invariant: every function here takes a contactId that came
// out of getPortalSession(token). Never accept a contactId straight off the URL
// or a form field. The token is the only trusted input; contactId is derived.
// =============================================================================

export type PortalSession = { token: string; contactId: string };

/**
 * Resolve a portal token to its customer. Returns null for unknown, revoked, or
 * expired tokens. This is THE gate — call it first in every page/route under
 * /portal, and scope everything else by the contactId it returns.
 */
export async function getPortalSession(token: string): Promise<PortalSession | null> {
  if (!token) return null;
  const rows = await sql`
    select contact_id
    from core.portal_token
    where token = ${token}
      and revoked_at is null
      and (expires_at is null or expires_at > now())`;
  if (!rows.length) return null;
  return { token, contactId: rows[0].contact_id as string };
}

/** Mint a portal link for a contact. Admin-side helper (used later by the panel). */
export async function createPortalToken(
  contactId: string,
  opts?: { expiresAt?: Date; userId?: string }
): Promise<string> {
  const token = crypto.randomUUID().replace(/-/g, "");
  await sql`
    insert into core.portal_token (token, contact_id, expires_at, created_by_user_id)
    values (${token}, ${contactId}, ${opts?.expiresAt?.toISOString() ?? null}, ${opts?.userId ?? null})`;
  return token;
}

// -----------------------------------------------------------------------------
// Customer identity + editable business info
// -----------------------------------------------------------------------------

export type PortalCustomer = {
  id: string;
  full_name: string;
  first_name: string | null;
  last_name: string | null;
  primary_email: string | null; // shown, NOT editable (Stripe parity)
  primary_phone: string | null;
  company_name: string | null;
  website: string | null;
};

export async function getPortalCustomer(contactId: string): Promise<PortalCustomer | null> {
  const rows = await sql`
    select id, full_name, first_name, last_name, primary_email, primary_phone, company_name, website
    from core.contact
    where id = ${contactId}`;
  return rows.length ? (rows[0] as PortalCustomer) : null;
}

/**
 * Update the customer's own business info. Whitelisted columns only — never
 * email (parity with Stripe's read-only email), never lifecycle/owner/ids.
 * full_name is recomputed from first+last when both are given so it stays in sync.
 */
export async function updatePortalContact(
  contactId: string,
  f: { first_name?: string; last_name?: string; company_name?: string; website?: string; primary_phone?: string }
): Promise<void> {
  const first = f.first_name?.trim() || null;
  const last = f.last_name?.trim() || null;
  const full = first && last ? `${first} ${last}` : null;
  await sql`
    update core.contact set
      first_name    = coalesce(${first}, first_name),
      last_name     = coalesce(${last}, last_name),
      full_name     = coalesce(${full}, full_name),
      company_name  = ${f.company_name?.trim() || null},
      website       = ${f.website?.trim() || null},
      primary_phone = ${f.primary_phone?.trim() || null},
      updated_at    = now()
    where id = ${contactId}`;
  // NOTE (v1 -> v1.x): if portal edits must reach Close/GHL, enqueue a
  // sync.writeback_queue row here. Left local-only for v1 by decision.
}

// -----------------------------------------------------------------------------
// Invoice / payment history
//
// Two sources, both reliably scoped by contact:
//   invoices  = finance.payment_link  (contact_id is a real column)
//   receipts  = finance.successful_payment via deal.contact_id (verified join)
//
// VERIFY-AGAINST-MERGED-SCHEMA: the canonical merge added contact_id stamping on
// live payments (commit 9e37829). If finance.successful_payment now has a direct
// contact_id column, you can simplify listCustomerReceipts to a single WHERE
// instead of the deal join below — both are correct; the join is the safe floor.
// -----------------------------------------------------------------------------

export type PortalInvoice = {
  id: string;
  description: string | null;
  amount_minor: number;
  status: string;
  token: string | null;                 // link token, for the reused /pay/<token>/card flow
  nmi_customer_vault_id: string | null;
  nmi_subscription_id: string | null;
  created_at: string;
};

export async function listCustomerInvoices(contactId: string): Promise<PortalInvoice[]> {
  const rows = await sql`
    select id, description, amount_minor, status, token,
           nmi_customer_vault_id, nmi_subscription_id, created_at
    from finance.payment_link
    where contact_id = ${contactId}
    order by created_at desc`;
  return rows as unknown as PortalInvoice[];
}

export type PortalReceipt = {
  id: string;
  amount_minor: number;
  type: string;
  processor: string;
  occurred_at: string;
  nmi_transaction_id: string | null;
  stripe_charge_id: string | null;
};

export async function listCustomerReceipts(contactId: string): Promise<PortalReceipt[]> {
  const rows = await sql`
    select sp.id, sp.amount_minor, sp.type, sp.processor, sp.occurred_at,
           sp.nmi_transaction_id, sp.stripe_charge_id
    from finance.successful_payment sp
    join sales.deal d on d.id = sp.deal_id
    where d.contact_id = ${contactId}
    order by sp.occurred_at desc`;
  return rows as unknown as PortalReceipt[];
}

// -----------------------------------------------------------------------------
// Upcoming schedule (receivables via deal.contact_id)
// -----------------------------------------------------------------------------

export type PortalScheduleItem = {
  id: string;
  installment_no: number;
  due_date: string;
  amount_minor: number;
  status: string;
  paid_at: string | null;
};

export async function listCustomerSchedule(contactId: string): Promise<PortalScheduleItem[]> {
  const rows = await sql`
    select r.id, r.installment_no, r.due_date, r.amount_minor, r.status, r.paid_at
    from finance.receivable r
    join sales.deal d on d.id = r.deal_id
    where d.contact_id = ${contactId}
    order by r.due_date asc`;
  return rows as unknown as PortalScheduleItem[];
}

// -----------------------------------------------------------------------------
// Payment methods (cards on file)
//
// A vault lives on a payment_link, so a customer's cards on file = the distinct
// vault ids across their links. Each card links back to its link token so the
// customer can update it through the EXISTING /pay/<token>/card flow (no new
// route in v1).
// -----------------------------------------------------------------------------

export type PortalCard = {
  vaultId: string;
  linkToken: string | null;             // powers the reused update-card page
  description: string | null;
  card: VaultCard | null;               // { brand, last4, exp } or null if lookup fails
};

export async function listCustomerCardsOnFile(contactId: string): Promise<PortalCard[]> {
  // distinct vault per customer; keep the most recent link per vault for the token + label
  const rows = await sql`
    select distinct on (nmi_customer_vault_id)
           nmi_customer_vault_id as vault_id, token, description
    from finance.payment_link
    where contact_id = ${contactId}
      and nmi_customer_vault_id is not null
    order by nmi_customer_vault_id, created_at desc`;
  // Resolve card details sequentially (cached, 5-min TTL). Sequential on purpose:
  // the pooler is max:4 and fan-out here can spike it (learned in the payments page).
  const out: PortalCard[] = [];
  for (const r of rows as unknown as { vault_id: string; token: string | null; description: string | null }[]) {
    out.push({
      vaultId: r.vault_id,
      linkToken: r.token,
      description: r.description,
      card: await getVaultCardCached(r.vault_id),
    });
  }
  return out;
}

// -----------------------------------------------------------------------------
// Subscriptions (view-only in v1; cancel ships with the admin toggle + nmi cancel)
// -----------------------------------------------------------------------------

export type PortalSubscription = {
  linkId: string;
  subscriptionId: string;
  description: string | null;
  amount_minor: number;
  status: string;
  created_at: string;
};

export async function listCustomerSubscriptions(contactId: string): Promise<PortalSubscription[]> {
  // Quoted aliases preserve camelCase (Postgres lowercases unquoted identifiers),
  // so the returned rows match PortalSubscription (linkId/subscriptionId) exactly —
  // an unquoted `as link_id` would give s.link_id and leave s.linkId undefined.
  const rows = await sql`
    select id as "linkId", nmi_subscription_id as "subscriptionId",
           description, amount_minor, status, created_at
    from finance.payment_link
    where contact_id = ${contactId}
      and nmi_subscription_id is not null
    order by created_at desc`;
  return rows as unknown as PortalSubscription[];
}

export type CancelResult = { ok: true } | { ok: false; message: string };

/**
 * Cancel one of THIS customer's subscriptions. Ownership is re-verified against
 * contactId (never trust a client-supplied linkId alone): the payment_link must
 * belong to the contact and carry an nmi_subscription_id. On NMI success the row
 * is marked 'void' — the closest cancelled state the chk_payment_link_status
 * constraint allows ('created','sent','pending','viewed','paid','failed',
 * 'expired','void','refunded') — so the portal stops showing it as active.
 */
export async function cancelCustomerSubscription(contactId: string, linkId: string): Promise<CancelResult> {
  // Guard: an empty/blank id would make `where id = ''` throw
  // "invalid input syntax for type uuid". Fail cleanly instead.
  if (!linkId || !linkId.trim()) return { ok: false, message: "Missing subscription reference. Please refresh and try again." };
  const rows = await sql`
    select id, nmi_subscription_id, status
    from finance.payment_link
    where id = ${linkId} and contact_id = ${contactId} and nmi_subscription_id is not null
    limit 1`;
  if (!rows.length) return { ok: false, message: "Subscription not found." };
  const subscriptionId = rows[0].nmi_subscription_id as string;

  const res = await cancelSubscription({ subscriptionId });
  if (!ok(res)) {
    return { ok: false, message: res.responsetext ? String(res.responsetext) : "The subscription could not be cancelled. Please try again." };
  }

  await sql`update finance.payment_link set status = 'void' where id = ${linkId}`;
  return { ok: true };
}

// -----------------------------------------------------------------------------
// Feature flags + branding (single query — pooler-safe, no fan-out)
// -----------------------------------------------------------------------------

export type PortalFeatures = {
  showInvoices: boolean;
  showPaymentMethods: boolean;
  allowCardUpdate: boolean;
  editBusinessInfo: boolean;
  showSubscriptions: boolean;
  allowCancel: boolean;
  brandName: string;
  brandAccent: string;
};

export async function getPortalFeatures(): Promise<PortalFeatures> {
  const rows = await sql`select key, value from core.app_setting where key like 'portal_%'`;
  const m = new Map((rows as unknown as { key: string; value: unknown }[]).map((r) => [r.key, r.value]));
  const b = (k: string, d: boolean) => (m.has(k) ? m.get(k) === true : d);
  const s = (k: string, d: string) => (m.has(k) ? String(m.get(k)) : d);
  return {
    showInvoices: b("portal_show_invoices", true),
    showPaymentMethods: b("portal_show_payment_methods", true),
    allowCardUpdate: b("portal_allow_card_update", true),
    editBusinessInfo: b("portal_edit_business_info", true),
    showSubscriptions: b("portal_show_subscriptions", true),
    allowCancel: b("portal_allow_cancel", false),
    brandName: s("portal_brand_name", "The Credit Brothers"),
    brandAccent: s("portal_brand_accent", "#3b82f6"),
  };
}

// -----------------------------------------------------------------------------
// One-shot loader for pages: session + customer + features, or null to 404.
// -----------------------------------------------------------------------------

export type PortalContext = {
  session: PortalSession;
  customer: PortalCustomer;
  features: PortalFeatures;
};

export async function loadPortal(token: string): Promise<PortalContext | null> {
  const session = await getPortalSession(token);
  if (!session) return null;
  const [customer, features] = [await getPortalCustomer(session.contactId), await getPortalFeatures()];
  if (!customer) return null;
  return { session, customer, features };
}

export const money = (m: number) =>
  (m / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
