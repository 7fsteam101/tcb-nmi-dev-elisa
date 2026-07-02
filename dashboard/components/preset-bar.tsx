"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Presets resolve in the report timezone so "Today" / "This Week" / "MTD"
// match what the client sees on their calendar, not the browser's zone.
const TZ = "America/New_York";

/** Days elapsed since Monday (0 on Monday .. 6 on Sunday) in the report timezone. */
function daysSinceMonday(): number {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(new Date());
  const i = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(wd);
  return i === -1 ? 0 : i;
}

/** Day of month (1-31) in the report timezone. */
function dayOfMonth(): number {
  return parseInt(new Intl.DateTimeFormat("en-US", { timeZone: TZ, day: "numeric" }).format(new Date()), 10) || 1;
}

const PRESETS: { key: string; label: string; days: () => number }[] = [
  { key: "today", label: "Today", days: () => 1 },
  { key: "yesterday", label: "Yesterday", days: () => 2 },
  { key: "this_week", label: "This Week", days: () => daysSinceMonday() + 1 },
  { key: "last_week", label: "Last Week", days: () => 14 },
  { key: "last_month", label: "Last Month", days: () => 60 },
  { key: "7d", label: "7D", days: () => 7 },
  { key: "30d", label: "30D", days: () => 30 },
  { key: "90d", label: "90D", days: () => 90 },
  { key: "mtd", label: "MTD", days: () => dayOfMonth() },
  { key: "all", label: "All", days: () => 365 },
];

/**
 * Preset range buttons. Sets BOTH ?days=N (computed at click time) and
 * ?preset=key on the current pathname, preserving all other params.
 */
export function PresetBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = searchParams.get("preset") ?? "30d";

  return (
    <div className="flex flex-wrap items-center gap-1">
      {PRESETS.map((p) => (
        <button
          key={p.key}
          type="button"
          className="btn-ghost cursor-pointer rounded-md px-2 py-0.5 text-[11px]"
          style={
            active === p.key
              ? {
                  background: "color-mix(in srgb, var(--accent) 18%, transparent)",
                  borderColor: "var(--accent)",
                  color: "var(--text)",
                  fontWeight: 600,
                }
              : undefined
          }
          onClick={() => {
            const params = new URLSearchParams(searchParams.toString());
            params.set("days", String(p.days()));
            params.set("preset", p.key);
            router.push(`${pathname}?${params.toString()}`);
          }}
        >
          {p.label}
        </button>
      ))}
    </div>
  );
}
