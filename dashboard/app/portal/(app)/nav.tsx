"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

// A portal header nav link that highlights when it's the current page (the layout
// is an async Server Component, so the active check has to live in a client
// component — same split the admin tabs use).
export function PortalNavLink({ href, label, accent }: { href: string; label: string; accent: string }) {
  const active = usePathname() === href;
  return (
    <Link
      href={href}
      aria-current={active ? "page" : undefined}
      style={{
        color: active ? accent : "#8aa0bd",
        textDecoration: "none",
        fontWeight: active ? 700 : 400,
        borderBottom: active ? `2px solid ${accent}` : "2px solid transparent",
        paddingBottom: 2,
        transition: "color 120ms ease",
      }}
    >
      {label}
    </Link>
  );
}
