"use client";

import { useState, useTransition } from "react";
import { Card, SectionTitle, Badge, label } from "@/components/ui";
import { setStageMappingAction, deactivateStageAction } from "./actions";

type Row = { id: string; platform: string; external_label: string; mapped_stage: string | null; active: boolean; first_seen: string };

export function StageEditor({ rows, stageOptions }: { rows: Row[]; stageOptions: string[] }) {
  const unmapped = rows.filter((r) => !r.active);
  const mapped = rows.filter((r) => r.active);
  return (
    <div>
      <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
        Every pipeline stage label seen from Close lands here. Map a label to its system
        meaning and the mirror applies it; unmapped labels are recorded but never change
        an opportunity, so a new stage the team invents cannot silently skew reporting.
      </p>

      <SectionTitle>Needs mapping {unmapped.length > 0 && <Badge tone="warn">{unmapped.length}</Badge>}</SectionTitle>
      {unmapped.length === 0 ? (
        <Card><p className="py-1 text-sm" style={{ color: "var(--muted)" }}>Nothing waiting. New stage labels appear here automatically.</p></Card>
      ) : (
        <Card>
          <div className="space-y-2">
            {unmapped.map((r) => <StageRow key={r.id} row={r} stageOptions={stageOptions} highlight />)}
          </div>
        </Card>
      )}

      <SectionTitle>Mapped</SectionTitle>
      <Card>
        <div className="space-y-2">
          {mapped.map((r) => <StageRow key={r.id} row={r} stageOptions={stageOptions} />)}
        </div>
      </Card>
    </div>
  );
}

function StageRow({ row, stageOptions, highlight = false }: { row: Row; stageOptions: string[]; highlight?: boolean }) {
  const [value, setValue] = useState(row.mapped_stage ?? "");
  const [pending, start] = useTransition();
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border px-3 py-2"
      style={{ borderColor: highlight ? "color-mix(in srgb, var(--warn) 45%, transparent)" : "var(--line)", background: highlight ? "color-mix(in srgb, var(--warn) 7%, transparent)" : "transparent" }}>
      <div className="min-w-44 flex-1">
        <div className="text-sm font-medium" style={{ color: "var(--text)" }}>{row.external_label}</div>
        <div className="text-[11px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>{row.platform}</div>
      </div>
      <select value={value} onChange={(e) => setValue(e.target.value)} className="max-w-56">
        <option value="">Pick the system stage</option>
        {stageOptions.map((s) => <option key={s} value={s}>{label(s)}</option>)}
      </select>
      <button className="btn" disabled={pending || !value || (row.active && value === row.mapped_stage)}
        onClick={() => start(() => setStageMappingAction(row.id, value))}>
        {pending ? "Saving..." : row.active ? "Update" : "Map & activate"}
      </button>
      {row.active && (
        <button className="btn-ghost btn text-[12px]" disabled={pending} onClick={() => start(() => deactivateStageAction(row.id))}>
          Deactivate
        </button>
      )}
    </div>
  );
}
