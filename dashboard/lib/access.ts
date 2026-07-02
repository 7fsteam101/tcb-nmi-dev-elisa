import { redirect } from "next/navigation";
import { sql } from "./db";
import { requireSession, type SessionUser } from "./auth";
import { PAGES, effectivePages, type PageKey } from "./access-rules";

export * from "./access-rules";

export async function pagesForUser(user: SessionUser): Promise<PageKey[]> {
  if (user.role === "admin") return [...PAGES];
  const rows = await sql`select page_overrides from core.app_user where id = ${user.id} and active`;
  if (!rows.length) return [];
  return effectivePages(user.role, rows[0].page_overrides);
}

/** Page guard: session + access check; redirects away when not allowed. */
export async function requireAccess(page: PageKey): Promise<SessionUser> {
  const user = await requireSession();
  const pages = await pagesForUser(user);
  if (!pages.includes(page)) redirect(pages.length ? `/${pages[0]}` : "/settings");
  return user;
}
