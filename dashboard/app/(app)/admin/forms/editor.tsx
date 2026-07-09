"use client";

import { useState, useTransition } from "react";
import { toggleFormCountsAction, renameFormAction } from "./actions";

export function FormsEditor({ forms }: { forms: any[] }) {
  const [, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  return (
    <div className="max-w-4xl space-y-4">
      <div className="card p-4">
        <div className="mb-3 text-sm font-semibold">GHL forms → lead counting</div>
        <p className="mb-3 text-xs" style={{ color: "var(--muted)" }}>
          Every form that submits shows up here automatically. Counts as lead decides whether its submissions
          count in the Leads numbers; submissions record either way, and toggling re-applies to the form's history.
          New forms arrive unreviewed and not counted until someone decides.
        </p>
        <table>
          <thead><tr><th>Sub-account</th><th>Form</th><th>Submissions</th><th>Counts as lead</th></tr></thead>
          <tbody>
            {forms.map((f) => (
              <tr key={f.id} style={f.reviewed_at ? undefined : { background: "color-mix(in srgb, var(--warn) 7%, transparent)" }}>
                <td style={{ color: "var(--muted)" }}>{f.location_label}</td>
                <td>
                  {editing === f.id ? (
                    <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} className="py-0.5"
                      onBlur={() => { start(() => renameFormAction(f.id, draft)); setEditing(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                  ) : (
                    <button title="Click to name this form" onClick={() => { setEditing(f.id); setDraft(f.form_name ?? ""); }}>
                      {f.form_name ?? f.form_id}
                      {!f.reviewed_at && <span className="ml-2 text-[11px]" style={{ color: "var(--warn)" }}>new</span>}
                    </button>
                  )}
                </td>
                <td style={{ color: "var(--muted)" }}>{f.submissions}</td>
                <td>
                  <button className="btn-ghost btn px-2 py-0.5 text-[11px]"
                    style={{ color: f.counts_as_lead ? "var(--good)" : "var(--muted)" }}
                    onClick={() => start(() => toggleFormCountsAction(f.id))}>
                    {f.counts_as_lead ? "Counts" : "Off"}
                  </button>
                </td>
              </tr>
            ))}
            {forms.length === 0 && (
              <tr><td colSpan={4} style={{ color: "var(--muted)" }}>
                Nothing yet — forms appear here automatically on their first submission.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
