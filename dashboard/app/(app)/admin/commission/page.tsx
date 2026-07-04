import { sql } from "@/lib/db";
import { isDemoMode } from "@/lib/settings";
import { commissionForReps } from "@/lib/commission";
import { CommissionEditor } from "./editor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function CommissionAdmin() {
  const demo = await isDemoMode();
  // Two sequential batches: commissionForReps fans out its own 3 queries, so
  // running it inside this Promise.all would spike concurrency past the
  // free-tier pooler cap and stall. Fetch the grid data first, then the preview.
  const [rules, reps, settings] = await Promise.all([
    sql`
      select id, key, name, description, params, default_enabled, sort_order
      from sales.commission_rule order by sort_order` as unknown as Promise<
        { id: string; key: string; name: string; description: string | null; params: any; default_enabled: boolean; sort_order: number | null }[]
      >,
    sql`
      select id, full_name from sales.rep
      where active and role in ('closer','hybrid')
      order by full_name` as unknown as Promise<{ id: string; full_name: string }[]>,
    sql`select rep_id, rule_id, enabled from sales.rep_commission_setting` as unknown as Promise<
      { rep_id: string; rule_id: string; enabled: boolean }[]
    >,
  ]);
  const preview = await commissionForReps(demo, 30);

  return (
    <CommissionEditor
      rules={rules as never}
      reps={reps as never}
      settings={settings as never}
      preview={preview as never}
      demo={demo}
    />
  );
}
