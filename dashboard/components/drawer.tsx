"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Right-side half-screen slide-over used by intercepting routes. Closing (click
// backdrop / Esc / the X) does router.back(), which unwinds the intercept and
// returns to the underlying list without a full navigation.
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
      <div className="absolute inset-0" style={{ background: "rgba(0,0,0,0.5)" }} onClick={() => router.back()} />
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
