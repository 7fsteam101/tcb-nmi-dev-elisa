import Link from "next/link";
import { ReactNode } from "react";

export function Card({ children, className = "", href }: { children: ReactNode; className?: string; href?: string }) {
  const body = <div className={`card p-4 ${href ? "card-hover" : ""} ${className}`}>{children}</div>;
  return href ? <Link href={href}>{body}</Link> : body;
}

export function Stat({
  label, value, sub, tone, help, href,
}: {
  label: string; value: string; sub?: string;
  tone?: "good" | "warn" | "bad"; help?: string; href?: string;
}) {
  const toneColor = tone === "good" ? "var(--good)" : tone === "warn" ? "var(--warn)" : tone === "bad" ? "var(--bad)" : "var(--text)";
  return (
    <Card href={href}>
      <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--muted)" }}>
        {label}
        {help && <InfoTip text={help} />}
      </div>
      <div className="mt-1 text-2xl font-semibold tracking-tight" style={{ color: toneColor }}>{value}</div>
      {sub && <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>{sub}</div>}
    </Card>
  );
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
      className="inline-block rounded-full border px-2 py-0.5 text-[11px] font-medium"
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

export const label = (s: string | null | undefined) => (s ?? "—").replaceAll("_", " ");
