"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { setSetting } from "@/lib/settings";

// The GHL sub-account location ids power the deep links on contacts
// (app.gohighlevel.com/v2/location/<id>/contacts/detail/<contactId>).
export async function setGhlLocationsAction(_prev: unknown, formData: FormData) {
  const user = await requireSession();
  if (user.role !== "admin") return { ok: false, message: "Admins only" };
  await setSetting("ghl_marketing_location_id", String(formData.get("marketing") ?? "").trim());
  await setSetting("ghl_repair_location_id", String(formData.get("repair") ?? "").trim());
  revalidatePath("/connections");
  revalidatePath("/contacts", "layout");
  return { ok: true, message: "Saved. GHL deep links are now enabled on contacts." };
}
