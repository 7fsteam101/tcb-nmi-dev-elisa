"use client";

import { useActionState, useState } from "react";
import type { FormOptions } from "@/lib/form-options";
import { submitSalesCallAction } from "./actions";

export function SalesCallForm({ options }: { options: FormOptions }) {
  const [state, action, pending] = useActionState(submitSalesCallAction, null as any);
  const [outcome, setOutcome] = useState("taken");
  const [disposition, setDisposition] = useState("no_decision");
  const [planId, setPlanId] = useState("");
  const plan = options.plans.find((p) => p.id === planId);

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
        <select name="outcome" value={outcome} onChange={(e) => setOutcome(e.target.value)}>
          <option value="taken">Call taken</option>
          <option value="no_show">No show</option>
          <option value="cancelled_by_lead">Cancelled by lead</option>
          <option value="cancelled_by_team">Cancelled by team</option>
        </select>
      </Field>

      {outcome === "taken" && (
        <>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="offerMade" defaultChecked /> Offer was made
          </label>
          <Field label="Disposition">
            <select name="disposition" value={disposition} onChange={(e) => setDisposition(e.target.value)}>
              <option value="closed">Closed (won)</option>
              <option value="follow_up">Follow-up booked</option>
              <option value="dq_on_call">Disqualified on the call</option>
              <option value="no_decision">No decision (warm list)</option>
            </select>
          </Field>

          {disposition === "closed" && (
            <div className="space-y-4 rounded-lg border p-4" style={{ borderColor: "var(--good)" }}>
              <Field label="Plan sold">
                <select name="pricingPlanId" required value={planId} onChange={(e) => setPlanId(e.target.value)}>
                  <option value="" disabled>Pick the plan</option>
                  {options.plans.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Total contract value ($)">
                  <input name="tcv" type="number" step="0.01" placeholder={plan ? String(plan.totalMinor / 100) : "2500"} />
                </Field>
                <Field label="Collected today ($)">
                  <input name="firstPayment" type="number" step="0.01" placeholder="0 for zero-down" />
                </Field>
              </div>
            </div>
          )}
          {disposition === "dq_on_call" && (
            <Field label="DQ reason">
              <select name="dqReasonId" required defaultValue="">
                <option value="" disabled>Why disqualified</option>
                {options.dqReasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </Field>
          )}
          {disposition === "no_decision" && (
            <Field label="Main blocker (optional)">
              <select name="lostReasonId" defaultValue="">
                <option value="">Not sure yet</option>
                {options.lostReasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
              </select>
            </Field>
          )}
          <Field label="Objections raised">
            <div className="grid grid-cols-2 gap-1.5">
              {options.objectionTypes.map((o) => (
                <label key={o.id} className="flex items-center gap-2 text-sm">
                  <input type="checkbox" name="objections" value={o.id} /> {o.label}
                </label>
              ))}
            </div>
          </Field>
        </>
      )}

      <Field label="Notes">
        <textarea name="notes" rows={3} placeholder="Anything worth knowing" />
      </Field>

      <button type="submit" disabled={pending} className="btn w-full">
        {pending ? "Submitting..." : "Submit report"}
      </button>

      {state && (
        <div className="rounded-lg border p-3 text-sm"
          style={{ borderColor: state.ok ? "var(--good)" : "var(--bad)" }}>
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
