"use client";

import { useState } from "react";
import { Icon } from "./icons";

// Dark / light switch. Sets data-theme on <html> immediately (no reload) and
// persists to a cookie so SSR renders the chosen theme with no flash next load.
export function ThemeToggle({ initial }: { initial: "dark" | "light" }) {
  const [theme, setTheme] = useState<"dark" | "light">(initial);
  const set = (t: "dark" | "light") => {
    setTheme(t);
    document.documentElement.setAttribute("data-theme", t);
    document.cookie = `tcb_theme=${t}; path=/; max-age=31536000; samesite=lax`;
  };
  return (
    <div className="inline-flex overflow-hidden rounded-lg border" style={{ borderColor: "var(--line)" }}>
      {(["light", "dark"] as const).map((t) => (
        <button key={t} type="button" onClick={() => set(t)} aria-label={`${t} mode`}
          className="flex items-center gap-1 px-2 py-1 text-[11px]"
          style={{
            background: theme === t ? "color-mix(in srgb, var(--accent) 16%, transparent)" : "transparent",
            color: theme === t ? "var(--accent)" : "var(--muted)",
          }}>
          <Icon name={t === "light" ? "sun" : "moon"} size={14} />
        </button>
      ))}
    </div>
  );
}
