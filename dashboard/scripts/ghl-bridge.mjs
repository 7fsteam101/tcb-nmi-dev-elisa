// GHL backfill bridge (plain JS): pulls calendars/appointments/contacts/forms
// from the GHL API and feeds each event through the DEPLOYED /api/webhooks/ghl
// endpoint, so all normalization runs in prod code. Exists because local
// tsx/esbuild breaks on Node 25; logic mirrors lib/sync/ghl.ts syncGhlLocation.
// Idempotent end to end (raw_events dedupes by body hash) — safe to rerun.
import postgres from "postgres";

const API = "https://services.leadconnectorhq.com";
const VERSION = "2021-07-28";
const HOOK = `https://tcb-sales-system.vercel.app/api/webhooks/ghl?secret=${process.env.WEBHOOK_SECRET}`;
const sql = postgres(process.env.DATABASE_URL, { ssl: "require", prepare: false, fetch_types: false, max: 3 });

const ghlGet = async (token, path) => {
  const res = await fetch(`${API}${path}`, { headers: { Authorization: `Bearer ${token.access_token}`, Version: VERSION, Accept: "application/json" } });
  if (!res.ok) throw new Error(`GHL GET ${path} -> ${res.status} ${(await res.text()).slice(0, 120)}`);
  return res.json();
};

async function freshToken(conn) {
  const [row] = await sql`select decrypted_secret as v from vault.decrypted_secrets where id = ${conn.token_secret_ref}`;
  let token = JSON.parse(row.v);
  if (Date.now() < token.expires_at - 300_000) return token;
  const res = await fetch(`${API}/oauth/token`, {
    method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: process.env.GHL_CLIENT_ID, client_secret: process.env.GHL_CLIENT_SECRET, grant_type: "refresh_token", refresh_token: token.refresh_token }),
  });
  if (!res.ok) throw new Error(`token refresh failed: ${res.status}`);
  const f = await res.json();
  token = { access_token: f.access_token, refresh_token: f.refresh_token ?? token.refresh_token, expires_at: Date.now() + (f.expires_in ?? 86000) * 1000, location_id: token.location_id };
  await sql`select vault.update_secret(${conn.token_secret_ref}, ${JSON.stringify(token)})`;
  return token;
}

function statusEvents(appt) {
  const out = [{ type: "booked", event: "appointment_booked" }];
  const s = String(appt.appointmentStatus ?? appt.status ?? "").toLowerCase();
  if (s === "confirmed") out.push({ type: "status", event: "appointment_confirmed" });
  if (s === "showed") out.push({ type: "status", event: "appointment_showed" });
  if (s === "noshow" || s === "no_show") out.push({ type: "status", event: "appointment_no_show" });
  if (s === "cancelled" || s === "canceled") out.push({ type: "status", event: "appointment_cancelled_by_lead" });
  return out;
}
const normalizeGoal = (v) => {
  const s = String(v ?? "").toLowerCase();
  if (s.includes("house") || s.includes("home")) return "house";
  if (s.includes("car") || s.includes("auto")) return "car";
  if (s.includes("card")) return "credit_cards";
  if (s.includes("business")) return "business_credit";
  return "other";
};
const pickFormFields = (s) => {
  const o = s.others ?? {};
  const find = (k) => o[k] ?? o[k.replace(/_/g, " ")] ?? null;
  return {
    goal: normalizeGoal(find("goal") ?? find("credit_goal")),
    credit_score_range: find("credit_score_range") ?? find("credit_score"),
    blocker: find("blocker") ?? find("whats_held_you_back"),
    campaign: o.utm_campaign ?? null,
    utm: o.utm_source ? `${o.utm_source}/${o.utm_medium ?? ""}` : null,
  };
};

let sent = 0, failed = 0;
const queue = [];
async function post(envelope) {
  queue.push(fetch(HOOK, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(envelope) })
    .then((r) => { r.ok ? sent++ : failed++; })
    .catch(() => { failed++; }));
  if (queue.length >= 5) { await Promise.all(queue); queue.length = 0; }
}
const flush = async () => { await Promise.all(queue); queue.length = 0; };

const conns = await sql`select * from sync.connections where provider = 'ghl' and status = 'connected' and token_secret_ref is not null and external_account_id <> 'agency' and external_account_id <> 'default'`;
console.log(`locations: ${conns.map((c) => c.external_account_id).join(", ")}`);
const since = Date.now() - 365 * 864e5;
const until = Date.now() + 90 * 864e5;

for (const conn of conns) {
  const token = await freshToken(conn);
  const loc = token.location_id;
  const counts = { calendars: 0, appointments: 0, contacts: 0, forms: 0 };

  // 1) calendars -> calendar_map (direct SQL, same upsert as ghl.ts)
  const cals = await ghlGet(token, `/calendars/?locationId=${loc}`);
  for (const cal of cals.calendars ?? []) {
    await sql`insert into sync.calendar_map (location_id, calendar_id, calendar_name)
      values (${loc}, ${cal.id}, ${cal.name ?? null})
      on conflict (location_id, calendar_id) do update set calendar_name = coalesce(sync.calendar_map.calendar_name, excluded.calendar_name)`;
    counts.calendars++;

    // 2) appointments per calendar
    try {
      const events = await ghlGet(token, `/calendars/events?locationId=${loc}&calendarId=${cal.id}&startTime=${since}&endTime=${until}`);
      for (const ev of events.events ?? []) {
        let contact = { id: ev.contactId };
        try {
          if (ev.contactId) {
            const c = await ghlGet(token, `/contacts/${ev.contactId}`);
            contact = { id: c.contact?.id, name: c.contact?.name ?? [c.contact?.firstName, c.contact?.lastName].filter(Boolean).join(" "),
              first_name: c.contact?.firstName, last_name: c.contact?.lastName, email: c.contact?.email, phone: c.contact?.phone };
          }
        } catch {}
        for (const e of statusEvents(ev)) {
          await post({ tcb_event: e.event, location_id: loc, contact,
            appointment: { id: ev.id, start_time: ev.startTime, calendar_id: cal.id, calendar_name: cal.name } });
        }
        counts.appointments++;
      }
    } catch (err) { console.log(`  calendar ${cal.name}: ${String(err).slice(0, 120)}`); }
  }
  console.log(`[${loc}] calendars=${counts.calendars} appointments=${counts.appointments}`);

  // 3) contacts
  for (let page = 1; page <= 50; page++) {
    const res = await ghlGet(token, `/contacts/?locationId=${loc}&limit=100&page=${page}`);
    const batch = res.contacts ?? [];
    for (const c of batch) {
      await post({ tcb_event: "contact_upserted", location_id: loc,
        contact: { id: c.id, name: c.contactName ?? [c.firstName, c.lastName].filter(Boolean).join(" "), first_name: c.firstName, last_name: c.lastName, email: c.email, phone: c.phone } });
      counts.contacts++;
    }
    if (counts.contacts % 500 === 0 && batch.length) console.log(`[${loc}] contacts so far: ${counts.contacts}`);
    if (batch.length < 100) break;
  }

  // 4) form submissions
  try {
    for (let fpage = 1; fpage <= 50; fpage++) {
      const res = await ghlGet(token, `/forms/submissions?locationId=${loc}&limit=100&page=${fpage}`);
      const subs = res.submissions ?? [];
      for (const s of subs) {
        await post({ tcb_event: "form_submitted", location_id: loc,
          contact: { id: s.contactId, email: s.email, name: s.name, phone: s.phone ?? s.others?.phone },
          form: { id: s.formId, source: "meta_ads", ...pickFormFields(s) } });
        counts.forms++;
      }
      if (subs.length < 100) break;
    }
  } catch (err) { console.log(`  forms: ${String(err).slice(0, 120)}`); }

  await flush();
  await sql`update sync.connections set last_synced_at = now(), last_error = null where id = ${conn.id}`;
  console.log(`[${loc}] DONE:`, JSON.stringify(counts));
}
await flush();
console.log(`BRIDGE COMPLETE. webhook posts sent=${sent} failed=${failed}`);
await sql.end();
process.exit(0);
