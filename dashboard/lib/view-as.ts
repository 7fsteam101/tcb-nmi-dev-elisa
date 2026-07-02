import { cookies } from "next/headers";
import { sql } from "./db";
import { requireSession, type SessionUser } from "./auth";

export const VIEW_AS_COOKIE = "tcb_view_as";

// "View as": an admin previews the dashboard exactly as another user sees it.
// Only the VIEW follows the target (pages, nav); server actions keep enforcing
// the real admin session, so previewing can never grant or lose real powers.
export async function getEffectiveUser(): Promise<{ viewing: SessionUser; real: SessionUser; isPreview: boolean }> {
  const real = await requireSession();
  if (real.role !== "admin") return { viewing: real, real, isPreview: false };
  const targetId = (await cookies()).get(VIEW_AS_COOKIE)?.value;
  if (!targetId || targetId === real.id) return { viewing: real, real, isPreview: false };
  const rows = await sql`
    select id, email, full_name, role, rep_id from core.app_user where id = ${targetId} and active`;
  if (!rows.length) return { viewing: real, real, isPreview: false };
  const t = rows[0];
  return {
    viewing: { id: t.id, email: t.email, name: t.full_name, role: t.role, repId: t.rep_id },
    real,
    isPreview: true,
  };
}
