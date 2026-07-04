import { NextRequest, NextResponse } from "next/server";
import { checkWebhookSecret, bodyHash } from "@/lib/webhook";
import { ensureConnection } from "@/lib/sync/providers";
import { storeAndProcess } from "@/lib/sync/ingest";

export const maxDuration = 60;

// Stripe webhook target (the $25 booking fee). The URL secret gates access;
// add STRIPE_WEBHOOK_SECRET signature verification when the client connects.
export async function POST(req: NextRequest) {
  const denied = checkWebhookSecret(req);
  if (denied) return denied;
  const raw = await req.text();
  const payload = JSON.parse(raw);
  const connectionId = await ensureConnection("stripe", payload.account ?? "default", "Stripe");
  try {
    const result = await storeAndProcess(connectionId, "stripe", payload.id ?? bodyHash(raw), payload.type ?? "event", payload);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, queued_for_retry: true, error: String(err) });
  }
}
