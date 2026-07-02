import Link from "next/link";
import { sql } from "@/lib/db";
import { isDemoMode } from "@/lib/settings";
import { pagesForUser, PAGE_LABELS } from "@/lib/access";
import { getEffectiveUser } from "@/lib/view-as";
import { LogoutButton, NavLink } from "./nav";
import { ViewAsSelect, ViewAsBanner } from "./view-as";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const { viewing: user, real, isPreview } = await getEffectiveUser();
  const demo = await isDemoMode();
  // nav = the pages the VIEWED user can open; admin chrome follows the REAL user
  const pages = await pagesForUser(user);
  const showAdminChrome = real.role === "admin" && !isPreview;
  const nav = [
    ...pages.flatMap((p) => [
      { href: `/${p}`, label: PAGE_LABELS[p] },
      ...(p === "overview" ? [{ href: "/weekly", label: "Weekly Snapshot" }] : []),
      ...(p === "receivables" ? [{ href: "/revenue", label: "Revenue" }] : []),
    ]),
    ...(pages.includes("calls") ? [{ href: "/contacts", label: "Contacts" }] : []),
    ...(showAdminChrome ? [{ href: "/connections", label: "Connections" }] : []),
    { href: "/settings", label: "Settings" },
    ...(showAdminChrome ? [{ href: "/admin", label: "Admin" }] : []),
  ];
  const viewAsUsers = real.role === "admin"
    ? (await sql`select id, full_name, role from core.app_user where active and id <> ${real.id} order by full_name`)
        .map((u: any) => ({ id: u.id, label: `${u.full_name} (${u.role})` }))
    : [];
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-52 shrink-0 flex-col border-r p-4" style={{ borderColor: "var(--line)", background: "var(--nav)" }}>
        <Link href="/overview" className="mb-6 block">
          <div className="text-sm font-bold leading-tight">The Credit Brothers</div>
          <div className="text-[11px]" style={{ color: "var(--muted)" }}>Sales System</div>
        </Link>
        <nav className="flex flex-col gap-0.5">
          {nav.map((n) => <NavLink key={n.href} href={n.href} label={n.label} />)}
        </nav>
        <div className="mt-auto pt-4 text-xs" style={{ color: "var(--muted)" }}>
          {real.role === "admin" && viewAsUsers.length > 0 && (
            <ViewAsSelect users={viewAsUsers} currentId={isPreview ? user.id : null} />
          )}
          <div className="mb-2 truncate">{real.name}</div>
          <LogoutButton />
        </div>
      </aside>
      <div className="min-w-0 flex-1">
        {isPreview && <ViewAsBanner name={user.name} role={user.role} />}
        {demo && (
          <div className="px-6 py-2 text-center text-xs font-semibold"
            style={{ background: "color-mix(in srgb, var(--warn) 18%, transparent)", color: "var(--warn)" }}>
            DEMO MODE — all data on screen is obviously fake sample data. Turn off in Settings once real data flows.
          </div>
        )}
        <main className="p-6">{children}</main>
      </div>
    </div>
  );
}
