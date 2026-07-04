import { NextRequest, NextResponse } from "next/server";
import { checkWebhookSecret, bodyHash } from "@/lib/webhook";
import { ensureConnection } from "@/lib/sync/providers";
import { storeAndProcess } from "@/lib/sync/ingest";

export const maxDuration = 60;

// Close webhook subscription target. Subscribe (once the API key is in) to
// lead + opportunity created/updated events.
export async function POST(req: NextRequest) {
  const denied = checkWebhookSecret(req);
  if (denied) return denied;
  const raw = await req.text();
  const payload = JSON.parse(raw);
  const event = payload?.event ?? {};
  const externalId = event.id ?? bodyHash(raw);
  const eventType = `${event.object_type ?? "unknown"}.${event.action ?? "event"}`;
  const connectionId = await ensureConnection("close", event.organization_id ?? "default", "Close");
  try {
    const result = await storeAndProcess(connectionId, "close", externalId, eventType, payload);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    // 200 so Close does not disable the subscription; the failure is queued for the retry sweep
    return NextResponse.json({ ok: false, queued_for_retry: true, error: String(err) });
  }
}
