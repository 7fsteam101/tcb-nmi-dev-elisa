import { redirect } from "next/navigation";
import { sql } from "./db";
import { type SessionUser } from "./auth";
import { getEffectiveUser } from "./view-as";
import { PAGES, effectivePages, type PageKey } from "./access-rules";

export * from "./access-rules";

export async function pagesForUser(user: SessionUser): Promise<PageKey[]> {
  if (user.role === "admin") return [...PAGES];
  const rows = await sql`select page_overrides from core.app_user where id = ${user.id} and active`;
  if (!rows.length) return [];
  return effectivePages(user.role, rows[0].page_overrides);
}

/** Page guard: session + access check; redirects away when not allowed.
 *  Respects "view as": an admin previewing a closer gets the closer's pages. */
export async function requireAccess(page: PageKey): Promise<SessionUser> {
  const { viewing } = await getEffectiveUser();
  const pages = await pagesForUser(viewing);
  if (!pages.includes(page)) redirect(pages.length ? `/${pages[0]}` : "/settings");
  return viewing;
}
