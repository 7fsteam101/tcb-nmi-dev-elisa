import { sql } from "@/lib/db";
import { PricingEditor } from "./editor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function PricingAdmin() {
  const [offers, plans] = await Promise.all([
    sql`select id, name, type, default_price_minor, active from marketing.offer order by active desc, name`,
    sql`
      select pp.id, pp.name, pp.version, pp.installments, pp.installment_amount_minor, pp.requires_first_last, pp.effective_to
      from marketing.pricing_plan pp join marketing.offer o on o.id = pp.offer_id
      where o.type = 'core' order by pp.effective_to nulls first, pp.installments`,
  ]);
  return <PricingEditor offers={offers as never} plans={plans as never} />;
}
