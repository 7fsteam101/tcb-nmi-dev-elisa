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
  // 2px breathing room between segments (panel shows through); only when
  // there are 2+ visible segments so a single full ring stays closed.
  const gap = data.filter((d) => d.value > 0).length > 1 ? 2 : 0;
  let offset = 0;
  return (
    <div className="flex items-center gap-5">
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="shrink-0">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--line)" strokeWidth={thickness} opacity={0.5} />
        {total > 0 && data.map((d, i) => {
          const frac = Math.max(0, d.value) / total;
          const len = frac * c;
          const segLen = len > 0 ? Math.max(len - gap, 0.75) : 0;
          const seg = (
            <circle key={i} cx={size / 2} cy={size / 2} r={r} fill="none"
              stroke={d.color ?? PALETTE[i % PALETTE.length]} strokeWidth={thickness}
              strokeDasharray={`${segLen} ${c - segLen}`} strokeDashoffset={-(offset + gap / 2)}
              transform={`rotate(-90 ${size / 2} ${size / 2})`}>
              <title>{`${d.label}: ${d.value} (${(frac * 100).toFixed(0)}%)`}</title>
            </circle>
          );
          offset += len;
          return seg;
        })}
        {(centerValue || centerLabel) && (
          <>
            <text x="50%" y="47%" textAnchor="middle" dominantBaseline="middle" className="num"
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
            <span className="num" style={{ color: "var(--text)" }}>{d.value}</span>
            <span className="num w-9 text-right" style={{ color: "var(--muted)" }}>{((d.value / total) * 100).toFixed(0)}%</span>
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
                      <stop offset="0%" stopColor={color} stopOpacity={0.18} />
                      <stop offset="100%" stopColor={color} stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <polygon points={areaPts} fill={`url(#lg${si})`} />
                </>
              )}
              <polyline points={pts} fill="none" stroke={color} strokeWidth={2}
                vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
              {/* point markers: zero-length round-cap strokes stay circular
                  even though the svg is non-uniformly scaled */}
              {s.points.map((v, i) => (
                <path key={i} d={`M ${x(i)} ${y(v)} h 0.01`} stroke={color} strokeWidth={5}
                  strokeLinecap="round" vectorEffect="non-scaling-stroke" fill="none" />
              ))}
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
          {labels && <div className="num flex gap-2"><span>{labels[0]}</span><span>{labels[labels.length - 1]}</span></div>}
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
          <div className="flex items-center gap-2 rounded px-1 py-0.5 transition-colors hover:bg-[var(--panel-2)]">
            <div className="w-40 shrink-0 truncate text-xs capitalize" style={{ color: "var(--muted)" }}>{d.label}</div>
            <div className="h-1.5 flex-1 overflow-hidden rounded-full" style={{ background: "var(--panel-2)" }}>
              <div className="h-full rounded-full" style={{ width: `${(d.value / max) * 100}%`, minWidth: d.value > 0 ? 3 : 0, background: "var(--accent)" }} />
            </div>
            <div className="num w-16 shrink-0 text-right text-xs">{format(d.value)}</div>
          </div>
        );
        return d.href
          ? <Link key={i} href={d.href} className="block rounded">{row}</Link>
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
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth={8} opacity={0.2} />
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke={tone} strokeWidth={8} strokeLinecap="round"
          strokeDasharray={`${v * c} ${c}`} transform={`rotate(-90 ${size / 2} ${size / 2})`} />
        <text x="50%" y="52%" textAnchor="middle" dominantBaseline="middle" className="num" fontSize={size / 5} fontWeight={700} fill="var(--text)">
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
  data, height = 180, target, format, color = "#4f8ef7", highlightLast = true, yTicks = 4,
}: {
  data: { label: string; value: number; compare?: number }[];
  height?: number; target?: number; color?: string; highlightLast?: boolean; yTicks?: number;
  format?: (v: number) => string;
}) {
  if (!data.length) return emptyNote();
  const fmt = format ?? ((v: number) => String(v));
  const max = Math.max(...data.map((d) => Math.max(d.value, d.compare ?? 0)), target ?? 0, 1);
  const plotH = height; // plot area height (x labels sit below)
  const barH = (v: number) => (v / max) * plotH;
  // y-axis ticks from max down to 0
  const ticks = Array.from({ length: yTicks + 1 }, (_, i) => (max * (yTicks - i)) / yTicks);
  return (
    <div className="flex gap-2">
      {/* Y axis */}
      <div className="num flex shrink-0 flex-col justify-between text-right text-[10px]" style={{ height: plotH, color: "var(--muted)", minWidth: 22 }}>
        {ticks.map((t, i) => <div key={i} style={{ lineHeight: 1, transform: i === 0 ? "translateY(-2px)" : i === ticks.length - 1 ? "translateY(2px)" : "none" }}>{fmt(Math.round(t))}</div>)}
      </div>
      {/* plot */}
      <div className="min-w-0 flex-1">
        <div className="relative" style={{ height: plotH }}>
          {/* gridlines */}
          <div className="absolute inset-0 flex flex-col justify-between">
            {ticks.map((_, i) => <div key={i} className="w-full" style={{ height: 0, borderTop: "1px dashed var(--line)", opacity: 0.35 }} />)}
          </div>
          {/* target line */}
          {target != null && target > 0 && (
            <div className="absolute inset-x-0 flex items-center" style={{ bottom: barH(target) }}>
              <div className="h-px flex-1" style={{ background: "var(--warn)", opacity: 0.7 }} />
              <span className="ml-1 text-[9px]" style={{ color: "var(--warn)" }}>goal {fmt(target)}</span>
            </div>
          )}
          {/* bars */}
          <div className="relative flex h-full items-end justify-between gap-2">
            {data.map((d, i) => {
              const isLast = highlightLast && i === data.length - 1;
              return (
                <div key={i} title={`${d.label}: ${fmt(d.value)}`} className="relative flex h-full flex-1 items-end justify-center">
                  {d.compare != null && (
                    <div className="absolute bottom-0 w-full" style={{ height: barH(d.compare), background: "var(--line)", opacity: 0.7, maxWidth: 30, borderRadius: "3px 3px 0 0" }} />
                  )}
                  <div className="relative w-full" style={{
                    height: Math.max(barH(d.value), 2),
                    background: `linear-gradient(to bottom, ${color}, color-mix(in srgb, ${color} 82%, transparent))`,
                    opacity: isLast ? 1 : 0.8, maxWidth: 30, zIndex: 1, borderRadius: "3px 3px 0 0",
                  }}>
                    <div className="num absolute -top-4 left-1/2 -translate-x-1/2 whitespace-nowrap text-[10px] font-medium" style={{ color: "var(--text)" }}>{fmt(d.value)}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        {/* x-axis labels */}
        <div className="mt-1.5 flex justify-between gap-2 border-t pt-1" style={{ borderColor: "var(--line)" }}>
          {data.map((d, i) => <div key={i} className="flex-1 truncate text-center text-[10px]" style={{ color: "var(--muted)" }}>{d.label}</div>)}
        </div>
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
              {series.map((s, si) => {
                const tone = s.color ?? PALETTE[si % PALETTE.length];
                return (
                  <div key={si} title={`${s.label} · ${p}: ${fmt(s.values[pi])}`} style={{
                    height: Math.max((s.values[pi] / max) * (height - 20), s.values[pi] > 0 ? 2 : 0),
                    width: `${Math.min(80 / series.length, 16)}px`,
                    background: `linear-gradient(to bottom, ${tone}, color-mix(in srgb, ${tone} 82%, transparent))`,
                    borderRadius: "2px 2px 0 0",
                  }} />
                );
              })}
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
