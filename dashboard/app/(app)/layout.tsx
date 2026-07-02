import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { isDemoMode } from "@/lib/settings";
import { pagesForUser, PAGE_LABELS } from "@/lib/access";
import { LogoutButton, NavLink } from "./nav";

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const user = await requireSession();
  const demo = await isDemoMode();
  // nav = the pages this user can actually open (role defaults + admin overrides)
  const pages = await pagesForUser(user);
  const nav = [
    ...pages.map((p) => ({ href: `/${p}`, label: PAGE_LABELS[p] })),
    ...(user.role === "admin" ? [{ href: "/connections", label: "Connections" }] : []),
    { href: "/settings", label: "Settings" },
    ...(user.role === "admin" ? [{ href: "/admin", label: "Admin" }] : []),
  ];
  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-52 shrink-0 flex-col border-r p-4" style={{ borderColor: "var(--line)" }}>
        <Link href="/overview" className="mb-6 block">
          <div className="text-sm font-bold leading-tight">The Credit Brothers</div>
          <div className="text-[11px]" style={{ color: "var(--muted)" }}>Sales System</div>
        </Link>
        <nav className="flex flex-col gap-0.5">
          {nav.map((n) => <NavLink key={n.href} href={n.href} label={n.label} />)}
        </nav>
        <div className="mt-auto pt-4 text-xs" style={{ color: "var(--muted)" }}>
          <div className="mb-2 truncate">{user.name}</div>
          <LogoutButton />
        </div>
      </aside>
      <div className="min-w-0 flex-1">
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
