import { sql } from "@/lib/db";
import { requireAccess } from "@/lib/access";
import { isDemoMode } from "@/lib/settings";
import { goalProgress } from "@/lib/goals";
import { GoalsEditor } from "./editor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function GoalsAdmin() {
  await requireAccess("overview");
  const demo = await isDemoMode();
  const [company, perRep, reps] = await Promise.all([
    goalProgress(demo, "company"),
    goalProgress(demo, "rep"),
    sql`
      select id, full_name from sales.rep
      where active and role in ('closer','hybrid','setter')
      order by full_name` as unknown as Promise<{ id: string; full_name: string }[]>,
  ]);

  return <GoalsEditor company={company as never} perRep={perRep as never} reps={reps} demo={demo} />;
}
