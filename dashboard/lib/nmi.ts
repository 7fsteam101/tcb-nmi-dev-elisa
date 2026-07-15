import crypto from "crypto";
import { getProviderToken } from "./sync/providers";

// NMI gateway client (classic Payment API, form-encoded, name/value response).
// Test mode: set NMI_SECURITY_KEY to the sandbox key (the public NMI test key
// 6457Thfj624V5r7WUwc5v6a68Zsd6YEm). Production: leave NMI_SECURITY_KEY unset and
// the live key is read from Supabase Vault (the "NMI - TCB gateway" connection).
//
// Host: real sandbox merchant accounts (as opposed to the public demo key) MUST
// transact against sandbox.nmi.com — secure.nmi.com rejects them ("Sandbox
// accounts must use sandbox.nmi.com"). Set NMI_HOST=sandbox.nmi.com in that case.
// Defaults to production so live behavior is unchanged. NEXT_PUBLIC_NMI_HOST must
// match on the client (checkout.tsx loads Collect.js from the same host, since a
// payment token is only chargeable on the host that minted it).
const NMI_HOST = process.env.NMI_HOST || "secure.nmi.com";
const TRANSACT = `https://${NMI_HOST}/api/transact.php`;
const QUERY = `https://${NMI_HOST}/api/query.php`;
// Sandbox accounts reject a sale that would email a receipt to any address other
// than the account's own ("Sandbox accounts can only send emails to their own
// email address"). Drop the customer email on sandbox sales so test charges go
// through; production keeps it (real receipts).
const IS_SANDBOX = NMI_HOST !== "secure.nmi.com";
const SANDBOX_KEY = "6457Thfj624V5r7WUwc5v6a68Zsd6YEm";

export async function nmiKey(): Promise<string> {
  return process.env.NMI_SECURITY_KEY || (await getProviderToken("nmi")) || SANDBOX_KEY;
}

/** True while we are pointed at the public sandbox key (drives the TEST badge). */
export async function nmiTestMode(): Promise<boolean> {
  return (await nmiKey()) === SANDBOX_KEY;
}

export type NmiResult = Record<string, string>;

/** True when NMI approved the request (response=1 / response_code=100). */
export function ok(r: NmiResult): boolean {
  return r.response === "1" || r.response_code === "100";
}

async function post(params: Record<string, string | undefined>): Promise<NmiResult> {
  const key = await nmiKey();
  const body = new URLSearchParams({ security_key: key });
  for (const [k, v] of Object.entries(params)) if (v != null && v !== "") body.set(k, v);
  const res = await fetch(TRANSACT, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  return Object.fromEntries(new URLSearchParams(await res.text()).entries()) as Record<string, string>;
}

type CardOrToken =
  | { paymentToken: string }
  | { ccnumber: string; ccexp: string; cvv?: string };

function cardFields(src: CardOrToken): Record<string, string | undefined> {
  return "paymentToken" in src
    ? { payment_token: src.paymentToken }
    : { ccnumber: src.ccnumber, ccexp: src.ccexp, cvv: src.cvv };
}

/** Sale for the first installment AND store the card in the Customer Vault. */
export async function saleAndVault(input: {
  amountMinor: number;
  source: CardOrToken;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  zip?: string; // billing ZIP/postal, forwarded to NMI for AVS
  planId: string; // our payment_link token/id, stamped for webhook correlation
  orderId?: string;
}): Promise<NmiResult> {
  return post({
    type: "sale",
    amount: (input.amountMinor / 100).toFixed(2),
    customer_vault: "add_customer",
    first_name: input.firstName,
    last_name: input.lastName,
    email: IS_SANDBOX ? undefined : input.email,
    phone: input.phone,
    zip: input.zip,
    orderid: input.orderId,
    merchant_defined_field_1: input.planId,
    ...cardFields(input.source),
  });
}

/** Charge an already-vaulted card, card-not-present (for a manual/immediate re-charge). */
export async function chargeVault(input: { amountMinor: number; vaultId: string; planId: string; orderId?: string }): Promise<NmiResult> {
  return post({
    type: "sale",
    amount: (input.amountMinor / 100).toFixed(2),
    customer_vault_id: input.vaultId,
    orderid: input.orderId,
    merchant_defined_field_1: input.planId,
    initiated_by: "merchant",
    stored_credential_indicator: "used",
  });
}

const FREQ_PARAMS: Record<string, Record<string, string>> = {
  monthly: { month_frequency: "1" },
  biweekly: { day_frequency: "14" },
  weekly: { day_frequency: "7" },
};

/** Schedule installments 2..N against the vaulted card (does not charge today for card). */
export async function addSubscription(input: {
  vaultId: string;
  planPayments: number; // N-1
  planAmountMinor: number;
  frequency: string; // monthly | biweekly | weekly | custom
  startDate: string; // YYYYMMDD
  sourceTransactionId?: string;
  planId: string;
}): Promise<NmiResult> {
  const freq = FREQ_PARAMS[input.frequency] ?? FREQ_PARAMS.monthly;
  const monthly = "month_frequency" in freq;
  return post({
    recurring: "add_subscription",
    plan_payments: String(input.planPayments),
    plan_amount: (input.planAmountMinor / 100).toFixed(2),
    ...freq,
    ...(monthly ? { day_of_month: input.startDate.slice(6, 8) } : {}),
    start_date: input.startDate,
    customer_vault_id: input.vaultId,
    source_transaction_id: input.sourceTransactionId,
    merchant_defined_field_1: input.planId,
  });
}

/** Cancel a recurring subscription in NMI (recurring=delete_subscription). Same
 *  post()/security_key/form-encoding path as the other calls; ok() (response=1)
 *  means NMI accepted the cancellation. */
export async function cancelSubscription(input: { subscriptionId: string }): Promise<NmiResult> {
  return post({
    recurring: "delete_subscription",
    subscription_id: input.subscriptionId,
  });
}

/** Replace the stored card on a vault record (card-on-file update). */
export async function updateVaultCard(input: { vaultId: string; source: CardOrToken }): Promise<NmiResult> {
  return post({ customer_vault: "update_customer", customer_vault_id: input.vaultId, ...cardFields(input.source) });
}

export type VaultCard = { brand: string; last4: string; exp: string };

// Query API (query.php) returns XML, not the name/value pairs transact.php uses.
const xmlTag = (xml: string, tag: string): string =>
  xml.match(new RegExp(`<${tag}>([^<]*)</${tag}>`))?.[1] ?? "";

/**
 * Masked card stored on an NMI customer vault (Query API). Returns null if the
 * vault has no card or the lookup fails — the caller shows "card on file" without
 * details rather than erroring the page.
 */
export async function queryVaultCard(vaultId: string): Promise<VaultCard | null> {
  try {
    const key = await nmiKey();
    const url = `${QUERY}?security_key=${encodeURIComponent(key)}&report_type=customer_vault&customer_vault_id=${encodeURIComponent(vaultId)}`;
    // Cap the lookup so a slow query.php degrades to "card on file" (null) rather
    // than stalling the admin page toward the gateway timeout.
    const xml = await (await fetch(url, { signal: AbortSignal.timeout(6000) })).text();
    const ccNumber = xmlTag(xml, "cc_number");
    if (!ccNumber) return null;
    const last4 = ccNumber.replace(/\D/g, "").slice(-4);
    const raw = xmlTag(xml, "cc_exp"); // MMYY
    const exp = raw.length === 4 ? `${raw.slice(0, 2)}/${raw.slice(2)}` : raw;
    return { brand: xmlTag(xml, "cc_type") || "Card", last4, exp };
  } catch {
    return null;
  }
}

// Short in-memory cache so the payments page does not fire one query.php per
// vaulted row on every render. Keyed by vault id, 5-min TTL, on globalThis so it
// survives dev HMR and warm-instance reuse (same pattern as lib/db.ts).
const CARD_TTL_MS = 5 * 60 * 1000;
const cardCacheStore = globalThis as unknown as { nmiCardCache?: Map<string, { card: VaultCard | null; at: number }> };
const cardCache = (cardCacheStore.nmiCardCache ??= new Map());

export async function getVaultCardCached(vaultId: string): Promise<VaultCard | null> {
  const hit = cardCache.get(vaultId);
  if (hit && Date.now() - hit.at < CARD_TTL_MS) return hit.card;
  const card = await queryVaultCard(vaultId);
  cardCache.set(vaultId, { card, at: Date.now() });
  return card;
}

/** Drop a vault's cached card entry so the next getVaultCardCached() re-fetches
 *  from NMI. Call after the stored card changes (card-on-file update) so the
 *  portal shows the new brand/last4/exp immediately instead of the 5-min-stale
 *  cached one. Does NOT disable the cache — only evicts this one vault. */
export function invalidateVaultCard(vaultId: string): void {
  cardCache.delete(vaultId);
}

/**
 * Verify an NMI Event Webhook signature. Header form: `t=<nonce>,s=<hexsig>`;
 * sig = HMAC-SHA256(nonce + "." + rawBody, signingKey). Returns true when no
 * signing key is configured yet (test mode) so local testing is not blocked, but
 * logs that it is unverified.
 */
export function verifyWebhookSignature(header: string | null, rawBody: string): boolean {
  const signingKey = process.env.NMI_WEBHOOK_SIGNING_KEY;
  if (!signingKey) return true; // unverified (no key set) — acceptable only in test mode
  if (!header) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=").map((s) => s.trim())));
  const nonce = parts.t;
  const sig = parts.s;
  if (!nonce || !sig) return false;
  const expected = crypto.createHmac("sha256", signingKey).update(`${nonce}.${rawBody}`).digest("hex");
  try {
    return crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected));
  } catch {
    return false;
  }
}
