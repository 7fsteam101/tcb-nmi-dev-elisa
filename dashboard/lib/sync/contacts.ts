import { sql } from "../db";

// Contact matching per the data-safety rules:
// - match across ALL identifiers (primary fields + contact_identifier history)
// - never overwrite an existing email/phone: append a new identifier if different
// - attribution (first_touch) only on first creation, never on re-entry
// - never downgrade lifecycle_status from customer / do_not_contact
export type IncomingContact = {
  fullName?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  closeId?: string;
  ghlMarketingId?: string;
  ghlRepairId?: string;
  sourceChannel?: string;
};

export async function findContact(c: IncomingContact): Promise<string | null> {
  const rows = await sql`
    select ct.id from core.contact ct
    where (${c.closeId ?? null}::text is not null and ct.close_id = ${c.closeId ?? null})
       or (${c.ghlMarketingId ?? null}::text is not null and ct.ghl_marketing_id = ${c.ghlMarketingId ?? null})
       or (${c.email ?? null}::text is not null and lower(ct.primary_email) = lower(${c.email ?? ""}))
       or (${c.phone ?? null}::text is not null and ct.primary_phone = ${c.phone ?? ""})
       or exists (
         select 1 from core.contact_identifier ci where ci.contact_id = ct.id and (
           (ci.type = 'email' and ${c.email ?? null}::text is not null and lower(ci.value) = lower(${c.email ?? ""})) or
           (ci.type = 'phone' and ${c.phone ?? null}::text is not null and ci.value = ${c.phone ?? ""})))
    limit 1`;
  return rows[0]?.id ?? null;
}

export async function upsertContact(c: IncomingContact): Promise<{ id: string; created: boolean }> {
  const existing = await findContact(c);
  if (existing) {
    // enrich without overwriting: external ids fill only if empty; new email/phone appends
    await sql`
      update core.contact set
        close_id = coalesce(close_id, ${c.closeId ?? null}),
        ghl_marketing_id = coalesce(ghl_marketing_id, ${c.ghlMarketingId ?? null}),
        ghl_repair_id = coalesce(ghl_repair_id, ${c.ghlRepairId ?? null}),
        full_name = coalesce(full_name, ${c.fullName ?? null})
      where id = ${existing}`;
    if (c.email) {
      await sql`
        insert into core.contact_identifier (contact_id, type, value, is_primary)
        select ${existing}, 'email', ${c.email}, false
        where not exists (
          select 1 from core.contact_identifier where contact_id = ${existing} and type = 'email' and lower(value) = lower(${c.email}))
        and not exists (select 1 from core.contact where id = ${existing} and lower(primary_email) = lower(${c.email}))`;
    }
    if (c.phone) {
      await sql`
        insert into core.contact_identifier (contact_id, type, value, is_primary)
        select ${existing}, 'phone', ${c.phone}, false
        where not exists (
          select 1 from core.contact_identifier where contact_id = ${existing} and type = 'phone' and value = ${c.phone})
        and not exists (select 1 from core.contact where id = ${existing} and primary_phone = ${c.phone})`;
    }
    return { id: existing, created: false };
  }
  const rows = await sql`
    insert into core.contact (full_name, first_name, last_name, primary_email, primary_phone,
                              lifecycle_status, close_id, ghl_marketing_id, ghl_repair_id)
    values (${c.fullName ?? [c.firstName, c.lastName].filter(Boolean).join(" ") ?? "Unknown"},
            ${c.firstName ?? null}, ${c.lastName ?? null}, ${c.email ?? null}, ${c.phone ?? null},
            'lead', ${c.closeId ?? null}, ${c.ghlMarketingId ?? null}, ${c.ghlRepairId ?? null})
    returning id`;
  return { id: rows[0].id, created: true };
}

const WON_STAGES = ["deposit", "won_pif", "won_pp", "closed_won", "active_partner"];
const CLOSED_STAGES = [...WON_STAGES, "lost", "dq_on_call", "call_canceled_by_team", "not_a_fit"];

// The automation rule: our workflows never attach new activity to a won/closed
// opportunity — they create a NEW one. (Users in Close can do anything; this
// only constrains what OUR automations pick.)
export async function findOrCreateActiveOpportunity(contactId: string, sourceChannel?: string): Promise<string> {
  const rows = await sql`
    select id from sales.opportunity
    where contact_id = ${contactId} and stage not in ${sql(CLOSED_STAGES)}
    order by opened_at desc limit 1`;
  if (rows.length) return rows[0].id;
  const created = await sql`
    insert into sales.opportunity (contact_id, stage, opened_at, first_touch_channel, cohort_month)
    values (${contactId}, 'lead_opt_in', now(), ${sourceChannel ?? null}, date_trunc('month', now())::date)
    returning id`;
  return created[0].id;
}
