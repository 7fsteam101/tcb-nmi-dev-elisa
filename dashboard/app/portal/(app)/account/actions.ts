"use server";

import { revalidatePath } from "next/cache";
import { getPortalSession } from "@/lib/portal-auth";
import { getPortalFeatures, updatePortalContact } from "@/lib/portal";

// Session comes from the httpOnly cookie — the form carries no contact id, and
// there's nothing tamperable to point at another customer.
export async function saveAccountAction(_prev: unknown, formData: FormData) {
  const session = await getPortalSession();
  if (!session) return { ok: false, message: "Your session has expired. Sign in again." };

  const f = await getPortalFeatures();
  if (!f.editBusinessInfo) return { ok: false, message: "Editing is disabled." };

  await updatePortalContact(session.contactId, {
    first_name: String(formData.get("first_name") || ""),
    last_name: String(formData.get("last_name") || ""),
    company_name: String(formData.get("company_name") || ""),
    website: String(formData.get("website") || ""),
    primary_phone: String(formData.get("primary_phone") || ""),
  });

  revalidatePath("/portal/account");
  revalidatePath("/portal");
  return { ok: true, message: "Saved." };
}
