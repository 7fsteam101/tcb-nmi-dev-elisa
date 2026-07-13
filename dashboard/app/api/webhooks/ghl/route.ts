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
  // GHL's Custom Webhook action sends FLAT key/value custom data. If the nested
  // envelope is absent, lift the flat keys into it so workflows can be built
  // with simple fields (contact_id, appointment_id, ...) instead of raw JSON.
  if (!payload.contact && (payload.contact_id || payload.contact_email || payload.contact_name)) {
    payload.contact = { id: payload.contact_id, name: payload.contact_name, email: payload.contact_email, phone: payload.contact_phone };
  }
  if (!payload.appointment && (payload.appointment_id || payload.appointment_start_time)) {
    payload.appointment = { id: payload.appointment_id, start_time: payload.appointment_start_time, calendar_id: payload.calendar_id, calendar_name: payload.calendar_name };
  }
  if (!payload.form && payload.tcb_event === "form_submitted") {
    payload.form = { id: payload.form_id ?? null, source: payload.source ?? "meta_ads", campaign: payload.utm_campaign ?? null, utm: payload.utm_source ? `${payload.utm_source}/${payload.utm_medium ?? ""}` : null };
  }
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
