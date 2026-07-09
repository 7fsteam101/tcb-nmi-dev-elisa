import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { bodyHash } from "@/lib/webhook";
import { ensureConnection } from "@/lib/sync/providers";
import { storeAndProcess } from "@/lib/sync/ingest";

export const maxDuration = 60;

// GHL MARKETPLACE-APP native webhooks (configured once in the app's Webhooks
// settings, fires for every installed location). The app's URL field rejects
// query strings, so the shared secret rides in the path:
//   /api/webhooks/ghl/native/<WEBHOOK_SECRET>
// Native payloads differ from our workflow envelope; this route adapts
// AppointmentCreate/Update/Delete, ContactCreate/Update and form events into
// the same tcb_event pipeline the rest of the system uses.
const API = "https://services.leadconnectorhq.com";
const VERSION = "2021-07-28";

async function locationToken(locationId: string): Promise<any | null> {
  const [conn] = await sql`
    select token_secret_ref from sync.connections
    where provider = 'ghl' and external_account_id = ${locationId} and token_secret_ref is not null limit 1`;
  if (!conn) return null;
  const [row] = await sql`select decrypted_secret as v from vault.decrypted_secrets where id = ${conn.token_secret_ref}`;
  try { return JSON.parse(row.v); } catch { return null; }
}

async function fetchContact(locationId: string, contactId: string) {
  try {
    const token = await locationToken(locationId);
    if (!token) return { id: contactId };
    const res = await fetch(`${API}/contacts/${contactId}`, {
      headers: { Authorization: `Bearer ${token.access_token}`, Version: VERSION, Accept: "application/json" },
    });
    if (!res.ok) return { id: contactId };
    const c = (await res.json()).contact ?? {};
    return {
      id: c.id ?? contactId,
      name: c.name ?? [c.firstName, c.lastName].filter(Boolean).join(" "),
      first_name: c.firstName, last_name: c.lastName, email: c.email, phone: c.phone,
    };
  } catch { return { id: contactId }; }
}

// Map a native event into our envelope (null = ignore this event type).
async function adapt(payload: any): Promise<{ event: string; envelope: any } | null> {
  const type = String(payload.type ?? "");
  const locationId = payload.locationId ?? payload.location_id ?? "default";

  if (type.startsWith("Appointment")) {
    const a = payload.appointment ?? payload;
    const status = String(a.appointmentStatus ?? a.status ?? "").toLowerCase();
    let event =
      type === "AppointmentCreate" ? "appointment_booked"
      : status === "confirmed" ? "appointment_confirmed"
      : status === "showed" ? "appointment_showed"
      : status === "noshow" || status === "no_show" ? "appointment_no_show"
      : status === "cancelled" || status === "canceled" ? "appointment_cancelled_by_lead"
      : "appointment_rescheduled"; // update with no terminal status = time moved
    const contact = a.contactId ? await fetchContact(locationId, a.contactId) : {};
    return {
      event,
      envelope: {
        tcb_event: event, location_id: locationId, contact,
        appointment: { id: a.id, start_time: a.startTime ?? a.start_time, calendar_id: a.calendarId ?? a.calendar_id, calendar_name: a.calendarName ?? null },
      },
    };
  }

  if (type === "ContactCreate" || type === "ContactUpdate") {
    const c = payload.contact ?? payload;
    return {
      event: "contact_upserted",
      envelope: {
        tcb_event: "contact_upserted", location_id: locationId,
        contact: { id: c.id, name: c.name ?? [c.firstName, c.lastName].filter(Boolean).join(" "), first_name: c.firstName, last_name: c.lastName, email: c.email, phone: c.phone },
      },
    };
  }

  if (/form/i.test(type)) {
    const s = payload.submission ?? payload;
    const o = s.others ?? payload.others ?? {};
    return {
      event: "form_submitted",
      envelope: {
        tcb_event: "form_submitted", location_id: locationId,
        contact: { id: s.contactId ?? payload.contactId, email: s.email ?? payload.email, name: s.name ?? payload.name, phone: s.phone ?? payload.phone },
        form: { id: s.formId ?? payload.formId ?? null, source: "meta_ads", campaign: o.utm_campaign ?? null, utm: o.utm_source ? `${o.utm_source}/${o.utm_medium ?? ""}` : null },
      },
    };
  }

  return null; // other native events (messages, invoices, ...) are not ours
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  if (!process.env.WEBHOOK_SECRET || key !== process.env.WEBHOOK_SECRET)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const raw = await req.text();
  let payload: any;
  try { payload = JSON.parse(raw); } catch { return NextResponse.json({ error: "invalid JSON" }, { status: 400 }); }

  const adapted = await adapt(payload);
  if (!adapted) return NextResponse.json({ ok: true, ignored: payload.type ?? "unknown" });

  const locationId = adapted.envelope.location_id;
  const connectionId = await ensureConnection("ghl", locationId, `GHL location ${locationId}`);
  try {
    const result = await storeAndProcess(connectionId, "ghl", payload.webhookId ?? bodyHash(raw), adapted.event, adapted.envelope);
    return NextResponse.json({ ok: true, ...result });
  } catch (err) {
    return NextResponse.json({ ok: false, queued_for_retry: true, error: String(err) });
  }
}
