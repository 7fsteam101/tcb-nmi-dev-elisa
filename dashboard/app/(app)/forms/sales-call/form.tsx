"use client";

import { useActionState, useState } from "react";
import type { FormOptions } from "@/lib/form-options";
import { submitSalesCallAction } from "./actions";

const OUTCOMES = [
  { value: "follow_up_call", label: "Follow Up Call" },
  { value: "hot_lead", label: "Hot Lead (follow up within 7 days)" },
  { value: "warm_list", label: "Warm List (follow up within 21 days)" },
  { value: "cold_list", label: "Cold List (30+ days)" },
  { value: "contract_signed", label: "Contract Signed" },
  { value: "won_pif", label: "Won PIF" },
  { value: "won_pp", label: "Won PP" },
  { value: "lost", label: "Lost" },
  { value: "dq_on_call", label: "DQ On Call" },
];
const BUCKET_DAYS: Record<string, number> = { follow_up_call: 2, hot_lead: 7, warm_list: 21, cold_list: 30 };

function plusDays(n: number) {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function SalesCallForm({ options }: { options: FormOptions }) {
  const [state, action, pending] = useActionState(submitSalesCallAction, null as any);
  const [outcome, setOutcome] = useState("");
  const [offerMade, setOfferMade] = useState(true);
  const [dealType, setDealType] = useState("");
  const [qualified, setQualified] = useState("yes");
  const [cadence, setCadence] = useState("monthly");
  const [followUp, setFollowUp] = useState("");
  const [rows, setRows] = useState<{ amount: string; date: string }[]>([{ amount: "", date: "" }]);

  const won = outcome === "won_pif" || outcome === "won_pp";
  const showDeposit = offerMade && !won && outcome !== "" && dealType === "deposit";
  const followUpDefault = BUCKET_DAYS[outcome] ? plusDays(BUCKET_DAYS[outcome]) : plusDays(2);

  return (
    <form action={action} className="card max-w-2xl space-y-4 p-6">
      <Field label="Call (this is the call date)">
        <select name="appointmentId" required defaultValue="">
          <option value="" disabled>Pick the call</option>
          {options.appointments.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
        </select>
      </Field>
      <Field label="Closer submitting">
        <select name="repId" required defaultValue="">
          <option value="" disabled>Pick the closer</option>
          {options.reps.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
        </select>
      </Field>

      <Field label="Outcome">
        <select name="callResult" required value={outcome} onChange={(e) => setOutcome(e.target.value)}>
          <option value="" disabled>How did the call end</option>
          {OUTCOMES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
        </select>
      </Field>

      <label className="flex items-center gap-2 text-sm">
        <input type="checkbox" name="offerMade" checked={offerMade} onChange={(e) => setOfferMade(e.target.checked)} />
        Offer was made
      </label>

      {offerMade && !won && outcome !== "" && !["dq_on_call", "lost"].includes(outcome) && (
        <Field label="Deal type (if money moved)">
          <select name="dealType" value={dealType} onChange={(e) => setDealType(e.target.value)}>
            <option value="">No deal yet</option>
            <option value="deposit">Deposit taken</option>
          </select>
        </Field>
      )}
      {showDeposit && (
        <div className="grid grid-cols-2 gap-3 rounded-lg border p-4" style={{ borderColor: "var(--warn)" }}>
          <Field label="Deposit collected ($)"><input name="cashCollected" type="number" step="0.01" required /></Field>
          <Field label="Expected close date"><input name="expectedCloseDate" type="date" required /></Field>
        </div>
      )}

      {won && (
        <div className="space-y-4 rounded-lg border p-4" style={{ borderColor: "var(--good)" }}>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Amount contracted ($)"><input name="amountContracted" type="number" step="0.01" required /></Field>
            <Field label="Cash collected today ($)"><input name="cashCollected" type="number" step="0.01" placeholder="0 for zero-down" /></Field>
          </div>
          <Field label="Start date (first payment)"><input name="startDate" type="date" required /></Field>
          {outcome === "won_pp" && (
            <>
              <Field label="Payment cadence">
                <select name="cadence" value={cadence} onChange={(e) => setCadence(e.target.value)}>
                  <option value="monthly">Monthly</option>
                  <option value="biweekly">Bi-weekly</option>
                  <option value="weekly">Weekly</option>
                  <option value="custom">Custom (enter each installment)</option>
                </select>
              </Field>
              {cadence !== "custom" && (
                <Field label="Payment plan">
                  <select name="pricingPlanId" required defaultValue="">
                    <option value="" disabled>Pick the plan sold</option>
                    {options.plans.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                  </select>
                </Field>
              )}
              {cadence === "custom" && (
                <div>
                  <label className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Custom installments (amount + date)</label>
                  {rows.map((r, i) => (
                    <div key={i} className="mb-2 flex gap-2">
                      <input type="number" step="0.01" placeholder="$" value={r.amount}
                        onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, amount: e.target.value } : x))} />
                      <input type="date" value={r.date}
                        onChange={(e) => setRows(rows.map((x, j) => j === i ? { ...x, date: e.target.value } : x))} />
                      <button type="button" className="btn-ghost btn shrink-0 px-2"
                        onClick={() => setRows(rows.filter((_, j) => j !== i))} disabled={rows.length === 1}>Remove</button>
                    </div>
                  ))}
                  <button type="button" className="btn-ghost btn" onClick={() => setRows([...rows, { amount: "", date: "" }])}>
                    Add installment
                  </button>
                  <input type="hidden" name="customInstallments" value={JSON.stringify(rows)} />
                </div>
              )}
            </>
          )}
        </div>
      )}

      <Field label="Was the lead qualified?">
        <select name="qualified" value={qualified} onChange={(e) => setQualified(e.target.value)}>
          <option value="yes">Yes (qualified, even if no offer was made)</option>
          <option value="no">No (not qualified)</option>
        </select>
      </Field>
      {(qualified === "no" || outcome === "dq_on_call") && (
        <Field label="Disqualified reason">
          <select name="dqReasonId" required defaultValue="">
            <option value="" disabled>Why disqualified</option>
            {options.dqReasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </Field>
      )}
      {outcome === "lost" && (
        <Field label="Lost reason">
          <select name="lostReasonId" required defaultValue="">
            <option value="" disabled>Why lost</option>
            {options.lostReasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
          </select>
        </Field>
      )}

      <Field label="Main objection">
        <select name="mainObjectionId" defaultValue="">
          <option value="">None</option>
          {options.objectionTypes.map((o) => <option key={o.id} value={o.id}>{o.label}</option>)}
        </select>
      </Field>

      <Field label="Follow up?">
        <select name="followUpWanted" required value={followUp} onChange={(e) => setFollowUp(e.target.value)}>
          <option value="" disabled>Choose</option>
          <option value="yes">Yes</option>
          <option value="no">No</option>
        </select>
      </Field>
      {followUp === "yes" && (
        <div className="grid grid-cols-2 gap-3">
          <Field label="Follow up date">
            <input name="followUpDate" type="date" required defaultValue={followUpDefault} key={followUpDefault} />
          </Field>
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
        <textarea name="notes" rows={3} placeholder="Anything worth knowing" />
      </Field>

      <button type="submit" disabled={pending} className="btn w-full">
        {pending ? "Submitting..." : "Submit report"}
      </button>

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
