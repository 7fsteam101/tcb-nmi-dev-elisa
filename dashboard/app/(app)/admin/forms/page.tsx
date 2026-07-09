import { sql } from "@/lib/db";
import { FormsEditor } from "./editor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function FormsAdmin() {
  // ALL forms, unreviewed first: the admin decides lead-counting here
  // (July 9 policy: tracking follows the mapping; everything records regardless).
  const forms = await sql`
    select fm.id, coalesce(nullif(c.account_label, ''), fm.location_id) as location_label,
           fm.form_id, fm.form_name, fm.counts_as_lead, fm.reviewed_at,
           (select count(*) from sales.opt_in o where o.form_id = fm.form_id) as submissions
    from sync.form_map fm
    left join sync.connections c on c.provider = 'ghl' and c.external_account_id = fm.location_id
    order by (fm.reviewed_at is null) desc, fm.counts_as_lead desc, location_label, fm.form_name nulls last`;
  return <FormsEditor forms={forms as never} />;
}
