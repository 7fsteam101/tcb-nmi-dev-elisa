// Resolves the filter window from the URL. Supports both preset day-counts
// (?days=&preset=) and a custom calendar window (?from=YYYY-MM-DD&to=YYYY-MM-DD).
// Returns an explicit [since, until) the queries bound on, so custom ranges are
// exact rather than "last N days from now".
export type Range = {
  days: number;           // span in days (for previous-period deltas)
  since: string;          // ISO start (inclusive)
  until: string;          // ISO end (exclusive)
  from: string | null;    // the custom from date, if any (YYYY-MM-DD)
  to: string | null;      // the custom to date, if any
  label: string;          // human window label
  custom: boolean;
};

const isDate = (s?: string) => !!s && /^\d{4}-\d{2}-\d{2}$/.test(s) && !isNaN(Date.parse(s));

export function resolveRange(sp: { days?: string; from?: string; to?: string }): Range {
  if (isDate(sp.from) && isDate(sp.to)) {
    const from = sp.from!, to = sp.to!;
    if (Date.parse(from) <= Date.parse(to)) {
      const since = `${from}T00:00:00`;
      const until = `${to}T23:59:59.999`;
      const days = Math.round((Date.parse(to) - Date.parse(from)) / 86400000) + 1;
      const fmt = (d: string) => new Date(d + "T12:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
      const y = new Date(to + "T12:00:00").getFullYear();
      return { days, since, until, from, to, label: `${fmt(from)} - ${fmt(to)}, ${y}`, custom: true };
    }
  }
  const days = Math.min(Math.max(parseInt(sp.days ?? "30", 10) || 30, 1), 365);
  const now = Date.now();
  return {
    days,
    since: new Date(now - days * 86400000).toISOString(),
    until: new Date(now).toISOString(),
    from: null, to: null,
    label: `Last ${days} day${days === 1 ? "" : "s"}`,
    custom: false,
  };
}

/** The immediately-preceding window of equal length, for period-over-period deltas. */
export function previousWindow(r: Range): { since: string; until: string } {
  const sinceMs = Date.parse(r.since), untilMs = Date.parse(r.until);
  const len = untilMs - sinceMs;
  return { since: new Date(sinceMs - len).toISOString(), until: new Date(sinceMs).toISOString() };
}
