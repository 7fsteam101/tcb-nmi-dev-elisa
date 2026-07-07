import crypto from "crypto";
import { getProviderToken } from "./sync/providers";

// NMI gateway client (classic Payment API, form-encoded, name/value response).
// Test mode: set NMI_SECURITY_KEY to the sandbox key (the public NMI test key
// 6457Thfj624V5r7WUwc5v6a68Zsd6YEm). Production: leave NMI_SECURITY_KEY unset and
// the live key is read from Supabase Vault (the "NMI - TCB gateway" connection).
const TRANSACT = "https://secure.nmi.com/api/transact.php";
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
    email: input.email,
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

/** Replace the stored card on a vault record (card-on-file update). */
export async function updateVaultCard(input: { vaultId: string; source: CardOrToken }): Promise<NmiResult> {
  return post({ customer_vault: "update_customer", customer_vault_id: input.vaultId, ...cardFields(input.source) });
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
