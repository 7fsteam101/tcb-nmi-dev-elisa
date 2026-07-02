import { sql } from "../db";
import { storeAndProcess } from "./ingest";

// GoHighLevel (API 2.0) — one Marketplace app, one connection per sub-account
// (location). Tokens live in Vault as JSON {access_token, refresh_token,
// expires_at, location_id}; access tokens expire daily so every call runs
// through ensureFreshToken. All events funnel through the same idempotent
// ingest + normalizer as the workflow webhooks (our tcb_event envelope).
const API = "https://services.leadconnectorhq.com";
const VERSION = "2021-07-28";

type GhlToken = { access_token: string; refresh_token: string; expires_at: number; location_id: string };

// Verified scope set for everything we do (docs-checked):
export const GHL_SCOPES = [
  "contacts.readonly", "contacts.write",
  "calendars.readonly", "calendars/events.readonly", "calendars/events.write",
  "forms.readonly", "locations.readonly",
  "opportunities.readonly", "opportunities.write",
].join(" ");

export function ghlInstallUrl(redirectUri: string): string {
  const p = new URLSearchParams({
    response_type: "code",
    redirect_uri: redirectUri,
    client_id: process.env.GHL_CLIENT_ID!,
    scope: GHL_SCOPES,
  });
  return `https://marketplace.gohighlevel.com/oauth/chooselocation?${p}`;
}

export async function exchangeCode(code: string, userType: "Location" | "Company" = "Location"): Promise<any> {
  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GHL_CLIENT_ID!,
      client_secret: process.env.GHL_CLIENT_SECRET!,
      grant_type: "authorization_code",
      code,
      user_type: userType,
    }),
  });
  if (!res.ok) throw new Error(`GHL token exchange failed: ${res.status} ${await res.text()}`);
  return res.json();
}

/** Agency-level install: mint a location token per sub-account from the agency token. */
export async function mintLocationTokens(agencyToken: any): Promise<string[]> {
  const auth = { Authorization: `Bearer ${agencyToken.access_token}`, Version: VERSION, Accept: "application/json" };
  const listRes = await fetch(
    `${API}/oauth/installed-locations?companyId=${agencyToken.companyId}&appId=${process.env.GHL_CLIENT_ID!.split("-")[0]}`,
    { headers: auth },
  );
  if (!listRes.ok) throw new Error(`installed-locations failed: ${listRes.status} ${await listRes.text()}`);
  const list = await listRes.json();
  const saved: string[] = [];
  for (const loc of list.locations ?? []) {
    const res = await fetch(`${API}/oauth/locationToken`, {
      method: "POST",
      headers: { ...auth, "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ companyId: agencyToken.companyId, locationId: loc._id ?? loc.id }),
    });
    if (!res.ok) continue;
    await saveGhlConnection(await res.json());
    saved.push(loc._id ?? loc.id);
  }
  return saved;
}

export async function saveGhlConnection(tokenResponse: any) {
  const locationId = tokenResponse.locationId ?? tokenResponse.location_id ?? "agency";
  const payload: GhlToken = {
    access_token: tokenResponse.access_token,
    refresh_token: tokenResponse.refresh_token,
    expires_at: Date.now() + (tokenResponse.expires_in ?? 86000) * 1000,
    location_id: locationId,
  };
  const [secret] = await sql`select vault.create_secret(${JSON.stringify(payload)}, ${`ghl:${locationId}:${Date.now()}`}) as id`;
  await sql`
    insert into sync.connections (provider, external_account_id, account_label, status, token_secret_ref, scopes)
    values ('ghl', ${locationId}, ${`GHL location ${locationId}`}, 'connected', ${secret.id}, ${tokenResponse.scope ?? null})
    on conflict (provider, external_account_id)
    do update set token_secret_ref = excluded.token_secret_ref, status = 'connected', last_error = null`;
  return locationId;
}

async function ensureFreshToken(conn: any): Promise<GhlToken> {
  const rows = await sql`select decrypted_secret from vault.decrypted_secrets where id = ${conn.token_secret_ref}`;
  if (!rows.length) throw new Error(`No token stored for GHL ${conn.external_account_id}`);
  let token: GhlToken = JSON.parse(rows[0].decrypted_secret);
  if (Date.now() < token.expires_at - 300_000) return token;
  const res = await fetch(`${API}/oauth/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: process.env.GHL_CLIENT_ID!,
      client_secret: process.env.GHL_CLIENT_SECRET!,
      grant_type: "refresh_token",
      refresh_token: token.refresh_token,
    }),
  });
  if (!res.ok) throw new Error(`GHL token refresh failed: ${res.status} ${await res.text()}`);
  const fresh = await res.json();
  token = {
    access_token: fresh.access_token,
    refresh_token: fresh.refresh_token ?? token.refresh_token,
    expires_at: Date.now() + (fresh.expires_in ?? 86000) * 1000,
    location_id: token.location_id,
  };
  await sql`select vault.update_secret(${conn.token_secret_ref}, ${JSON.stringify(token)})`;
  return token;
}

async function ghlGet(token: GhlToken, path: string): Promise<any> {
  const res = await fetch(`${API}${path}`, {
    headers: { Authorization: `Bearer ${token.access_token}`, Version: VERSION, Accept: "application/json" },
  });
  if (!res.ok) throw new Error(`GHL GET ${path} failed: ${res.status} ${await res.text()}`);
  return res.json();
}

const ghlConnections = () =>
  sql`select * from sync.connections where provider = 'ghl' and status = 'connected' and token_secret_ref is not null and external_account_id <> 'agency'`;

// Map a GHL appointment status onto our envelope events.
function statusEvents(appt: any): { type: string; event: string }[] {
  const out = [{ type: "booked", event: "appointment_booked" }];
  const s = String(appt.appointmentStatus ?? appt.status ?? "").toLowerCase();
  if (s === "confirmed") out.push({ type: "status", event: "appointment_confirmed" });
  if (s === "showed") out.push({ type: "status", event: "appointment_showed" });
  if (s === "noshow" || s === "no_show") out.push({ type: "status", event: "appointment_no_show" });
  if (s === "cancelled" || s === "canceled") out.push({ type: "status", event: "appointment_cancelled_by_lead" });
  return out;
}

/** Backfill + incremental pull for one location: calendars, appointments, contacts, form submissions. */
export async function syncGhlLocation(conn: any, opts: { sinceDays?: number } = {}) {
  const token = await ensureFreshToken(conn);
  const loc = token.location_id;
  const since = Date.now() - (opts.sinceDays ?? 365) * 864e5;
  const until = Date.now() + 90 * 864e5;
  const counts = { calendars: 0, appointments: 0, contacts: 0, forms: 0 };

  // 1) calendars → calendar_map (admin categorizes them)
  const cals = await ghlGet(token, `/calendars/?locationId=${loc}`);
  for (const cal of cals.calendars ?? []) {
    await sql`
      insert into sync.calendar_map (location_id, calendar_id, calendar_name)
      values (${loc}, ${cal.id}, ${cal.name ?? null})
      on conflict (location_id, calendar_id)
      do update set calendar_name = coalesce(sync.calendar_map.calendar_name, excluded.calendar_name)`;
    counts.calendars++;

    // 2) appointments per calendar (through the shared ingest → per-slot model)
    try {
      const events = await ghlGet(token, `/calendars/events?locationId=${loc}&calendarId=${cal.id}&startTime=${since}&endTime=${until}`);
      for (const ev of events.events ?? []) {
        let contact: any = { id: ev.contactId };
        try {
          if (ev.contactId) {
            const c = await ghlGet(token, `/contacts/${ev.contactId}`);
            contact = {
              id: c.contact?.id, name: c.contact?.name ?? [c.contact?.firstName, c.contact?.lastName].filter(Boolean).join(" "),
              first_name: c.contact?.firstName, last_name: c.contact?.lastName,
              email: c.contact?.email, phone: c.contact?.phone,
            };
          }
        } catch { /* contact fetch is best-effort */ }
        for (const e of statusEvents(ev)) {
          await storeAndProcess(conn.id, "ghl", `${ev.id}:${e.type}`, e.event, {
            tcb_event: e.event,
            location_id: loc,
            contact,
            appointment: { id: ev.id, start_time: ev.startTime, calendar_id: cal.id, calendar_name: cal.name },
          });
        }
        counts.appointments++;
      }
    } catch (err) {
      await sql`update sync.connections set last_error = ${`calendar ${cal.name}: ${String(err)}`} where id = ${conn.id}`;
    }
  }

  // 3) contacts (identity enrichment; matching adds emails/phones, never overwrites)
  let page = 1;
  while (page <= 50) {
    const res = await ghlGet(token, `/contacts/?locationId=${loc}&limit=100&page=${page}`);
    const batch = res.contacts ?? [];
    for (const c of batch) {
      await storeAndProcess(conn.id, "ghl", `contact:${c.id}`, "contact_upserted", {
        tcb_event: "contact_upserted",
        location_id: loc,
        contact: { id: c.id, name: c.contactName ?? [c.firstName, c.lastName].filter(Boolean).join(" "), first_name: c.firstName, last_name: c.lastName, email: c.email, phone: c.phone },
      });
      counts.contacts++;
    }
    if (batch.length < 100) break;
    page++;
  }

  // 4) opt-in form submissions
  try {
    let fpage = 1;
    while (fpage <= 50) {
      const res = await ghlGet(token, `/forms/submissions?locationId=${loc}&limit=100&page=${fpage}`);
      const subs = res.submissions ?? [];
      for (const s of subs) {
        await storeAndProcess(conn.id, "ghl", `form:${s.id}`, "form_submitted", {
          tcb_event: "form_submitted",
          location_id: loc,
          contact: { id: s.contactId, email: s.email, name: s.name, phone: s.phone ?? s.others?.phone },
          form: { id: s.formId, source: "meta_ads", ...pickFormFields(s) },
        });
        counts.forms++;
      }
      if (subs.length < 100) break;
      fpage++;
    }
  } catch (err) {
    await sql`update sync.connections set last_error = ${`forms: ${String(err)}`} where id = ${conn.id}`;
  }

  await sql`update sync.connections set last_synced_at = now() where id = ${conn.id}`;
  return counts;
}

function pickFormFields(s: any) {
  const o = s.others ?? {};
  const find = (k: string) => o[k] ?? o[k.replace(/_/g, " ")] ?? null;
  return {
    goal: normalizeGoal(find("goal") ?? find("credit_goal")),
    credit_score_range: find("credit_score_range") ?? find("credit_score"),
    blocker: find("blocker") ?? find("whats_held_you_back"),
    campaign: o.utm_campaign ?? null,
    utm: o.utm_source ? `${o.utm_source}/${o.utm_medium ?? ""}` : null,
  };
}

function normalizeGoal(v: unknown): string {
  const s = String(v ?? "").toLowerCase();
  if (s.includes("house") || s.includes("home")) return "house";
  if (s.includes("car") || s.includes("auto")) return "car";
  if (s.includes("card")) return "credit_cards";
  if (s.includes("business")) return "business_credit";
  return "other";
}

export async function syncAllGhl(opts: { sinceDays?: number } = {}) {
  const conns = await ghlConnections();
  const results: Record<string, unknown> = {};
  for (const conn of conns) {
    try {
      results[conn.external_account_id] = await syncGhlLocation(conn, opts);
    } catch (err) {
      results[conn.external_account_id] = { error: String(err) };
      await sql`update sync.connections set last_error = ${String(err)}, status = 'error' where id = ${conn.id}`;
    }
  }
  return results;
}
