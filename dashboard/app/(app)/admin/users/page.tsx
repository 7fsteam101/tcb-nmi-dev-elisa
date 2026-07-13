import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { UsersEditor } from "./editor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function UsersAdmin() {
  const me = await requireSession();
  const [users, reps] = await Promise.all([
    sql`select id, email, full_name, role, rep_id, active, page_overrides, can_view_notes, last_login_at from core.app_user order by created_at`,
    sql`select id, full_name from sales.rep where active order by full_name`,
  ]);
  return <UsersEditor users={users as never} reps={reps as never} meId={me.id} />;
}
