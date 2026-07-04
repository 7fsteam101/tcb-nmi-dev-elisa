"use client";

import { useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Preset buttons + a custom start/end picker in one dense row.
// Presets set ?days & ?preset (and clear from/to). Apply sets ?from & ?to
// (and clears days/preset), showing a "Custom" chip.
const TZ = "America/New_York";
const daysSinceMonday = () => {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(new Date());
  const i = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(wd);
  return i === -1 ? 0 : i;
};
const dayOfMonth = () => parseInt(new Intl.DateTimeFormat("en-US", { timeZone: TZ, day: "numeric" }).format(new Date()), 10) || 1;

const PRESETS: { key: string; label: string; days: () => number }[] = [
  { key: "today", label: "Today", days: () => 1 },
  { key: "yesterday", label: "Yesterday", days: () => 2 },
  { key: "this_week", label: "This Week", days: () => daysSinceMonday() + 1 },
  { key: "7d", label: "7D", days: () => 7 },
  { key: "30d", label: "30D", days: () => 30 },
  { key: "mtd", label: "MTD", days: () => dayOfMonth() },
  { key: "90d", label: "90D", days: () => 90 },
  { key: "all", label: "All", days: () => 365 },
];

export function DateRangeBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const activePreset = searchParams.get("preset");
  const isCustom = !!searchParams.get("from") && !!searchParams.get("to");
  const [from, setFrom] = useState(searchParams.get("from") ?? "");
  const [to, setTo] = useState(searchParams.get("to") ?? "");

  const go = (mutate: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(searchParams.toString());
    mutate(p);
    router.push(`${pathname}?${p.toString()}`);
  };

  return (
    <div className="flex flex-wrap items-center gap-1">
      {PRESETS.map((pre) => (
        <button key={pre.key} type="button" className="btn-ghost cursor-pointer rounded-md px-2 py-0.5 text-[11px]"
          style={!isCustom && (activePreset ?? "30d") === pre.key
            ? { background: "color-mix(in srgb, var(--accent) 18%, transparent)", borderColor: "var(--accent)", color: "var(--text)", fontWeight: 600 }
            : undefined}
          onClick={() => go((p) => { p.set("days", String(pre.days())); p.set("preset", pre.key); p.delete("from"); p.delete("to"); })}>
          {pre.label}
        </button>
      ))}
      <span className="mx-1 h-4 w-px" style={{ background: "var(--line)" }} />
      <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Start date"
        className="w-auto rounded-md px-1.5 py-0.5 text-[11px]" style={{ minWidth: 120 }} />
      <span className="text-[11px]" style={{ color: "var(--muted)" }}>to</span>
      <input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="End date"
        className="w-auto rounded-md px-1.5 py-0.5 text-[11px]" style={{ minWidth: 120 }} />
      <button type="button" className="btn cursor-pointer rounded-md px-2 py-0.5 text-[11px]" disabled={!from || !to}
        onClick={() => go((p) => { p.set("from", from); p.set("to", to); p.delete("days"); p.delete("preset"); })}>
        Apply
      </button>
      {isCustom && (
        <button type="button" className="btn-ghost cursor-pointer rounded-md px-2 py-0.5 text-[11px]"
          style={{ background: "color-mix(in srgb, var(--accent) 18%, transparent)", borderColor: "var(--accent)", color: "var(--text)" }}
          onClick={() => { setFrom(""); setTo(""); go((p) => { p.delete("from"); p.delete("to"); p.set("days", "30"); p.set("preset", "30d"); }); }}>
          Custom ✕
        </button>
      )}
    </div>
  );
}
