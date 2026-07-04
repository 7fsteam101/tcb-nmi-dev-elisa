import Link from "next/link";

// Dependency-free SVG charts, server-compatible (no hooks). Colors use the
// dark-theme CSS vars; the default palette works on the #0C1117 background.
const PALETTE = ["#4f8ef7", "#34d399", "#fbbf24", "#f87171", "#a78bfa", "#22d3ee", "#f472b6", "#94a3b8"];

function emptyNote(text = "No data yet") {
  return <div className="py-6 text-center text-xs" style={{ color: "var(--muted)" }}>{text}</div>;
}

// ---------- Donut ----------
export function DonutChart({
  data, size = 140, centerLabel, centerValue, thickness = 18,
}: {
  data: { label: string; value: number; color?: string }[];
  size?: number; centerLabel?: string; centerValue?: string; thickness?: number;
}) {
  const total = data.reduce((s, d) => s + Math.max(0, d.value), 0);
  const r = (size - thickness) / 2;
  const c = 2 * Math.PI * r;
  let offset = 0;
  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={thickness} opacity={0.5} />
        {total > 0 && data.map((d, i) => {
          const frac = Math.max(0, d.value) / total;
          const len = frac * c;
          const seg = (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={d.color ?? PALETTE[i % PALETTE.length]} strokeWidth={thickness}
              strokeDasharray={`${len} ${c - len}`} strokeDashoffset={-offset}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}>
              <title>{`${d.label}: ${d.value} (${(frac * 100).toFixed(0)}%)`}</title>
            </circle>
          );
          offset += len;
          return seg;
        })}
        {(centerValue || centerLabel) && (
          <>
            <text x="50%" y="47%" textAnchor="middle" dominantBaseline="middle"
              fontSize={size / 7} fontWeight={700} fill="var(--text)">{centerValue}</text>
            <text x="50%" y="63%" textAnchor="middle" dominantBaseline="middle"
              fontSize={size / 14} fill="var(--muted)">{centerLabel}</text>
          </>
        )}
      </svg>
      <div className="min-w-0 flex-1 space-y-1.5">
        {total === 0 && emptyNote()}
        {total > 0 && data.map((d, i) => (
          <div key={i} className="flex items-center gap-2 text-xs">
            <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: d.color ?? PALETTE[i % PALETTE.length] }} />
            <span className="min-w-0 flex-1 truncate" style={{ color: "var(--muted)" }}>{d.label}</span>
            <span className="tabular-nums" style={{ color: "var(--text)" }}>{d.value}</span>
            <span className="w-9 text-right tabular-nums" style={{ color: "var(--muted)" }}>{((d.value / total) * 100).toFixed(0)}%</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ---------- Line (multi-series) ----------
export function LineChart({
  series, labels, height = 160, area = true,
}: {
  series: { label: string; points: number[]; color?: string }[];
  labels?: string[]; height?: number; area?: boolean;
}) {
  const W = 600, H = height, pad = 6;
  const n = Math.max(...series.map((s) => s.points.length), 1);
  const allVals = series.flatMap((s) => s.points);
  const max = Math.max(...allVals, 1);
  const min = Math.min(...allVals, 0);
  const span = max - min || 1;
  const x = (i: number) => pad + (i / Math.max(n - 1, 1)) * (W - 2 * pad);
  const y = (v: number) => H - pad - ((v - min) / span) * (H - 2 * pad);

  if (allVals.length === 0) return emptyNote();
  return (
    <div>
      <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
        {[0.25, 0.5, 0.75].map((g) => (
          <line key={g} x1={pad} x2={W - pad} y1={pad + g * (H - 2 * pad)} y2={pad + g * (H - 2 * pad)}
            stroke="var(--line)" strokeWidth={0.5} opacity={0.5} />
        ))}
        {series.map((s, si) => {
          const color = s.color ?? PALETTE[si % PALETTE.length];
          const pts = s.points.map((v, i) => `${x(i)},${y(v)}`).join(" ");
          const areaPts = `${x(0)},${H - pad} ${pts} ${x(s.points.length - 1)},${H - pad}`;
          return (
            <g key={si}>
              {area && si === 0 && (
                <>
                  <defs>
                    <linearGradient id={`lg${si}`} x1="0" x2="0" y1="0" y2="1">
                      <stop offset="0%" stopColor={color} stopOpacity={0.25} />
                      <stop offset="100%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <polygon points={areaPts} fill={`url(#lg${si})`} />
                </>
              )}
              <polyline points={pts} fill="none" stroke={color} strokeWidth={1.5}
                vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
            </g>
          );
        })}
      </svg>
      {(labels || series.length > 1) && (
        <div className="mt-1 flex items-center justify-between text-[10px]" style={{ color: "var(--muted)" }}>
          <div className="flex gap-3">
            {series.length > 1 && series.map((s, i) => (
              <span key={i} className="flex items-center gap-1">
                <span className="h-2 w-2 rounded-sm" style={{ background: s.color ?? PALETTE[i % PALETTE.length] }} />{s.label}
              </span>
            ))}
          </div>
          {labels && <div className="flex gap-2"><span>{labels[0]}</span><span>{labels[labels.length - 1]}</span></div>}
        </div>
      )}
    </div>
  );
}

// ---------- Horizontal bar list ----------
export function HBarList({
  data, format = (v) => String(v), max: fixedMax,
}: {
  data: { label: string; value: number; href?: string }[];
  format?: (v: number) => string; max?: number;
}) {
  if (!data.length) return emptyNote();
  const max = fixedMax ?? Math.max(...data.map((d) => d.value), 1);
  return (
    <div className="space-y-1.5">
      {data.map((d, i) => {
        const row = (
          <div className="flex items-center gap-2 rounded px-1 py-0.5">
            <div className="w-40 shrink-0 truncate text-xs capitalize" style={{ color: "var(--muted)" }}>{d.label}</div>
            <div className="h-2.5 flex-1 overflow-hidden rounded" style={{ background: "var(--panel-2)" }}>
              <div className="h-full rounded" style={{ width: `${(d.value / max) * 100}%`, minWidth: d.value > 0 ? 3 : 0, background: "var(--accent)" }} />
            </div>
            <div className="w-16 shrink-0 text-right text-xs tabular-nums">{format(d.value)}</div>
          </div>
        );
        return d.href
          ? <Link key={i} href={d.href} className="block hover:bg-white/5 rounded">{row}</Link>
          : <div key={i}>{row}</div>;
      })}
    </div>
  );
}

// ---------- Progress ring ----------
export function ProgressRing({ value, label, size = 90 }: { value: number; label: string; size?: number }) {
  const v = Math.max(0, Math.min(1, value || 0));
  const tone = v >= 0.7 ? "var(--good)" : v >= 0.4 ? "var(--warn)" : "var(--bad)";
  const r = (size - 12) / 2;
  const c = 2 * Math.PI * r;
  return (
    <div className="flex flex-col items-center gap-1">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={8} opacity={0.5} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth={8} strokeLinecap="round"
          strokeDasharray={`${v * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle" fontSize={size / 5} fontWeight={700} fill="var(--text)">
          {(v * 100).toFixed(0)}%
        </text>
      </svg>
      <div className="text-center text-[11px]" style={{ color: "var(--muted)" }}>{label}</div>
    </div>
  );
}

// ---------- Vertical bar chart (period comparison) ----------
// Each bar = one period. Optional `compare` renders a faint "previous" bar
// behind each, and `target` draws a goal line. `pct` formats values as %.
export function BarChart({
  data, height = 180, target, format, color = "#4f8ef7", highlightLast = true,
}: {
  data: { label: string; value: number; compare?: number }[];
  height?: number; target?: number; color?: string; highlightLast?: boolean;
  format?: (v: number) => string;
}) {
  if (!data.length) return emptyNote();
  const fmt = format ?? ((v: number) => String(v));
  const max = Math.max(...data.map((d) => Math.max(d.value, d.compare ?? 0)), target ?? 0, 1);
  const barH = (v: number) => (v / max) * (height - 24);
  return (
    <div>
      <div className="relative flex items-end justify-between gap-2" style={{ height }}>
        {target != null && target > 0 && (
          <div className="absolute inset-x-0 flex items-center" style={{ bottom: barH(target) + 20 }}>
            <div className="h-px flex-1" style={{ background: "var(--warn)", opacity: 0.6 }} />
            <span className="ml-1 text-[10px]" style={{ color: "var(--warn)" }}>goal {fmt(target)}</span>
          </div>
        )}
        {data.map((d, i) => {
          const isLast = highlightLast && i === data.length - 1;
          return (
            <div key={i} className="flex flex-1 flex-col items-center justify-end gap-1" style={{ height }}>
              <div className="text-[10px] tabular-nums" style={{ color: "var(--muted)" }}>{fmt(d.value)}</div>
              <div className="relative flex w-full items-end justify-center" style={{ height: height - 24 }}>
                {d.compare != null && (
                  <div className="absolute bottom-0 w-full rounded-t" style={{ height: barH(d.compare), background: "var(--line)", opacity: 0.7, maxWidth: 34 }} />
                )}
                <div className="w-full rounded-t" style={{ height: Math.max(barH(d.value), 2), background: color, opacity: isLast ? 1 : 0.75, maxWidth: 34, position: "relative", zIndex: 1 }} />
              </div>
              <div className="truncate text-center text-[10px]" style={{ color: "var(--muted)", maxWidth: 60 }}>{d.label}</div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ---------- Multi-series comparison bars (grouped) ----------
// For "compare reasons": each period has N colored bars side by side.
export function GroupedBars({
  periods, series, height = 200, format,
}: {
  periods: string[];
  series: { label: string; color?: string; values: number[] }[];
  height?: number; format?: (v: number) => string;
}) {
  if (!periods.length || !series.length) return emptyNote();
  const fmt = format ?? ((v: number) => String(v));
  const max = Math.max(...series.flatMap((s) => s.values), 1);
  return (
    <div>
      <div className="flex items-end justify-between gap-3" style={{ height }}>
        {periods.map((p, pi) => (
          <div key={pi} className="flex flex-1 flex-col items-center justify-end gap-1" style={{ height }}>
            <div className="flex w-full items-end justify-center gap-0.5" style={{ height: height - 20 }}>
              {series.map((s, si) => (
                <div key={si} className="rounded-t" style={{
                  height: Math.max((s.values[pi] / max) * (height - 20), s.values[pi] > 0 ? 2 : 0),
                  width: `${Math.min(80 / series.length, 16)}px`,
                  background: s.color ?? PALETTE[si % PALETTE.length],
                }}>
                  <title>{`${s.label} · ${p}: ${fmt(s.values[pi])}`}</title>
                </div>
              ))}
            </div>
            <div className="truncate text-center text-[10px]" style={{ color: "var(--muted)", maxWidth: 70 }}>{p}</div>
          </div>
        ))}
      </div>
      <div className="mt-2 flex flex-wrap gap-3 text-[11px]">
        {series.map((s, i) => (
          <span key={i} className="flex items-center gap-1.5" style={{ color: "var(--muted)" }}>
            <span className="h-2 w-2 rounded-sm" style={{ background: s.color ?? PALETTE[i % PALETTE.length] }} />{s.label}
          </span>
        ))}
      </div>
    </div>
  );
}
