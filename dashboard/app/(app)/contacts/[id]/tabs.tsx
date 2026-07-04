"use client";

import { useState } from "react";

// Section tabs for the contact profile. Server renders each panel's content and
// passes it in; this just switches which one is visible.
export function ContactTabs({ tabs }: { tabs: { key: string; label: string; badge?: number; content: React.ReactNode }[] }) {
  const [active, setActive] = useState(tabs[0]?.key);
  return (
    <div>
      <div className="mb-4 flex flex-wrap gap-1 border-b" style={{ borderColor: "var(--line)" }}>
        {tabs.map((t) => (
          <button key={t.key} type="button" onClick={() => setActive(t.key)}
            className="flex items-center gap-1.5 px-3 py-2 text-[13px] font-medium"
            style={{
              color: active === t.key ? "var(--text)" : "var(--muted)",
              borderBottom: active === t.key ? "2px solid var(--accent)" : "2px solid transparent",
              marginBottom: -1,
            }}>
            {t.label}
            {t.badge ? <span className="rounded-full px-1.5 text-[10px]" style={{ background: "var(--panel-2)", color: "var(--muted)" }}>{t.badge}</span> : null}
          </button>
        ))}
      </div>
      {tabs.map((t) => (
        <div key={t.key} style={{ display: active === t.key ? "block" : "none" }}>{t.content}</div>
      ))}
    </div>
  );
}
