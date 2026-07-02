import { Card, InfoTip } from "./ui";

// Sparkline geometry: normalized viewBox stretched to the card width.
const SPARK_W = 100;
const SPARK_H = 36;
const SPARK_COLOR = "var(--good)";

/**
 * KPI stat card with a previous-period delta chip and a bottom sparkline.
 * Server-compatible (no hooks); dependency-free inline SVG.
 * Same card anatomy as Stat, plus trend context.
 */
export function StatSpark({
  label, value, series, deltaPct, tone, help, href,
}: {
  label: string;
  value: string;
  series: number[];
  deltaPct: number | null;
  tone?: "good" | "warn" | "bad";
  help?: string;
  href?: string;
}) {
  const toneColor = tone === "good" ? "var(--good)" : tone === "warn" ? "var(--warn)" : tone === "bad" ? "var(--bad)" : "var(--text)";
  const gradientId = `spark-${label.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "") || "stat"}`;

  return (
    <Card href={href}>
      <div className="flex items-center gap-1.5 text-[11px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>
        {label}
        {help && <InfoTip text={help} />}
      </div>
      <div className="mt-1 flex items-baseline gap-2">
        <span className="text-2xl font-semibold tracking-tight" style={{ color: toneColor }}>{value}</span>
        <DeltaChip deltaPct={deltaPct} />
      </div>
      <div className="-mx-4 -mb-4 mt-3 overflow-hidden rounded-b-xl">
        <Sparkline series={series} gradientId={gradientId} />
      </div>
    </Card>
  );
}

/** Change vs the previous period: up in green, down in red, no baseline = muted "flat". */
function DeltaChip({ deltaPct }: { deltaPct: number | null }) {
  let color = "var(--muted)";
  let text = "flat";
  if (deltaPct !== null && deltaPct !== 0) {
    const up = deltaPct > 0;
    color = up ? "var(--good)" : "var(--bad)";
    text = `${up ? "▲" : "▼"} ${Math.abs(deltaPct).toFixed(1)}%`;
  }
  return (
    <span
      title="vs previous period"
      className="inline-block rounded-full border px-1.5 py-0.5 text-[11px] font-medium leading-none"
      style={{
        color,
        borderColor: `color-mix(in srgb, ${color} 40%, transparent)`,
        background: `color-mix(in srgb, ${color} 10%, transparent)`,
      }}
    >
      {text}
    </span>
  );
}

/** Area sparkline: polyline over a soft vertical gradient fill, full card width. */
function Sparkline({ series, gradientId }: { series: number[]; gradientId: string }) {
  const clean = series.map((v) => (Number.isFinite(v) ? v : 0));
  // Always draw at least a flat baseline so grid cards keep equal heights.
  const data = clean.length === 0 ? [0, 0] : clean.length === 1 ? [clean[0], clean[0]] : clean;
  const min = Math.min(...data);
  const max = Math.max(...data);
  const span = max - min;

  const points = data
    .map((v, i) => {
      const x = (i / (data.length - 1)) * SPARK_W;
      // 3px margins top and bottom; a flat series sits mid-card if positive, near the floor if zero.
      const y = span === 0 ? (max > 0 ? SPARK_H / 2 : SPARK_H - 3) : 3 + ((max - v) / span) * (SPARK_H - 6);
      return `${x.toFixed(2)},${y.toFixed(2)}`;
    })
    .join(" ");
  const area = `${points} ${SPARK_W},${SPARK_H} 0,${SPARK_H}`;

  return (
    <svg
      viewBox={`0 0 ${SPARK_W} ${SPARK_H}`}
      preserveAspectRatio="none"
      className="block w-full"
      style={{ height: SPARK_H }}
      aria-hidden="true"
    >
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" style={{ stopColor: SPARK_COLOR, stopOpacity: 0.28 }} />
          <stop offset="100%" style={{ stopColor: SPARK_COLOR, stopOpacity: 0 }} />
        </linearGradient>
      </defs>
      <polygon points={area} fill={`url(#${gradientId})`} />
      <polyline
        points={points}
        fill="none"
        style={{ stroke: SPARK_COLOR }}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}
