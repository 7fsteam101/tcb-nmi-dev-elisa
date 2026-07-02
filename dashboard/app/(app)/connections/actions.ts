"use server";

import { headers } from "next/headers";
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
    const extras: string[] = [];
    if (provider === "close") extras.push(await subscribeCloseWebhooks(key));
    const d = await dispatchPending(); // release anything that was waiting on this key
    if (d.sent > 0) extras.push(`${d.sent} queued write-back(s) pushed.`);
    revalidatePath("/connections");
    return { ok: true, message: `Saved to the vault. ${extras.join(" ")}` };
  } catch (err) {
    return { ok: false, message: String(err instanceof Error ? err.message : err) };
  }
}

/** Saving a Close key auto-subscribes Close's webhooks to this app — zero manual setup. */
async function subscribeCloseWebhooks(key: string): Promise<string> {
  try {
    const h = await headers();
    const url = `https://${h.get("host")}/api/webhooks/close?secret=${process.env.WEBHOOK_SECRET}`;
    const auth = "Basic " + Buffer.from(`${key}:`).toString("base64");
    const existing = await fetch("https://api.close.com/api/v1/webhook/", { headers: { Authorization: auth } });
    if (!existing.ok) return `Key saved, but Close webhook check failed (${existing.status}).`;
    const body = await existing.json();
    if ((body.data ?? []).some((w: any) => w.url === url && w.status === "active"))
      return "Close webhooks already subscribed.";
    const res = await fetch("https://api.close.com/api/v1/webhook/", {
      method: "POST",
      headers: { Authorization: auth, "Content-Type": "application/json" },
      body: JSON.stringify({
        url,
        events: [
          { object_type: "lead", action: "created" },
          { object_type: "lead", action: "updated" },
          { object_type: "opportunity", action: "created" },
          { object_type: "opportunity", action: "updated" },
        ],
      }),
    });
    if (!res.ok) return `Key saved, but the webhook subscription failed (${res.status} ${await res.text()}).`;
    return "Close webhooks subscribed — lead and opportunity changes now flow in automatically.";
  } catch (err) {
    return `Key saved; webhook auto-subscribe hit an error (${String(err)}). It can be retried by saving the key again.`;
  }
}
