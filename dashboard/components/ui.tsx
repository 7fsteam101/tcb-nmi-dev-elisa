import Link from "next/link";
import { ReactNode, CSSProperties } from "react";

export function Card({ children, className = "", href }: { children: ReactNode; className?: string; href?: string }) {
  const body = <div className={`card p-4 ${href ? "card-hover" : ""} ${className}`}>{children}</div>;
  return href ? <Link href={href}>{body}</Link> : body;
}

// Airtable-style stat: a compact tinted box (the background is colored, not the
// panel), a large bold number in the tone color, minimal chrome. Default tone is
// accent (blue) so every metric reads as colored.
export function Stat({
  label, value, sub, tone, help, href,
}: {
  label: string; value: string; sub?: string;
  tone?: "good" | "warn" | "bad" | "accent" | "neutral"; help?: string; href?: string;
}) {
  const c = tone === "good" ? "var(--good)" : tone === "warn" ? "var(--warn)" : tone === "bad" ? "var(--bad)"
    : tone === "neutral" ? "var(--muted)" : "var(--accent)";
  const inner = (
    <>
      <div className="flex items-center gap-1.5 text-[11px] font-medium uppercase tracking-wide" style={{ color: "var(--muted)" }}>
        {label}
        {help && <InfoTip text={help} />}
      </div>
      <div className="mt-1.5 text-[26px] font-bold leading-none tracking-tight tabular-nums" style={{ color: c }}>{value}</div>
      {sub && <div className="mt-1.5 text-[11px]" style={{ color: "var(--muted)" }}>{sub}</div>}
    </>
  );
  const style = {
    background: `color-mix(in srgb, ${c} 14%, var(--panel))`,
    borderColor: `color-mix(in srgb, ${c} 32%, transparent)`,
  } as CSSProperties;
  const cls = "block rounded-xl border px-3.5 py-3 transition-colors";
  return href
    ? <a href={href} className={cls + " hover:brightness-110"} style={style}>{inner}</a>
    : <div className={cls} style={style}>{inner}</div>;
}

export function InfoTip({ text }: { text: string }) {
  return (
    <span
      title={text}
      className="inline-flex h-4 w-4 cursor-help items-center justify-center rounded-full border text-[10px] leading-none"
      style={{ borderColor: "var(--line)", color: "var(--muted)" }}
    >
      i
    </span>
  );
}

export function SectionTitle({ children, right }: { children: ReactNode; right?: ReactNode }) {
  return (
    <div className="mb-3 mt-8 flex items-center justify-between first:mt-0">
      <h2 className="text-sm font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>{children}</h2>
      {right}
    </div>
  );
}

export function Badge({ children, tone = "neutral" }: { children: ReactNode; tone?: "good" | "warn" | "bad" | "neutral" | "accent" }) {
  const colors: Record<string, string> = {
    good: "var(--good)", warn: "var(--warn)", bad: "var(--bad)", neutral: "var(--muted)", accent: "var(--accent)",
  };
  return (
    <span
      className="inline-block rounded-full border px-2 py-0.5 text-[12px] font-medium"
      style={{ color: colors[tone], borderColor: `color-mix(in srgb, ${colors[tone]} 40%, transparent)`, background: `color-mix(in srgb, ${colors[tone]} 10%, transparent)` }}
    >
      {children}
    </span>
  );
}

/** Tiny dependency-free bar chart. */
export function MiniBars({
  data, height = 56, color = "var(--accent)", labels,
}: { data: number[]; height?: number; color?: string; labels?: string[] }) {
  const max = Math.max(...data, 1);
  const w = 100 / Math.max(data.length, 1);
  return (
    <svg viewBox={`0 0 100 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
      {data.map((v, i) => {
        const h = Math.max((v / max) * (height - 4), v > 0 ? 2 : 0.5);
        return (
          <rect key={i} x={i * w + w * 0.15} y={height - h} width={w * 0.7} height={h} rx={1}
            fill={color} opacity={v > 0 ? 0.9 : 0.25}>
            {labels && <title>{`${labels[i]}: ${v}`}</title>}
          </rect>
        );
      })}
    </svg>
  );
}

export const STATUS_TONE: Record<string, "good" | "warn" | "bad" | "neutral" | "accent"> = {
  taken: "good", confirmed: "accent", scheduled: "neutral", rescheduled: "warn",
  no_show: "bad", cancelled_by_lead: "bad", cancelled_by_team: "warn",
  paid: "good", late: "warn", delinquent: "bad", waived: "neutral",
  closed: "good", follow_up: "warn", dq_on_call: "bad", no_decision: "neutral",
  connected: "good", expired: "warn", error: "bad", disconnected: "neutral",
  pending: "warn", sent: "good", failed: "bad", skipped: "neutral",
};

// Human status label: underscores to spaces, first letter capitalized, and a
// few known acronyms upper-cased. "no_show" -> "No show", "won_pif" -> "Won PIF".
const ACRONYMS: Record<string, string> = { pif: "PIF", pp: "PP", dq: "DQ", csm: "CSM", nafa: "NAFA", ghl: "GHL", nmi: "NMI", cpl: "CPL", roas: "ROAS", aov: "AOV" };
export const label = (s: string | null | undefined) => {
  if (s == null || s === "") return "—";
  const out = String(s).replaceAll("_", " ").split(" ").map((w) => ACRONYMS[w.toLowerCase()] ?? w).join(" ");
  return out.charAt(0).toUpperCase() + out.slice(1);
};
