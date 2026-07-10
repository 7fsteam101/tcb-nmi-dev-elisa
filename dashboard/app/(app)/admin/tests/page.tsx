import { sql } from "@/lib/db";
import { TestRulesEditor } from "./editor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function TestRulesAdmin() {
  const [rules, flagged] = await Promise.all([
    sql`select id, kind, value, created_at from core.test_rule order by kind, value`,
    sql`select ct.id, ct.full_name, ct.primary_email, ct.test_reason, ct.updated_at,
               (select count(*) from sales.opportunity o where o.contact_id = ct.id) as opps
        from core.contact ct
        where ct.is_demo and ct.test_reason is not null and ct.merged_into_contact_id is null
        order by ct.updated_at desc limit 200`,
  ]);
  const serialized = flagged.map((f: any) => ({
    id: String(f.id), name: f.full_name ?? "", email: f.primary_email ?? null,
    reason: f.test_reason ?? "", opps: Number(f.opps ?? 0),
  }));
  const ruleRows = rules.map((r: any) => ({ id: String(r.id), kind: String(r.kind), value: String(r.value) }));
  return <TestRulesEditor rules={ruleRows} flagged={serialized} />;
}
