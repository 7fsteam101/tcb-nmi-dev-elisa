import { sql } from "@/lib/db";
import { isDemoMode } from "@/lib/settings";
import { PlanEditor } from "./editor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function PlansAdmin() {
  const demo = await isDemoMode();
  const deals = await sql`
    select d.id, ct.full_name as contact_name, d.total_contract_value_minor as tcv_minor,
      pp.plan_type, pp.version,
      coalesce((select sum(p.amount_minor) from finance.successful_payment p where p.deal_id = d.id and p.type <> 'booking_25'), 0) as paid_minor,
      (select count(*) from finance.receivable r where r.payment_plan_id = pp.id and r.status in ('scheduled','late','delinquent')) as open_receivables
    from sales.deal d
    join core.contact ct on ct.id = d.contact_id
    join finance.payment_plan pp on pp.deal_id = d.id and pp.is_current
    where d.status = 'active' and d.is_demo = ${demo}
    order by d.deal_close_date desc limit 100`;
  return <PlanEditor deals={deals as never} />;
}
