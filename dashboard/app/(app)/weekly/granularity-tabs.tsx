"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Tab row for the Performance Report granularity: writes ?g=day|week|month|
// quarter|year, preserving every other query param. Same router+searchParams
// pattern as GranularityToggle / DateRangeBar; a separate component because this
// page needs the two extra grains (quarter, year) and a full tab-row treatment.
const TABS: { key: string; label: string }[] = [
  { key: "day", label: "Daily" },
  { key: "week", label: "Weekly" },
  { key: "month", label: "Monthly" },
  { key: "quarter", label: "Quarterly" },
  { key: "year", label: "Yearly" },
];

export function GranularityTabs({ active }: { active: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();
  return (
    <div
      role="tablist"
      aria-label="Report granularity"
      className="flex items-end gap-1 overflow-x-auto border-b"
      style={{ borderColor: "var(--line)" }}
    >
      {TABS.map((t) => {
        const is = active === t.key;
        return (
          <button
            key={t.key}
            type="button"
            role="tab"
            aria-selected={is}
            className="-mb-px shrink-0 rounded-t-lg px-3.5 py-2 text-[13px] transition-colors"
            style={{
              borderBottom: `2px solid ${is ? "var(--accent)" : "transparent"}`,
              color: is ? "var(--text)" : "var(--muted)",
              fontWeight: is ? 600 : 500,
              background: is ? "color-mix(in srgb, var(--accent) 8%, transparent)" : "transparent",
            }}
            onClick={() => {
              const p = new URLSearchParams(sp.toString());
              p.set("g", t.key);
              p.delete("grain"); // legacy param, superseded by the tabs
              router.push(`${pathname}?${p.toString()}`);
            }}
          >
            {t.label}
          </button>
        );
      })}
    </div>
  );
}
