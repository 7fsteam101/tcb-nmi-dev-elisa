"use client";

import { useActionState, useState } from "react";
import type { FormOptions } from "@/lib/form-options";
import { submitMissedCallAction } from "./actions";

export function MissedCallForm({ options }: { options: FormOptions }) {
  const [state, action, pending] = useActionState(submitMissedCallAction, null as any);
  const [what, setWhat] = useState("no_show");

  return (
    <form action={action} className="card max-w-2xl space-y-4 p-6">
      <Field label="Appointment">
        <select name="appointmentId" required defaultValue="">
          <option value="" disabled>Pick the booked call</option>
          {options.appointments.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
      </Field>
      <Field label="Rep submitting">
        <select name="repId" required defaultValue="">
          <option value="" disabled>Pick the rep</option>
          {options.reps.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </Field>
      <Field label="What happened">
        <select name="what" value={what} onChange={(e) => setWhat(e.target.value)}>
          <option value="no_show">No show</option>
          <option value="cancelled_by_lead">Cancelled by lead</option>
          <option value="cancelled_by_team">Cancelled by team</option>
          <option value="rescheduled">Rescheduled to a new time</option>
        </select>
      </Field>
      {what === "rescheduled" && (
        <Field label="New date and time">
          <input type="datetime-local" name="newTime" required />
        </Field>
      )}
      <Field label="Reason">
        <select name="reasonId" defaultValue="">
          <option value="">No reason given</option>
          {options.cancelReasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </Field>
      <Field label="Notes">
        <textarea name="notes" rows={3} />
      </Field>
      <button type="submit" disabled={pending} className="btn w-full">{pending ? "Submitting..." : "Submit report"}</button>
      {state && (
        <div className="rounded-lg border p-3 text-sm" style={{ borderColor: state.ok ? "var(--good)" : "var(--bad)" }}>
          {state.results.map((r: string, i: number) => <div key={i}>{r}</div>)}
        </div>
      )}
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>{label}</label>
      {children}
    </div>
  );
}
