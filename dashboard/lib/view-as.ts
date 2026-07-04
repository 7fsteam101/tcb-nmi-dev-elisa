import { cookies } from "next/headers";
import { sql } from "./db";
import { requireSession, type SessionUser } from "./auth";

export const VIEW_AS_COOKIE = "tcb_view_as";

// "View as": an admin previews the dashboard as another user OR as a generic
// role (role:closer / role:setter / ...), so every role is previewable even
// when no real login of that role exists. Only the VIEW follows the target;
// server actions keep enforcing the real admin session, so previewing can
// never grant or lose real powers.
export async function getEffectiveUser(): Promise<{ viewing: SessionUser; real: SessionUser; isPreview: boolean }> {
  const real = await requireSession();
  if (real.role !== "admin") return { viewing: real, real, isPreview: false };
  const target = (await cookies()).get(VIEW_AS_COOKIE)?.value;
  if (!target || target === real.id) return { viewing: real, real, isPreview: false };

  if (target.startsWith("role:")) {
    const role = target.slice(5);
    if (["leadership", "closer", "setter", "csm"].includes(role)) {
      return {
        viewing: { id: `preview-${role}`, email: "", name: `${role[0].toUpperCase()}${role.slice(1)} (preview)`, role: role as SessionUser["role"], repId: null },
        real, isPreview: true,
      };
    }
  }

  const rows = await sql`
    select id, email, full_name, role, rep_id from core.app_user where id = ${target} and active`;
  if (!rows.length) return { viewing: real, real, isPreview: false };
  const t = rows[0];
  return {
    viewing: { id: t.id, email: t.email, name: t.full_name, role: t.role, repId: t.rep_id },
    real, isPreview: true,
  };
}
