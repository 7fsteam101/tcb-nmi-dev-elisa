"use client";

import { useState, useRef, useEffect } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

// Multi-select for comparing cancellation / reschedule reasons on the Weekly
// page. Writes the chosen reasons as a comma-joined list to ?<param>=... (each
// reason value URL-encoded), preserving the rest of the query. When nothing is
// selected the param is removed and the caller shows Total only. Same client
// pattern as GranularityToggle / DateRangeBar (router + searchParams, no store).
export function ReasonMultiSelect({
  param,
  options,
  label = "Compare reasons",
}: {
  param: string;
  options: string[];
  label?: string;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);

  const raw = searchParams.get(param) ?? "";
  const selected = new Set(
    raw.split(",").map((s) => s.trim()).filter(Boolean).map(decodeURIComponent),
  );

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const commit = (next: Set<string>) => {
    const p = new URLSearchParams(searchParams.toString());
    if (next.size) p.set(param, Array.from(next).map(encodeURIComponent).join(","));
    else p.delete(param);
    router.push(`${pathname}?${p.toString()}`);
  };

  const toggle = (name: string) => {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    commit(next);
  };

  const summary =
    selected.size === 0
      ? "Total only"
      : selected.size === 1
        ? Array.from(selected)[0]
        : `${selected.size} reasons`;

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[13px]"
        style={{ borderColor: "var(--line)", background: "var(--panel)", color: "var(--text)" }}
      >
        <span style={{ color: "var(--muted)" }}>{label}:</span>
        <span className="max-w-[14rem] truncate">{summary}</span>
        <span style={{ color: "var(--muted)" }}>▾</span>
      </button>
      {open && (
        <div
          className="absolute right-0 z-30 mt-1 max-h-72 w-72 overflow-auto rounded-xl border py-1 shadow-xl"
          style={{ borderColor: "var(--line)", background: "var(--panel)" }}
        >
          {options.length === 0 && (
            <div className="px-3 py-2 text-[12px]" style={{ color: "var(--muted)" }}>
              No reasons recorded in this window
            </div>
          )}
          {options.map((name) => {
            const on = selected.has(name);
            return (
              <button
                key={name}
                type="button"
                onClick={() => toggle(name)}
                className="flex w-full items-center gap-2 px-3 py-1.5 text-left text-[13px] hover:bg-white/5"
                style={{ color: "var(--text)" }}
              >
                <span
                  className="inline-flex h-4 w-4 shrink-0 items-center justify-center rounded border text-[10px] leading-none"
                  style={{
                    borderColor: on ? "var(--accent)" : "var(--line)",
                    background: on ? "var(--accent)" : "transparent",
                    color: on ? "#0C1117" : "transparent",
                  }}
                >
                  {on ? "✓" : ""}
                </span>
                <span className="min-w-0 flex-1 truncate capitalize">{name}</span>
              </button>
            );
          })}
          {selected.size > 0 && (
            <>
              <div className="my-1 border-t" style={{ borderColor: "var(--line)" }} />
              <button
                type="button"
                onClick={() => commit(new Set())}
                className="w-full px-3 py-1.5 text-left text-[13px] hover:bg-white/5"
                style={{ color: "var(--muted)" }}
              >
                Clear selection
              </button>
            </>
          )}
        </div>
      )}
    </div>
  );
}
