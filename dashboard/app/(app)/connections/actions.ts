"use server";

import { revalidatePath } from "next/cache";
import { requireSession } from "@/lib/auth";
import { saveProviderKey, type Provider } from "@/lib/sync/providers";
import { dispatchPending } from "@/lib/sync/writeback";

export async function saveKeyAction(_prev: unknown, formData: FormData) {
  const user = await requireSession();
  if (user.role !== "admin") return { ok: false, message: "Only admins can manage connections" };
  const provider = String(formData.get("provider")) as Provider;
  const key = String(formData.get("key") ?? "").trim();
  const accountId = String(formData.get("accountId") ?? "default").trim() || "default";
  const label = String(formData.get("label") ?? provider).trim() || provider;
  if (!key) return { ok: false, message: "Paste the key" };
  try {
    await saveProviderKey(provider, key, accountId, label);
    const d = await dispatchPending(); // release anything that was waiting on this key
    revalidatePath("/connections");
    return { ok: true, message: `Saved to the vault. ${d.sent > 0 ? `${d.sent} queued write-back(s) pushed.` : ""}` };
  } catch (err) {
    return { ok: false, message: String(err instanceof Error ? err.message : err) };
  }
}
