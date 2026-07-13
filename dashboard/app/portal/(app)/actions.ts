"use server";

import { revalidatePath } from "next/cache";
import { getPortalSession } from "@/lib/portal-auth";
import { getPortalFeatures, cancelCustomerSubscription } from "@/lib/portal";

// Cancel a subscription. The client sends ONLY the linkId; contactId is re-derived
// from the httpOnly session cookie, and the allowCancel flag is re-checked server
// side (never trust the client for either the identity or the feature gate).
export async function cancelSubscriptionAction(linkId: string) {
  const session = await getPortalSession();
  if (!session) return { ok: false as const, message: "Your session has expired. Sign in again." };

  const f = await getPortalFeatures();
  if (!f.allowCancel) return { ok: false as const, message: "Cancellation isn't available." };

  const result = await cancelCustomerSubscription(session.contactId, String(linkId || ""));
  if (result.ok) revalidatePath("/portal");
  return result;
}
