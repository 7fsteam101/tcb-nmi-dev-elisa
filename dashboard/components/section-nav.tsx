"use client";

import { useEffect, useRef, useState } from "react";

export type NavSection = { id: string; label: string; count: number };

// Segmented pill jump-nav for the contact profile. Same anchors, labels and
// counts as the old flat link row, restyled as pills on a raised panel strip,
// plus a scroll-spy: an IntersectionObserver watches the section elements and
// fills the pill whose section currently sits at the top of the scroll area.
// Links stay plain anchors (href="#id"), so hash deep-links and default anchor
// scrolling keep working with zero JS. The wrapper keeps the previous sticky
// behavior: top-0, opaque --bg so sections slide under it cleanly, zIndex 5 so
// it tucks under the drawer's own sticky bar (z-10).
export function SectionNav({ sections }: { sections: NavSection[] }) {
  const [active, setActive] = useState(sections[0]?.id ?? "");
  const navRef = useRef<HTMLElement | null>(null);
  const key = sections.map((s) => s.id).join("|");

  useEffect(() => {
    const ids = key.split("|").filter(Boolean);
    // Scope lookups to this profile body (the nav's parent element), not the
    // whole document: a drawer can overlay a page that reuses the same ids.
    const scope: ParentNode = navRef.current?.parentElement ?? document;
    const els = ids
      .map((id) => scope.querySelector<HTMLElement>(`[id="${id}"]`))
      .filter((el): el is HTMLElement => el !== null);
    if (els.length === 0) return;

    // Spy band: from 96px below the viewport top (clears the stuck nav and
    // matches the sections' scrollMarginTop of 80) down to 65% of the viewport
    // height. Of the sections intersecting that band, the topmost in document
    // order wins, so the active pill flips as a section heading nears the top.
    // Works in the drawer too: it is a full-height scroll container at top 0,
    // and the observer clips section rects through it.
    const inView = new Set<string>();
    const io = new IntersectionObserver(
      (entries) => {
        for (const e of entries) {
          if (e.isIntersecting) inView.add(e.target.id);
          else inView.delete(e.target.id);
        }
        const top = ids.find((id) => inView.has(id));
        if (top) setActive(top);
      },
      { rootMargin: "-96px 0px -35% 0px" },
    );
    els.forEach((el) => io.observe(el));
    return () => io.disconnect();
  }, [key]);

  return (
    <nav ref={navRef} aria-label="Profile sections" className="sticky top-0 py-1.5" style={{ background: "var(--bg)", zIndex: 5 }}>
      {/* ghost-pill resting/hover colors live in a tiny style block because
          inline styles cannot express :hover (and would outrank it if set) */}
      <style>{`.snav-pill{color:var(--muted);border-color:transparent}.snav-pill:hover{background:var(--panel-2);color:var(--text)}`}</style>
      <div className="flex flex-wrap gap-1 rounded-xl border p-1" style={{ background: "var(--panel)", borderColor: "var(--line)" }}>
        {sections.map((s) => {
          const on = s.id === active;
          return (
            <a
              key={s.id}
              href={`#${s.id}`}
              aria-current={on ? "location" : undefined}
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
            </a>
          );
        })}
      </div>
    </nav>
  );
}
