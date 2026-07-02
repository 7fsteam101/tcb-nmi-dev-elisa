import { NextRequest, NextResponse } from "next/server";
import { checkWebhookSecret, bodyHash } from "@/lib/webhook";
import { ensureConnection } from "@/lib/sync/providers";
import { storeAndProcess } from "@/lib/sync/ingest";

// NMI silent-post / webhook target (program payments). Accepts JSON or
// form-encoded posts.
export async function POST(req: NextRequest) {
  const denied = checkWebhookSecret(req);
  if (denied) return denied;
  const raw = await req.text();
  let payload: Record<string, unknown>;
  try {
    payload = JSON.parse(raw);
  } catch {
    payload = Object.fromEntries(new URLSearchParams(raw).entries());
  }
  const externalId = (payload.transactionid as string) ?? (payload.transaction_id as string) ?? bodyHash(raw);
  const connectionId = await ensureConnection("nmi", "default", "NMI");
  try {
    const result = await storeAndProcess(connectionId, "nmi", externalId, "payment", payload);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, queued_for_retry: true, error: String(err) });
  }
}
