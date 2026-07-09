"use client";

import { CSSProperties, ReactNode, useLayoutEffect, useState } from "react";

export type TabSection = { id: string; label: string; count: number; panel: ReactNode };

const TONE: Record<string, string> = {
  good: "var(--good)", warn: "var(--warn)", bad: "var(--bad)", accent: "var(--accent)", neutral: "var(--muted)",
};

// Real tabs for the contact profile (Katie, July 9): clicking a pill SHOWS that
// section's panel and hides the others, instead of scroll-jumping down one long
// page. The server component renders every panel and passes it in as a slot, so
// all queries stay on the server; this wrapper only toggles visibility
// (display:none for inactive panels is the accepted trade-off, since the ask is
// tab behavior rather than anchor landing on first paint).
//
// Hash deep-links still land: on mount (useLayoutEffect, so before first paint)
// a location.hash that matches a section id activates that tab, and a
// hashchange listener keeps in-page anchors working (e.g. the Opt-ins KPI tile
// links to #opt-ins). Pill clicks replaceState the hash so the URL stays
// shareable without adding history entries: in the drawer, Back must still
// close the drawer in one step.
export function SectionTabs({ sections }: { sections: TabSection[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");
  const key = sections.map((s) => s.id).join("|");

  useLayoutEffect(() => {
    const ids = key.split("|");
    const apply = () => {
      const h = window.location.hash.replace(/^#/, "");
      if (h && ids.includes(h)) setActive(h);
    };
    apply();
    window.addEventListener("hashchange", apply);
    return () => window.removeEventListener("hashchange", apply);
  }, [key]);

  const pick = (id: string) => {
    setActive(id);
    // replaceState (not location.hash =) so tab switches never stack history
    window.history.replaceState(null, "", `#${id}`);
  };

  return (
    <div>
      {/* pill strip: same styling as the old jump nav (active = filled accent),
          sticky/opaque/zIndex-5 wrapper kept so it tucks under the drawer's own
          sticky bar (z-10). Ghost-pill hover colors live in a tiny style block
          because inline styles cannot express :hover. */}
      <nav aria-label="Profile sections" className="sticky top-0 py-1.5" style={{ background: "var(--bg)", zIndex: 5 }}>
        <style>{`.snav-pill{color:var(--muted);border-color:transparent}.snav-pill:hover{background:var(--panel-2);color:var(--text)}`}</style>
        <div role="tablist" className="flex flex-wrap gap-1 rounded-xl border p-1" style={{ background: "var(--panel)", borderColor: "var(--line)" }}>
          {sections.map((s) => {
            const on = s.id === active;
            return (
              <button
                key={s.id}
                type="button"
                role="tab"
                id={`tab-${s.id}`}
                aria-selected={on}
                aria-controls={s.id}
                onClick={() => pick(s.id)}
                className={`flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-[13px] font-medium transition-colors${on ? "" : " snav-pill"}`}
                style={on ? {
                  background: "color-mix(in srgb, var(--accent) 16%, var(--panel))",
                  borderColor: "color-mix(in srgb, var(--accent) 38%, var(--line))",
                  color: "var(--accent)",
                } : undefined}
              >
                {s.label}
                {s.count > 0 && (
                  <span className="num rounded-full px-1.5 text-[10px] font-semibold leading-4"
                    style={{ background: "color-mix(in srgb, var(--accent) 15%, transparent)", color: "var(--accent)" }}>
                    {s.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </nav>
      {sections.map((s) => (
        <div key={s.id} id={s.id} role="tabpanel" aria-labelledby={`tab-${s.id}`} className="mt-3"
          style={{ display: s.id === active ? undefined : "none" }}>
          {s.panel}
        </div>
      ))}
    </div>
  );
}

// Collapsible tone-tinted group box: each profile section renders inside one of
// these. Stronger color identity per Katie's July 9 feedback: tinted background
// (tone 7% into the panel), tone-mixed border (30% into the line color), and
// the section title lives INSIDE the box header next to the tone dot. The
// chevron toggles the body (client state, default expanded); the body is
// hidden, not unmounted, so form state (e.g. a half-written note) survives a
// collapse. --sect cascades the tone down so TCards inside pick up a faint
// tinted border, same mechanism as the old flat sections.
export function SectionGroup({ title, tone = "neutral", count, defaultOpen = true, children }: {
  title: string;
  tone?: "good" | "warn" | "bad" | "accent" | "neutral";
  count?: number;
  defaultOpen?: boolean;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  const c = TONE[tone] ?? "var(--muted)";
  return (
    <section
      className="rounded-xl border"
      style={{
        background: `color-mix(in srgb, ${c} 7%, var(--panel))`,
        borderColor: `color-mix(in srgb, ${c} 30%, var(--line))`,
        "--sect": c,
      } as CSSProperties}
    >
      <button type="button" aria-expanded={open} onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center gap-2 rounded-xl px-4 py-2.5 text-left">
        <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: c }} />
        <h2 className="text-sm font-semibold" style={{ color: "var(--text)" }}>{title}</h2>
        {typeof count === "number" && count > 0 && (
          <span className="num rounded-full px-1.5 text-[10px] font-semibold leading-4"
            style={{ background: `color-mix(in srgb, ${c} 15%, transparent)`, color: c }}>
            {count}
          </span>
        )}
        <svg aria-hidden width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor"
          strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
          className={`ml-auto shrink-0 transition-transform${open ? "" : " -rotate-90"}`}
          style={{ color: "var(--muted)" }}>
          <path d="M6 9l6 6 6-6" />
        </svg>
      </button>
      <div className="px-4 pb-3.5" style={{ display: open ? undefined : "none" }}>{children}</div>
    </section>
  );
}
