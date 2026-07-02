// Money is stored as integer minor units (cents). Divide by 100 to display.
export function money(minor: number | string | null | undefined, opts: { cents?: boolean } = {}): string {
  const n = Number(minor ?? 0) / 100;
  return n.toLocaleString("en-US", {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: opts.cents ? 2 : 0,
    maximumFractionDigits: opts.cents ? 2 : 0,
  });
}

export function pct(value: number | string | null | undefined, digits = 1): string {
  const n = Number(value ?? 0);
  return `${(n * 100).toFixed(digits)}%`;
}

export function num(value: number | string | null | undefined): string {
  return Number(value ?? 0).toLocaleString("en-US");
}

export function shortDate(d: string | Date | null | undefined, tz = "America/New_York"): string {
  if (!d) return "—";
  return new Date(d).toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: tz });
}

export function dateTime(d: string | Date | null | undefined, tz = "America/New_York"): string {
  if (!d) return "—";
  return new Date(d).toLocaleString("en-US", {
    month: "short", day: "numeric", hour: "numeric", minute: "2-digit", timeZone: tz,
  });
}
