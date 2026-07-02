"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export function NavLink({ href, label }: { href: string; label: string }) {
  const active = usePathname().startsWith(href);
  return (
    <Link
      href={href}
      className="rounded-lg px-3 py-1.5 text-sm"
      style={active
        ? { background: "color-mix(in srgb, var(--accent) 18%, transparent)", color: "var(--text)", fontWeight: 600 }
        : { color: "var(--muted)" }}
    >
      {label}
    </Link>
  );
}

export function LogoutButton() {
  const router = useRouter();
  return (
    <button
      className="btn-ghost btn w-full"
      onClick={async () => { await fetch("/api/logout", { method: "POST" }); router.push("/login"); router.refresh(); }}
    >
      Sign out
    </button>
  );
}
