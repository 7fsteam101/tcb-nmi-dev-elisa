"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Icon } from "@/components/icons";

// Compact date-range control: a single trigger button showing the active range,
// opening a popover with a preset list + a custom from/to. This is the standard
// dashboard pattern (Stripe / shadcn / Attio) — not an always-open chip bar.
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
  { key: "this_week", label: "This week", days: () => daysSinceMonday() + 1 },
  { key: "7d", label: "Last 7 days", days: () => 7 },
  { key: "30d", label: "Last 30 days", days: () => 30 },
  { key: "mtd", label: "Month to date", days: () => dayOfMonth() },
  { key: "90d", label: "Last 90 days", days: () => 90 },
  { key: "all", label: "All time", days: () => 365 },
];

export function DateRangeBar() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [showCustom, setShowCustom] = useState(false);
  const [from, setFrom] = useState(searchParams.get("from") ?? "");
  const [to, setTo] = useState(searchParams.get("to") ?? "");

  const isCustom = !!searchParams.get("from") && !!searchParams.get("to");
  const activePreset = searchParams.get("preset") ?? "30d";
  const currentLabel = isCustom
    ? `${fmt(searchParams.get("from")!)} - ${fmt(searchParams.get("to")!)}`
    : (PRESETS.find((p) => p.key === activePreset)?.label ?? "Last 30 days");

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const go = (mut: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(searchParams.toString());
    mut(p);
    setOpen(false);
    router.push(`${pathname}?${p.toString()}`);
  };

  return (
    <div className="relative" ref={ref}>
      <button type="button" onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px]"
        style={{ borderColor: "var(--line)", background: "var(--panel)", color: "var(--text)" }}>
        <Icon name="weekly" size={14} />
        <span>{currentLabel}</span>
        <span style={{ color: "var(--muted)" }}>▾</span>
      </button>
      {open && (
        <div className="absolute right-0 z-30 mt-1 w-60 overflow-hidden rounded-xl border py-1 shadow-xl"
          style={{ borderColor: "var(--line)", background: "var(--panel)" }}>
          {PRESETS.map((pre) => (
            <button key={pre.key} type="button"
              className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[13px] hover:bg-white/5"
              style={{ color: !isCustom && activePreset === pre.key ? "var(--accent)" : "var(--text)" }}
              onClick={() => go((p) => { p.set("days", String(pre.days())); p.set("preset", pre.key); p.delete("from"); p.delete("to"); })}>
              {pre.label}
              {!isCustom && activePreset === pre.key && <Icon name="dot" size={12} />}
            </button>
          ))}
          <div className="my-1 border-t" style={{ borderColor: "var(--line)" }} />
          <button type="button" onClick={() => setShowCustom((s) => !s)}
            className="flex w-full items-center justify-between px-3 py-1.5 text-left text-[13px] hover:bg-white/5"
            style={{ color: isCustom ? "var(--accent)" : "var(--text)" }}>
            Custom range <span style={{ color: "var(--muted)" }}>{showCustom || isCustom ? "▴" : "▾"}</span>
          </button>
          {(showCustom || isCustom) && (
            <div className="space-y-2 px-3 py-2">
              <label className="block text-[11px]" style={{ color: "var(--muted)" }}>
                Start
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-0.5 text-[13px]" />
              </label>
              <label className="block text-[11px]" style={{ color: "var(--muted)" }}>
                End
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-0.5 text-[13px]" />
              </label>
              <button type="button" disabled={!from || !to} className="btn w-full py-1 text-[13px]"
                onClick={() => go((p) => { p.set("from", from); p.set("to", to); p.delete("days"); p.delete("preset"); })}>
                Apply range
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function fmt(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
