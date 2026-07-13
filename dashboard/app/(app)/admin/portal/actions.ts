"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { setSetting } from "@/lib/settings";

// Admin-only, same as the rest of /admin (the admin layout already redirects
// non-admins; this is the belt-and-suspenders guard inside each write).
async function guard() {
  const user = await requireSession();
  if (user.role !== "admin") throw new Error("Admins only");
}

// Whitelist: which editor field maps to which app_setting key. Nothing else is
// writable through here. Values are stored as native JSON (booleans -> jsonb
// true/false) via setSetting's sql.json, matching migration 0054's seeds so
// getPortalFeatures() parses them back correctly.
const BOOL_KEYS = {
  showInvoices: "portal_show_invoices",
  showPaymentMethods: "portal_show_payment_methods",
  allowCardUpdate: "portal_allow_card_update",
  editBusinessInfo: "portal_edit_business_info",
  showSubscriptions: "portal_show_subscriptions",
  allowCancel: "portal_allow_cancel",
} as const;
export type PortalBoolField = keyof typeof BOOL_KEYS;

// Portal pages are force-dynamic (they re-read on every request), but revalidate
// them anyway so any cached shell picks up the change immediately.
function bust() {
  revalidatePath("/admin/portal");
  revalidatePath("/portal");
  revalidatePath("/portal/login");
}

export async function setPortalFlagAction(field: PortalBoolField, value: boolean) {
  await guard();
  const key = BOOL_KEYS[field];
  if (!key) throw new Error("Unknown portal flag");
  await setSetting(key, value); // jsonb true / false
  bust();
}

export async function setPortalBrandNameAction(name: string) {
  await guard();
  const v = name.trim() || "The Credit Brothers";
  await setSetting("portal_brand_name", v); // jsonb string
  bust();
  return { ok: true, value: v };
}

export async function setPortalBrandAccentAction(accent: string) {
  await guard();
  // Accept only a plausible hex color; fall back to the default otherwise. This
  // also keeps the value safe wherever the accent is interpolated into styling.
  const v = accent.trim();
  const safe = /^#[0-9a-fA-F]{3,8}$/.test(v) ? v : "#3b82f6";
  await setSetting("portal_brand_accent", safe); // jsonb string
  bust();
  return { ok: true, value: safe };
}
