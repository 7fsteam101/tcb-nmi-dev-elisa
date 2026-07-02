// Pure access rules — safe to import from client components.
// (Server-side enforcement lives in lib/access.ts.)
export const PAGES = ["overview", "funnel", "calls", "receivables", "reps", "marketing", "forms"] as const;
export type PageKey = (typeof PAGES)[number];

export const PAGE_LABELS: Record<PageKey, string> = {
  overview: "Overview", funnel: "Funnel & Leakage", calls: "Calls", receivables: "Receivables",
  reps: "Reps & Commission", marketing: "Marketing", forms: "Forms",
};

export const ROLE_DEFAULTS: Record<string, PageKey[]> = {
  admin: [...PAGES],
  leadership: [...PAGES],
  closer: ["overview", "calls", "funnel", "forms"],
  setter: ["calls", "forms"],
  csm: ["overview", "calls", "receivables", "forms"],
};

export function effectivePages(role: string, overrides: Record<string, boolean> | null): PageKey[] {
  const defaults = new Set(ROLE_DEFAULTS[role] ?? []);
  for (const [page, allowed] of Object.entries(overrides ?? {})) {
    if (!PAGES.includes(page as PageKey)) continue;
    if (allowed) defaults.add(page as PageKey);
    else defaults.delete(page as PageKey);
  }
  return PAGES.filter((p) => defaults.has(p));
}
