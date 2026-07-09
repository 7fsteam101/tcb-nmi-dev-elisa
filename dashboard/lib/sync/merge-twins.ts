import { sql } from "../db";

// Cross-source name twins: Close leads often arrive with a name and no
// email/phone, while the same person exists identified from GHL/Stripe. With no
// shared identifier the ingest correctly refuses to guess, so this nightly pass
// folds the STRICT cases only: an identifier-less contact whose exact name
// matches EXACTLY ONE identified live contact. Ambiguous names (both sides
// identified, or multiple candidates) are left for human judgment.
export async function mergeNameTwins(): Promise<number> {
  const pairs = await sql`
    select a.id as dup, (array_agg(b.id))[1] as prim
    from core.contact a
    join core.contact b on lower(trim(a.full_name)) = lower(trim(b.full_name)) and a.id <> b.id
      and b.merged_into_contact_id is null and not b.is_demo
      and (b.primary_email is not null or b.primary_phone is not null)
    where a.merged_into_contact_id is null and not a.is_demo and length(trim(a.full_name)) > 6
      and a.primary_email is null and a.primary_phone is null
      and not exists (select 1 from core.contact_identifier ci where ci.contact_id = a.id)
    group by a.id having count(distinct b.id) = 1`;
  let merged = 0;
  for (const p of pairs) {
    const dup = p.dup as string, prim = p.prim as string;
    await sql`update sales.opportunity set contact_id=${prim} where contact_id=${dup}`;
    await sql`update sales.opt_in set contact_id=${prim} where contact_id=${dup}`;
    await sql`update sales.deal set contact_id=${prim} where contact_id=${dup}`;
    await sql`update sales.deal set partner_contact_id=${prim} where partner_contact_id=${dup}`;
    await sql`update finance.successful_payment set contact_id=${prim} where contact_id=${dup}`;
    await sql`update finance.payment_link set contact_id=${prim} where contact_id=${dup}`;
    await sql`update credit.intake_submission set contact_id=${prim} where contact_id=${dup}`;
    await sql`update credit.nafa set contact_id=${prim} where contact_id=${dup}`;
    await sql`update delivery.fulfilment set contact_id=${prim} where contact_id=${dup}`;
    await sql`update core.contact_note set contact_id=${prim} where contact_id=${dup}`;
    await sql`update sales.agreement set contact_id=${prim} where contact_id=${dup}`;
    // platform ids: capture from the twin, clear (unique indexes), fill the survivor
    const [d] = await sql`select close_id, ghl_marketing_id, ghl_repair_id, monday_lead_id from core.contact where id=${dup}`;
    await sql`update core.contact set close_id=null, ghl_marketing_id=null, ghl_repair_id=null, monday_lead_id=null, merged_into_contact_id=${prim} where id=${dup}`;
    await sql`update core.contact set
      close_id = coalesce(close_id, ${d.close_id}),
      ghl_marketing_id = coalesce(ghl_marketing_id, ${d.ghl_marketing_id}),
      ghl_repair_id = coalesce(ghl_repair_id, ${d.ghl_repair_id}),
      monday_lead_id = coalesce(monday_lead_id, ${d.monday_lead_id})
      where id=${prim}`;
    merged++;
  }
  return merged;
}
