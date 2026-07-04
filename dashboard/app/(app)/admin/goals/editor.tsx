"use client";

import { useActionState, useState, useTransition } from "react";
import { Badge, SectionTitle } from "@/components/ui";
import { money, num, pct } from "@/lib/format";
import { METRIC_LABEL, isMoneyMetric, type Metric, type Period } from "@/lib/goals-shared";
import { saveGoalAction, deleteGoalAction } from "./actions";

type Progress = {
  id: string; scope: "company" | "rep"; rep_id: string | null; rep_name?: string;
  metric: Metric; period: Period; target_value: number;
  actual: number; pct: number; projected: number; elapsed: number; onPace: boolean;
};
type Rep = { id: string; full_name: string };

const METRICS = Object.keys(METRIC_LABEL) as Metric[];
const PERIODS: Period[] = ["weekly", "monthly", "quarterly"];

const fmtVal = (metric: Metric, v: number) => (isMoneyMetric(metric) ? money(v) : num(v));

function GoalTable({
  title, rows, reps, onEdit,
}: { title: string; rows: Progress[]; reps: Rep[]; onEdit: (g: Progress) => void }) {
  const [, start] = useTransition();
  const showRep = title !== "Company";
  return (
    <div className="card p-4">
      <div className="mb-3 text-sm font-semibold">{title}</div>
      <table>
        <thead>
          <tr>
            {showRep && <th>Rep</th>}
            <th>Metric</th>
            <th>Period</th>
            <th className="text-right">Target</th>
            <th className="text-right">Actual</th>
            <th className="text-right">Progress</th>
            <th className="text-right">Projected</th>
            <th>Pace</th>
            <th></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((g) => (
            <tr key={g.id}>
              {showRep && <td>{g.rep_name ?? "—"}</td>}
              <td>{METRIC_LABEL[g.metric]}</td>
              <td style={{ color: "var(--muted)" }}>{g.period}</td>
              <td className="text-right">{fmtVal(g.metric, g.target_value)}</td>
              <td className="text-right">{fmtVal(g.metric, g.actual)}</td>
              <td className="text-right">{pct(g.pct, 0)}</td>
              <td className="text-right">{fmtVal(g.metric, g.projected)}</td>
              <td><Badge tone={g.onPace ? "good" : "warn"}>{g.onPace ? "on pace" : "behind"}</Badge></td>
              <td className="text-right whitespace-nowrap">
                <button className="btn-ghost btn px-2 py-0.5 text-[11px]" onClick={() => onEdit(g)}>Edit</button>
                <button
                  className="btn-ghost btn ml-1 px-2 py-0.5 text-[11px]"
                  onClick={() => { if (confirm("Delete this goal? History is not affected.")) start(() => deleteGoalAction(g.id)); }}
                  style={{ color: "var(--bad)" }}
                >
                  Delete
                </button>
              </td>
            </tr>
          ))}
          {rows.length === 0 && (
            <tr><td colSpan={showRep ? 9 : 8} style={{ color: "var(--muted)" }}>No goals yet</td></tr>
          )}
        </tbody>
      </table>
    </div>
  );
}

export function GoalsEditor({
  company, perRep, reps, demo,
}: { company: Progress[]; perRep: Progress[]; reps: Rep[]; demo: boolean }) {
  const [state, action, pending] = useActionState(saveGoalAction, null as any);
  const [scope, setScope] = useState<"company" | "rep">("company");
  const [metric, setMetric] = useState<Metric>("cash_collected");
  // editing form is keyed so switching targets remounts with fresh defaults
  const [edit, setEdit] = useState<Progress | null>(null);
  const [formKey, setFormKey] = useState(0);

  function startEdit(g: Progress) {
    setEdit(g);
    setScope(g.scope);
    setMetric(g.metric);
    setFormKey((k) => k + 1);
    if (typeof window !== "undefined") window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function startNew() {
    setEdit(null);
    setScope("company");
    setMetric("cash_collected");
    setFormKey((k) => k + 1);
  }

  const money_ = isMoneyMetric(metric);
  const defaultTarget = edit
    ? (isMoneyMetric(edit.metric) ? String(edit.target_value / 100) : String(edit.target_value))
    : "";

  return (
    <div className="max-w-4xl space-y-4">
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Goals drive the projections on the dashboards. Progress paces the current period actual against the target.
        {demo ? " Showing demo data." : ""}
      </p>

      <div className="card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="text-sm font-semibold">{edit ? "Edit goal" : "New goal"}</div>
          {edit && (
            <button className="btn-ghost btn px-2 py-0.5 text-[11px]" onClick={startNew}>Cancel edit</button>
          )}
        </div>
        <form key={formKey} action={action} className="flex flex-wrap items-end gap-3">
          {edit && <input type="hidden" name="id" value={edit.id} />}
          <div>
            <label className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Scope</label>
            <select name="scope" value={scope} onChange={(e) => setScope(e.target.value as "company" | "rep")} className="w-auto">
              <option value="company">Company</option>
              <option value="rep">Per rep</option>
            </select>
          </div>
          {scope === "rep" && (
            <div>
              <label className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Rep</label>
              <select name="repId" defaultValue={edit?.rep_id ?? ""} className="w-auto" required>
                <option value="" disabled>Select a rep</option>
                {reps.map((r) => <option key={r.id} value={r.id}>{r.full_name}</option>)}
              </select>
            </div>
          )}
          <div>
            <label className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Metric</label>
            <select name="metric" value={metric} onChange={(e) => setMetric(e.target.value as Metric)} className="w-auto">
              {METRICS.map((m) => <option key={m} value={m}>{METRIC_LABEL[m]}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Period</label>
            <select name="period" defaultValue={edit?.period ?? "monthly"} className="w-auto">
              {PERIODS.map((p) => <option key={p} value={p}>{p}</option>)}
            </select>
          </div>
          <div>
            <label className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>
              Target {money_ ? "(dollars)" : "(count)"}
            </label>
            <input
              name="target" type="number" min={money_ ? "1" : "1"} step={money_ ? "0.01" : "1"}
              defaultValue={defaultTarget} placeholder={money_ ? "$ amount" : "count"} className="max-w-40" required
            />
          </div>
          <button type="submit" disabled={pending} className="btn">
            {pending ? "Saving..." : edit ? "Save changes" : "Create goal"}
          </button>
        </form>
        {state && <div className="mt-3 text-sm" style={{ color: state.ok ? "var(--good)" : "var(--bad)" }}>{state.message}</div>}
      </div>

      <SectionTitle>Company goals</SectionTitle>
      <GoalTable title="Company" rows={company} reps={reps} onEdit={startEdit} />

      <SectionTitle>Per-rep goals</SectionTitle>
      <GoalTable title="Per rep" rows={perRep} reps={reps} onEdit={startEdit} />
    </div>
  );
}
