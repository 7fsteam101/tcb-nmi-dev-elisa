"use client";

import { useState } from "react";

// Top tabs for the Payment Links page: New link vs Recent links.
export function PaymentsTabs({ newLink, recent, recentCount }: { newLink: React.ReactNode; recent: React.ReactNode; recentCount: number }) {
  const [tab, setTab] = useState<"new" | "recent">("new");
  const TABS = [
    { key: "new" as const, label: "New payment link" },
    { key: "recent" as const, label: `Recent links${recentCount ? ` (${recentCount})` : ""}` },
  ];
  return (
    <div>
      <div className="mb-4 flex gap-1 border-b" style={{ borderColor: "var(--line)" }}>
        {TABS.map((t) => (
          <button key={t.key} type="button" onClick={() => setTab(t.key)}
            className="px-3 py-2 text-sm font-medium"
            style={{
              color: tab === t.key ? "var(--text)" : "var(--muted)",
              borderBottom: tab === t.key ? "2px solid var(--accent)" : "2px solid transparent",
              marginBottom: -1,
            }}>
            {t.label}
          </button>
        ))}
      </div>
      <div style={{ display: tab === "new" ? "block" : "none" }}>{newLink}</div>
      <div style={{ display: tab === "recent" ? "block" : "none" }}>{recent}</div>
    </div>
  );
}
