import { sql } from "../lib/db";
import { getProviderToken } from "../lib/sync/providers";

// Attribution + call-linkage backfill from Close (idempotent, re-runnable):
//  1. first/last touch on every opportunity from the lead's Lead Source /
//     Source / Referral fields (normalized to readable slugs; fill-if-empty)
//  2. the REAL call <-> opportunity linkage: "Appt Time" seeds the primary
//     strategy call + its appointment slot per opportunity that reached booking.
//     Slot status is inferred honestly: future -> scheduled; past + a stage that
//     proves the call happened -> taken; past + ambiguous -> scheduled (lands in
//     the Call Logs pending queue for one-click marking by the team).
//     converting_touch stamps only on opportunities with a real booking.
const CLOSE = "https://api.close.com/api/v1";
const CF = {
  leadSource: "cf_PJYzkWyWOg5gtXYsN7C2s7KJYNqA8XV04b43Mwsh4xn",
  source: "cf_WXcadfKpxRqh6hFZwGENyIZY9xuAqI7fU51YNkZG4wx",
  referral: "cf_MryL3taQFoTyv1r8b4buqtfGCx7ETai98hw8NF169uv",
  appt: "cf_3cz7rmvY0XAAomI2RhHCHWxWQiMGHt44BKKKL9pTPqY",
};

const cfv = (lead: any, id: string): string | null => {
  const v = lead.custom?.[id] ?? lead[`custom.${id}`] ?? null;
  const s = Array.isArray(v) ? v[0] : v;
  return s === null || s === undefined || String(s).trim() === "" ? null : String(s).trim();
};

// readable, truthful slugs — no paid/organic guessing beyond what Close says
function normalizeSource(leadSource: string | null, source: string | null, referral: string | null): string | null {
  const raw = (leadSource ?? source ?? "").toLowerCase();
  if (referral || raw.includes("affiliate") || raw.includes("referral")) return "affiliate_referral";
  if (raw.includes("quiz")) return "quiz_website";
  if (raw.includes("opt-in") || raw.includes("opt in")) return "opt_in_form";
  if (raw.includes("organic")) return "organic";
  if (raw === "") return null;
  return raw.replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

// "Thursday, June 18, 2026 3:30 PM" in America/New_York -> ISO
const MONTHS: Record<string, number> = { january: 0, february: 1, march: 2, april: 3, may: 4, june: 5, july: 6, august: 7, september: 8, october: 9, november: 10, december: 11 };
function parseApptEt(s: string): string | null {
  const m = s.match(/^\w+,\s+(\w+)\s+(\d{1,2}),\s+(\d{4})\s+(\d{1,2}):(\d{2})\s+(AM|PM)$/i);
  if (!m) return null;
  const month = MONTHS[m[1].toLowerCase()];
  if (month === undefined) return null;
  let hour = parseInt(m[4], 10) % 12;
  if (m[6].toUpperCase() === "PM") hour += 12;
  // resolve the ET offset for that date (handles EST/EDT)
  const probe = new Date(Date.UTC(parseInt(m[3], 10), month, parseInt(m[2], 10), 12));
  const offsetName = new Intl.DateTimeFormat("en-US", { timeZone: "America/New_York", timeZoneName: "shortOffset" })
    .formatToParts(probe).find((p) => p.type === "timeZoneName")?.value ?? "GMT-4";
  const offset = parseInt(offsetName.replace("GMT", ""), 10) || -4;
  const d = new Date(Date.UTC(parseInt(m[3], 10), month, parseInt(m[2], 10), hour - offset, parseInt(m[5], 10)));
  return d.toISOString();
}

// stages that prove the strategy call actually happened
const CALL_HAPPENED = new Set(["call_completed", "closing", "contract_signed", "deposit", "won_pif", "won_pp", "closed_won"]);
// stages implying a booking existed at some point
const BOOKED_OR_LATER = new Set(["strategy_call_booked", "call_confirmed", "intake_form_submitted", "audit_complete", ...CALL_HAPPENED]);

const main = async () => {
  const key = await getProviderToken("close");
  if (!key) throw new Error("no close key");
  const auth = { Authorization: "Basic " + Buffer.from(`${key}:`).toString("base64") };
  const stats = { sourced: 0, unsourced: 0, callsSeeded: 0, slotsTaken: 0, slotsPending: 0, slotsFuture: 0, apptUnparsed: 0, converting: 0 };

  const fields = `id,custom.${CF.leadSource},custom.${CF.source},custom.${CF.referral},custom.${CF.appt}`;
  let skip = 0;
  while (true) {
    const res = await fetch(`${CLOSE}/lead/?_skip=${skip}&_limit=100&_fields=${encodeURIComponent(fields)}`, { headers: auth });
    if (!res.ok) throw new Error(`lead page failed: ${res.status}`);
    const page = await res.json();
    for (const lead of page.data ?? []) {
      const src = normalizeSource(cfv(lead, CF.leadSource), cfv(lead, CF.source), cfv(lead, CF.referral));
      const apptRaw = cfv(lead, CF.appt);

      // canonical contact + their opportunities
      const opps = await sql`
        select o.id, o.stage, o.contact_id from sales.opportunity o
        where o.contact_id = (
          select coalesce(c2.id, c1.id) from core.contact c1
          left join core.contact c2 on c2.id = c1.merged_into_contact_id
          where c1.close_id = ${lead.id} limit 1)`;
      if (!opps.length) continue;

      for (const opp of opps) {
        if (src) {
          await sql`
            update sales.opportunity set
              first_touch_channel = coalesce(first_touch_channel, ${src}),
              last_touch_channel = coalesce(last_touch_channel, ${src})
            where id = ${opp.id}`;
          stats.sourced++;
        } else stats.unsourced++;

        // call + slot linkage from Appt Time, for opportunities that reached booking
        if (apptRaw && BOOKED_OR_LATER.has(opp.stage)) {
          const iso = parseApptEt(apptRaw);
          if (!iso) { stats.apptUnparsed++; continue; }
          const existing = await sql`
            select id from sales.call where opportunity_id = ${opp.id} and type = 'strategy' and is_primary`;
          if (existing.length) continue; // idempotent
          const inFuture = new Date(iso).getTime() > Date.now();
          const status = inFuture ? "scheduled" : CALL_HAPPENED.has(opp.stage) ? "taken" : "scheduled";
          const [call] = await sql`
            insert into sales.call (opportunity_id, type, scheduled_at, current_scheduled_at, is_primary, is_booking,
                                    booking_source_channel, occurred_at)
            values (${opp.id}, 'strategy', ${iso}, ${iso}, true, true, ${src},
                    ${!inFuture && CALL_HAPPENED.has(opp.stage) ? iso : null})
            returning id`;
          await sql`
            insert into sales.appointment (call_id, seq, scheduled_for, status, is_current)
            values (${call.id}, 1, ${iso}, ${status}::public.appointment_status, true)`;
          if (src) {
            await sql`
              update sales.opportunity set converting_touch_channel = coalesce(converting_touch_channel, ${src})
              where id = ${opp.id}`;
            stats.converting++;
          }
          stats.callsSeeded++;
          if (inFuture) stats.slotsFuture++;
          else if (status === "taken") stats.slotsTaken++;
          else stats.slotsPending++;
        }
      }
    }
    skip += (page.data ?? []).length;
    if (!page.has_more) break;
  }
  console.log(JSON.stringify(stats));
  process.exit(0);
};
main().catch((e) => { console.error(e); process.exit(1); });
