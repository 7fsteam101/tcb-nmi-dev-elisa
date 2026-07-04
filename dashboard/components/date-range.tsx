"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Filter bar: visible quick-range pills + a Custom dropdown (extra presets +
// start/end pickers). Consistent on every page. Presets set ?days & ?preset;
// custom sets ?from & ?to.
const TZ = "America/New_York";
const daysSinceMonday = () => {
  const wd = new Intl.DateTimeFormat("en-US", { timeZone: TZ, weekday: "short" }).format(new Date());
  const i = ["Mon", "Tue", "Wed", "Thu", "Fri", "Sat", "Sun"].indexOf(wd);
  return i === -1 ? 0 : i;
};
const dayOfMonth = () => parseInt(new Intl.DateTimeFormat("en-US", { timeZone: TZ, day: "numeric" }).format(new Date()), 10) || 1;

// visible pills
const QUICK: { key: string; label: string; days: () => number }[] = [
  { key: "today", label: "Today", days: () => 1 },
  { key: "yesterday", label: "Yesterday", days: () => 2 },
  { key: "30d", label: "30D", days: () => 30 },
  { key: "60d", label: "60D", days: () => 60 },
  { key: "90d", label: "90D", days: () => 90 },
  { key: "mtd", label: "MTD", days: () => dayOfMonth() },
];
// extra presets inside the dropdown
const MORE: { key: string; label: string; days: () => number }[] = [
  { key: "this_week", label: "This week", days: () => daysSinceMonday() + 1 },
  { key: "7d", label: "Last 7 days", days: () => 7 },
  { key: "qtd", label: "Quarter to date", days: () => 92 },
  { key: "all", label: "All time", days: () => 365 },
];

export function DateRangeBar() {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [from, setFrom] = useState(sp.get("from") ?? "");
  const [to, setTo] = useState(sp.get("to") ?? "");

  const isCustom = !!sp.get("from") && !!sp.get("to");
  const activePreset = sp.get("preset") ?? "30d";

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const go = (mut: (p: URLSearchParams) => void) => {
    const p = new URLSearchParams(sp.toString());
    mut(p);
    setOpen(false);
    router.push(`${pathname}?${p.toString()}`);
  };
  const pickPreset = (key: string, days: number) =>
    go((p) => { p.set("days", String(days)); p.set("preset", key); p.delete("from"); p.delete("to"); });

  const pill = (active: boolean) => ({
    background: active ? "var(--accent)" : "var(--panel)",
    color: active ? "#fff" : "var(--muted)",
    borderColor: active ? "var(--accent)" : "var(--line)",
  });

  const customLabel = isCustom ? `${fmt(sp.get("from")!)} - ${fmt(sp.get("to")!)}` : "Custom";

  return (
    <div className="flex flex-wrap items-center gap-1.5" ref={ref}>
      {QUICK.map((q) => (
        <button key={q.key} type="button" onClick={() => pickPreset(q.key, q.days())}
          className="rounded-lg border px-2.5 py-1 text-[12px] font-medium transition-colors"
          style={pill(!isCustom && activePreset === q.key)}>
          {q.label}
        </button>
      ))}
      <div className="relative">
        <button type="button" onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] font-medium"
          style={pill(isCustom)}>
          {customLabel} <span style={{ opacity: 0.7 }}>▾</span>
        </button>
        {open && (
          <div className="absolute right-0 z-30 mt-1 w-56 rounded-xl border p-1 shadow-xl"
            style={{ borderColor: "var(--line)", background: "var(--panel)" }}>
            {MORE.map((m) => (
              <button key={m.key} type="button" onClick={() => pickPreset(m.key, m.days())}
                className="block w-full rounded-md px-3 py-1.5 text-left text-[13px] hover:bg-white/5"
                style={{ color: !isCustom && activePreset === m.key ? "var(--accent)" : "var(--text)" }}>
                {m.label}
              </button>
            ))}
            <div className="my-1 border-t" style={{ borderColor: "var(--line)" }} />
            <div className="px-2 py-1">
              <label className="block text-[11px]" style={{ color: "var(--muted)" }}>Start date
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-0.5 text-[13px]" />
              </label>
              <label className="mt-2 block text-[11px]" style={{ color: "var(--muted)" }}>End date
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-0.5 text-[13px]" />
              </label>
              <button type="button" disabled={!from || !to} className="btn mt-2 w-full py-1 text-[13px]"
                onClick={() => go((p) => { p.set("from", from); p.set("to", to); p.delete("days"); p.delete("preset"); })}>
                Apply range
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function fmt(d: string) {
  return new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
