import Link from "next/link";
import { sql } from "@/lib/db";
import { isDemoMode } from "@/lib/settings";
import { pagesForUser, type PageKey } from "@/lib/access";
import { getEffectiveUser } from "@/lib/view-as";
import { LogoutButton, NavLink, NavGroup } from "./nav";
import { ViewAsControl, ViewAsBanner } from "./view-as";
import { TopBanners } from "./banners";
import { shellSignals } from "@/lib/announcements";
import { ThemeToggle } from "@/components/theme-toggle";
import { cookies } from "next/headers";

type Item = { href: string; label: string; icon: string; gate?: PageKey; badge?: number };

export default async function AppLayout({ children, drawer }: { children: React.ReactNode; drawer: React.ReactNode }) {
  const { viewing: user, real, isPreview } = await getEffectiveUser();
  const demo = await isDemoMode();
  const pages = await pagesForUser(user);
  const showAdminChrome = real.role === "admin" && !isPreview;
  const has = (p: PageKey) => pages.includes(p);

  // single shell query: pending-calls badge + system alerts + pinned banners
  const shell = await shellSignals();
  const pendingCalls = has("calls") ? (shell.pendingCalls || undefined) : undefined;
  const theme = (await cookies()).get("tcb_theme")?.value === "light" ? "light" : "dark";

  const rawGroups: { label: string; items: Item[] }[] = [
    { label: "Insights", items: [
      { href: "/overview", label: "Overview", icon: "overview", gate: "overview" },
      { href: "/weekly", label: "Performance Report", icon: "weekly", gate: "overview" },
      { href: "/funnel", label: "Funnel & Leakage", icon: "funnel", gate: "funnel" },
    ]},
    { label: "Sales", items: [
      { href: "/calls", label: "Call Logs", icon: "calls", gate: "calls", badge: pendingCalls },
      { href: "/contacts", label: "Contacts", icon: "contacts", gate: "calls" },
      { href: "/reps", label: "Closer Analytics", icon: "reps", gate: "reps" },
      { href: "/contracts", label: "Contracts", icon: "knowledge", gate: "reps" },
      { href: "/setter-reports", label: "Setter Reports", icon: "forms", gate: "calls" },
    ]},
    { label: "Money", items: [
      { href: "/receivables", label: "Receivables", icon: "money", gate: "receivables" },
      { href: "/revenue", label: "Revenue", icon: "revenue", gate: "receivables" },
      { href: "/commission", label: "Commissions", icon: "reps", gate: "reps" },
      { href: "/payments", label: "Payment Links", icon: "link", gate: "receivables" },
    ]},
    { label: "Marketing", items: [
      { href: "/marketing", label: "Meta Ads", icon: "marketing", gate: "marketing" },
    ]},
    { label: "Forms", items: [
      { href: "/forms/sales-call", label: "Sales Call Report", icon: "forms", gate: "forms" },
      { href: "/forms/missed-call", label: "Missed Call Report", icon: "forms", gate: "forms" },
      { href: "/forms/post-call", label: "Post-Call Notes", icon: "forms", gate: "forms" },
    ]},
    { label: "Team", items: [
      { href: "/announcements", label: "Announcements", icon: "announce" },
      { href: "/knowledge", label: "Knowledge", icon: "knowledge" },
    ]},
    ...(showAdminChrome ? [{ label: "Admin", items: [
      { href: "/connections", label: "Connections", icon: "connections" },
      { href: "/admin", label: "Admin", icon: "admin" },
    ] }] : []),
  ];
  const groups = rawGroups
    .map((g) => ({ ...g, items: g.items.filter((it) => !it.gate || has(it.gate)) }))
    .filter((g) => g.items.length);

  const viewAsUsers = real.role === "admin"
    ? (await sql`select id, full_name, role from core.app_user where active and id <> ${real.id} order by full_name`)
        .map((u: any) => ({ id: u.id, label: `${u.full_name} (${u.role})` }))
    : [];

  return (
    <div className="flex min-h-screen">
      <aside className="sticky top-0 flex h-screen w-56 shrink-0 flex-col overflow-y-auto border-r px-3 py-4"
        style={{ borderColor: "var(--line)", background: "var(--nav)" }}>
        <Link href="/overview" className="mb-4 flex items-center gap-2 px-1.5">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg text-xs font-bold"
            style={{ background: "var(--accent)", color: "#fff" }}>TCB</div>
          <div>
            <div className="text-[13px] font-bold leading-tight">The Credit Brothers</div>
            <div className="text-[10px]" style={{ color: "var(--muted)" }}>Sales System</div>
          </div>
        </Link>
        <nav className="flex flex-1 flex-col">
          {groups.map((g) => (
            <div key={g.label}>
              <NavGroup label={g.label} />
              {g.items.map((it) => <NavLink key={it.href} href={it.href} label={it.label} icon={it.icon} badge={it.badge} />)}
            </div>
          ))}
        </nav>
        <div className="mt-4 border-t pt-3" style={{ borderColor: "var(--line)" }}>
          <div className="mb-2 flex items-center justify-between px-1.5">
            <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>Theme</span>
            <ThemeToggle initial={theme} />
          </div>
          <NavLink href="/settings" label="Settings" icon="settings" />
          <div className="mt-2 flex items-center gap-2 px-1.5">
            <div className="flex h-7 w-7 items-center justify-center rounded-full text-[11px] font-semibold"
              style={{ background: "var(--panel-2)", color: "var(--text)" }}>
              {real.name.split(" ").map((s) => s[0]).slice(0, 2).join("")}
            </div>
            <div className="min-w-0 flex-1">
              <div className="truncate text-xs" style={{ color: "var(--text)" }}>{real.name}</div>
              <div className="text-[10px] capitalize" style={{ color: "var(--muted)" }}>{real.role}</div>
            </div>
          </div>
          <div className="mt-2"><LogoutButton /></div>
        </div>
      </aside>

      <div className="min-w-0 flex-1">
        {isPreview && <ViewAsBanner name={user.name} role={user.role} />}
        <TopBanners alerts={shell.alerts} pinned={shell.pinned} />
        {demo && (
          <div className="px-6 py-2 text-center text-xs font-semibold"
            style={{ background: "color-mix(in srgb, var(--warn) 18%, transparent)", color: "var(--warn)" }}>
            Demo mode is on — data on screen is sample data. Turn it off in Settings.
          </div>
        )}
        {real.role === "admin" && (
          <div className="flex items-center justify-end border-b px-6 py-2" style={{ borderColor: "var(--line)" }}>
            <ViewAsControl users={viewAsUsers} current={null} />
          </div>
        )}
        <main className="p-6">{children}</main>
      </div>
      {drawer}
    </div>
  );
}
