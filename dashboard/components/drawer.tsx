"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Right-side half-screen slide-over used by intercepting routes. Closing (click
// on the dimmed backdrop / Esc / the Close button) does router.back(), which
// unwinds the intercept and returns to the underlying list without a full
// navigation. Clicks INSIDE the panel can never close it: the backdrop is a
// SIBLING of the aside (not an ancestor), so a click composed inside the panel
// never reaches the backdrop handler, and a drag that starts in the panel and
// releases over the backdrop fires its click on the shared parent (which has
// no handler), not on the backdrop.
export function Drawer({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") router.back(); };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = ""; };
  }, [router]);

  return (
    <div className="fixed inset-0 z-40">
      <div aria-hidden className="absolute inset-0 cursor-pointer" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => router.back()} />
      <aside className="absolute right-0 top-0 h-full w-full overflow-y-auto border-l shadow-2xl md:w-[55%] lg:w-[52%]"
        style={{ background: "var(--bg)", borderColor: "var(--line)" }}>
        <div className="sticky top-0 z-10 flex items-center justify-between border-b px-6 py-3"
          style={{ borderColor: "var(--line)", background: "color-mix(in srgb, var(--bg) 92%, transparent)", backdropFilter: "blur(6px)" }}>
          <span className="text-xs font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>Contact</span>
          <button onClick={() => router.back()} className="btn-ghost btn px-2 py-0.5 text-xs">Close ✕</button>
        </div>
        <div className="p-6">{children}</div>
      </aside>
    </div>
  );
}
