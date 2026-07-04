"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { Icon } from "@/components/icons";

export function NavLink({ href, label, icon, badge }: { href: string; label: string; icon?: string; badge?: number }) {
  const pathname = usePathname();
  // exact for short roots, prefix for the rest — avoids /reps matching /revenue
  const active = pathname === href || (href !== "/" && pathname.startsWith(href + "/")) ||
    (href.length > 6 && pathname.startsWith(href));
  return (
    <Link href={href} className="flex items-center gap-2.5 rounded-lg px-2.5 py-1.5 text-[13px] transition-colors"
      style={active
        ? { background: "color-mix(in srgb, var(--accent) 16%, transparent)", color: "var(--text)", fontWeight: 600 }
        : { color: "var(--muted)" }}>
      {icon && <span style={{ color: active ? "var(--accent)" : "var(--muted)" }}><Icon name={icon} /></span>}
      <span className="min-w-0 flex-1 truncate">{label}</span>
      {badge ? (
        <span className="rounded-full px-1.5 text-[10px] font-semibold"
          style={{ background: "color-mix(in srgb, var(--warn) 22%, transparent)", color: "var(--warn)" }}>{badge}</span>
      ) : null}
    </Link>
  );
}

export function NavGroup({ label }: { label: string }) {
  return <div className="mb-1 mt-4 px-2.5 text-[10px] font-semibold uppercase tracking-wider first:mt-0" style={{ color: "color-mix(in srgb, var(--muted) 70%, transparent)" }}>{label}</div>;
}

export function LogoutButton() {
  const router = useRouter();
  return (
    <button className="btn-ghost btn w-full text-xs"
      onClick={async () => { await fetch("/api/logout", { method: "POST" }); router.push("/login"); router.refresh(); }}>
      Sign out
    </button>
  );
}
