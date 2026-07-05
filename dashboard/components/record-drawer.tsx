"use client";

import { useEffect } from "react";
import { useRouter } from "next/navigation";

// Airtable-style record panel: an entity opens as a drawer ON TOP of the current
// page (the page stays visible/dimmed behind). The content inside already
// carries its own X (EntityShell), so this is just the backdrop + right panel.
// Backdrop click / Esc closes (router.back), returning to whatever was underneath.
export function RecordDrawer({ children }: { children: React.ReactNode }) {
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
      <aside className="absolute right-0 top-0 h-full w-full overflow-y-auto border-l shadow-2xl md:w-[64%] lg:w-[58%]"
        style={{ background: "var(--bg)", borderColor: "var(--line)" }}>
        <div className="p-6">{children}</div>
      </aside>
    </div>
  );
}
