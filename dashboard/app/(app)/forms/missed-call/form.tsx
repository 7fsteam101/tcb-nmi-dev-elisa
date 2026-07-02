"use client";

import { useActionState, useState } from "react";
import type { FormOptions } from "@/lib/form-options";
import { submitMissedCallAction } from "./actions";

export function MissedCallForm({ options }: { options: FormOptions }) {
  const [state, action, pending] = useActionState(submitMissedCallAction, null as any);
  const [what, setWhat] = useState("no_show");
  const [dq, setDq] = useState(false);
  const [followUp, setFollowUp] = useState("");

  return (
    <form action={action} className="card max-w-2xl space-y-4 p-6">
      <Field label="Call (this is the call date)">
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

      <Field label="Outcome">
        <select name="what" value={what} onChange={(e) => setWhat(e.target.value)}>
          <option value="cancelled_by_lead">Lead cancelled</option>
          <option value="cancelled_by_team">Closer cancelled</option>
          <option value="no_show">No show</option>
          <option value="rescheduled">Rescheduled</option>
        </select>
      </Field>
      {what === "rescheduled" && (
        <Field label="New date and time (leave empty if not set yet — it goes to the rebook-pending queue)">
          <input type="datetime-local" name="newTime" />
        </Field>
      )}
      <Field label="Reason">
        <select name="reasonId" defaultValue="">
          <option value="">No reason given</option>
          {options.cancelReasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" checked={dq} onChange={(e) => setDq(e.target.checked)} />
        Disqualify this lead
      </label>
      {dq && (
        <Field label="Disqualified reason">
          <select name="dqReasonId" required defaultValue="">
            <option value="" disabled>Why disqualified</option>
            {options.dqReasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </Field>
      )}

      <Field label="Follow up?">
        <select name="followUpWanted" required value={followUp} onChange={(e) => setFollowUp(e.target.value)}>
          <option value="" disabled>Choose</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </Field>
      {followUp === "yes" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Follow up date"><input name="followUpDate" type="date" required /></Field>
          <Field label="Assignee (default: the closer)">
            <select name="followUpAssignee" defaultValue="">
              <option value="">The closer</option>
              {options.reps.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
            </select>
          </Field>
        </div>
      )}
      {followUp === "no" && (
        <Field label="Why not?">
          <input name="followUpWhyNot" required placeholder="Why no follow-up" />
        </Field>
      )}

      <Field label="Outcome notes">
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
