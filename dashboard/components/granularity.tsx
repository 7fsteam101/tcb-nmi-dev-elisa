"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Small segmented control for chart granularity: Daily / Weekly / Monthly.
// Writes ?grain=day|week|month, preserving the rest of the query.
const OPTS = [
  { key: "day", label: "Daily" },
  { key: "week", label: "Weekly" },
  { key: "month", label: "Monthly" },
];

export function GranularityToggle({ param = "grain", defaultGrain = "week" }: { param?: string; defaultGrain?: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  const active = sp.get(param) ?? defaultGrain;
  return (
    <div className="inline-flex overflow-hidden rounded-lg border" style={{ borderColor: "var(--line)" }}>
      {OPTS.map((o, i) => (
        <button key={o.key} type="button"
          className="px-2.5 py-1 text-[12px]"
          style={{
            background: active === o.key ? "color-mix(in srgb, var(--accent) 18%, transparent)" : "var(--panel)",
            color: active === o.key ? "var(--text)" : "var(--muted)",
            fontWeight: active === o.key ? 600 : 400,
            borderLeft: i ? "1px solid var(--line)" : undefined,
          }}
          onClick={() => {
            const p = new URLSearchParams(sp.toString());
            p.set(param, o.key);
            router.push(`${pathname}?${p.toString()}`);
          }}>
          {o.label}
        </button>
      ))}
    </div>
  );
}
