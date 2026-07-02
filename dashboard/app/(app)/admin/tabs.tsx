"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

export function AdminTab({ href, label }: { href: string; label: string }) {
  const active = usePathname().startsWith(href);
  return (
    <Link href={href} className="rounded-lg px-3 py-1.5 text-sm"
      style={active
        ? { background: "color-mix(in srgb, var(--accent) 18%, transparent)", fontWeight: 600 }
        : { color: "var(--muted)" }}>
      {label}
    </Link>
  );
}
