import { NextRequest, NextResponse } from "next/server";
import { checkWebhookSecret, bodyHash } from "@/lib/webhook";
import { ensureConnection } from "@/lib/sync/providers";
import { storeAndProcess } from "@/lib/sync/ingest";

export const maxDuration = 60;

// Target for GHL WORKFLOW custom webhooks (both sub-accounts). Each workflow
// posts our envelope: { tcb_event, location_id, contact{}, appointment{}, form{}, reason, moved_by }
// tcb_event: appointment_booked | appointment_rescheduled | appointment_confirmed |
//            appointment_cancelled_by_lead | appointment_cancelled_by_team |
//            appointment_no_show | appointment_showed | form_submitted | intake_submitted
export async function POST(req: NextRequest) {
  const denied = checkWebhookSecret(req);
  if (denied) return denied;
  const raw = await req.text();
  let payload: any;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }
  const locationId = payload.location_id ?? req.nextUrl.searchParams.get("location") ?? "default";
  const eventType = payload.tcb_event ?? "unknown";
  const connectionId = await ensureConnection("ghl", locationId, `GHL location ${locationId}`);
  try {
    const result = await storeAndProcess(connectionId, "ghl", bodyHash(raw), eventType, payload);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, queued_for_retry: true, error: String(err) });
  }
}
