"use client";

import { useActionState } from "react";
import { InfoTip } from "@/components/ui";
import { submitEodReportAction, type EodReportResult } from "./actions";

type RepOption = { id: string; label: string };

export function EodReportForm({
  reps, lockedRepId, today,
}: {
  reps: RepOption[];
  lockedRepId: string | null;
  today: string;
}) {
  const [state, action, pending] = useActionState<EodReportResult | null, FormData>(submitEodReportAction, null);
  const lockedRep = lockedRepId ? reps.find((r) => r.id === lockedRepId) ?? null : null;

  return (
    <form action={action} className="card max-w-2xl space-y-4 p-6">
      <Field label="Rep" help="Setters file their own report. Admin and leadership can file for any setter.">
        {lockedRep ? (
          <>
            <input type="hidden" name="repId" value={lockedRep.id} />
            <input type="text" value={lockedRep.label} disabled />
          </>
        ) : (
          <select name="repId" required defaultValue={lockedRepId ?? ""}>
            <option value="" disabled>Pick the rep</option>
            {reps.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        )}
      </Field>

      <Field label="Report Date" help="The day this report covers. Defaults to today.">
        <input type="date" name="reportDate" defaultValue={today} max={today} />
      </Field>

      <div className="grid grid-cols-2 gap-4">
        <Field label="Dials" help="Outbound dials made.">
          <input type="number" name="dials" min={0} step={1} defaultValue={0} inputMode="numeric" />
        </Field>
        <Field label="Conversations" help="Live conversations had.">
          <input type="number" name="conversations" min={0} step={1} defaultValue={0} inputMode="numeric" />
        </Field>
        <Field label="Appointments Set" help="Appointments booked.">
          <input type="number" name="appointmentsSet" min={0} step={1} defaultValue={0} inputMode="numeric" />
        </Field>
        <Field label="Follow Ups" help="Follow-ups scheduled.">
          <input type="number" name="followUps" min={0} step={1} defaultValue={0} inputMode="numeric" />
        </Field>
      </div>

      <Field label="Notes" help="Free-text summary, wins, or blockers for the day.">
        <textarea name="notes" rows={4} placeholder="Highlights, blockers, anything the team should know" />
      </Field>

      <button type="submit" disabled={pending} className="btn w-full">
        {pending ? "Saving..." : "Save report"}
      </button>

      {state && (
        <div className="rounded-lg border p-3 text-sm"
          style={{ borderColor: state.ok ? "var(--good)" : "var(--bad)", color: state.ok ? "var(--good)" : "var(--bad)" }}>
          {state.message}
        </div>
      )}
    </form>
  );
}

function Field({ label, help, children }: { label: string; help?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 flex items-center gap-1.5 text-xs" style={{ color: "var(--muted)" }}>
        {label}
        {help && <InfoTip text={help} />}
      </label>
      {children}
    </div>
  );
}
