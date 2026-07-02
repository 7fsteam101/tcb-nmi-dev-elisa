"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";

const PRESETS = [7, 14, 30, 60, 90];

/** Preset date-range buttons. Sets ?days=N on the current pathname, preserving other params. */
export function RangePicker() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const active = parseInt(searchParams.get("days") ?? "30", 10) || 30;

  return (
    <div className="flex items-center gap-1">
      {PRESETS.map((d) => (
        <button
          key={d}
          type="button"
          className="btn-ghost cursor-pointer rounded-lg px-2.5 py-1 text-xs"
          style={
            active === d
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
            params.set("days", String(d));
            router.push(`${pathname}?${params.toString()}`);
          }}
        >
          {d}d
        </button>
      ))}
    </div>
  );
}
