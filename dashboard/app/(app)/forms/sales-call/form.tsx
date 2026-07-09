"use client";

import { useActionState, useState } from "react";
import type { FormOptions } from "@/lib/form-options";
import { label } from "@/components/ui";
import { submitSalesCallAction } from "./actions";
import {
  FormCard, FormLayout, Section, Field, ConditionalPanel, CheckRow,
  SubmitBar, ResultBanner, SummaryRail, RailRow, RailChip,
} from "../form-kit";

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

// Presentation-only: which chip color the summary rail shows for each outcome.
const OUTCOME_TONE: Record<string, "good" | "warn" | "bad" | "accent" | "neutral"> = {
  won_pif: "good", won_pp: "good", contract_signed: "good",
  follow_up_call: "accent", hot_lead: "warn", warm_list: "warn", cold_list: "neutral",
  lost: "bad", dq_on_call: "bad",
};

function plusDays(n: number) {
  const d = new Date(); d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
}

export function SalesCallForm({ options, defaultAppointmentId = "" }: { options: FormOptions; defaultAppointmentId?: string }) {
  const [state, action, pending] = useActionState(submitSalesCallAction, null as any);
  const [outcome, setOutcome] = useState("");
  const [offerMade, setOfferMade] = useState(true);
  const [dealType, setDealType] = useState("");
  const [qualified, setQualified] = useState("yes");
  const [cadence, setCadence] = useState("monthly");
  const [isCouple, setIsCouple] = useState(false);
  const [followUp, setFollowUp] = useState("");
  const [rows, setRows] = useState<{ amount: string; date: string }[]>([{ amount: "", date: "" }]);

  const won = outcome === "won_pif" || outcome === "won_pp";
  const showDeposit = offerMade && !won && outcome !== "" && dealType === "deposit";
  const followUpDefault = BUCKET_DAYS[outcome] ? plusDays(BUCKET_DAYS[outcome]) : plusDays(2);

  const rail = (
    <SummaryRail
      title="This Report"
      footer="The outcome you pick drives the pipeline stage and any deal, follow-up, or note that gets created."
    >
      <RailRow k="Outcome">
        {outcome
          ? <RailChip tone={OUTCOME_TONE[outcome] ?? "accent"}>{label(outcome)}</RailChip>
          : <span style={{ color: "var(--muted)" }}>Not set</span>}
      </RailRow>
      <RailRow k="Offer made">
        {offerMade ? <RailChip tone="good">Yes</RailChip> : <RailChip tone="neutral">No</RailChip>}
      </RailRow>
      {won && (
        <RailRow k="Deal">
          <RailChip tone="good">{outcome === "won_pif" ? "Won PIF" : `Won PP, ${label(cadence)}`}</RailChip>
        </RailRow>
      )}
      {showDeposit && <RailRow k="Deal"><RailChip tone="warn">Deposit taken</RailChip></RailRow>}
      <RailRow k="Qualified">
        {qualified === "yes" ? <RailChip tone="good">Yes</RailChip> : <RailChip tone="bad">No</RailChip>}
      </RailRow>
      <RailRow k="Follow-up">
        {followUp === "yes" ? <RailChip tone="accent">Scheduled</RailChip>
          : followUp === "no" ? <RailChip tone="neutral">None</RailChip>
            : <span style={{ color: "var(--muted)" }}>Not set</span>}
      </RailRow>
    </SummaryRail>
  );

  return (
    <FormLayout
      rail={rail}
      form={
        <form action={action} className="space-y-4">
          <FormCard
            icon="forms"
            title="Sales Call Report"
            subtitle="Logs the outcome, creates the deal on a close, and pushes the stage and a note to Close."
            footer={<SubmitBar pending={pending} label="Submit report" pendingLabel="Submitting..." />}
          >
            <Section title="Call and closer" hint="Pick the call being reported and who is submitting it.">
              <Field label="Call" required hint="This is the call date the report is tied to.">
                <select name="appointmentId" required defaultValue={defaultAppointmentId}>
                  <option value="" disabled>Pick the call</option>
                  {options.appointments.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                </select>
              </Field>
              <Field label="Closer submitting" required>
                <select name="repId" required defaultValue="">
                  <option value="" disabled>Pick the closer</option>
                  {options.reps.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </Field>
            </Section>

            <Section title="Outcome" hint="How the call ended. This sets the pipeline stage and unlocks the right follow-on fields.">
              <Field label="Outcome" required>
                <select name="callResult" required value={outcome} onChange={(e) => setOutcome(e.target.value)}>
                  <option value="" disabled>How did the call end</option>
                  {OUTCOMES.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                </select>
              </Field>

              <CheckRow>
                <input type="checkbox" name="offerMade" checked={offerMade} onChange={(e) => setOfferMade(e.target.checked)} />
                <span>Offer was made on this call</span>
              </CheckRow>

              {offerMade && !won && outcome !== "" && !["dq_on_call", "lost"].includes(outcome) && (
                <Field label="Deal type" hint="Only if money moved on the call.">
                  <select name="dealType" value={dealType} onChange={(e) => setDealType(e.target.value)}>
                    <option value="">No deal yet</option>
                    <option value="deposit">Deposit taken</option>
                  </select>
                </Field>
              )}
              {showDeposit && (
                <ConditionalPanel tone="warn" title="Deposit" hint="The deal record is created when it fully closes; this logs the deposit now.">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Deposit collected ($)" required><input name="cashCollected" type="number" step="0.01" required /></Field>
                    <Field label="Expected close date" required><input name="expectedCloseDate" type="date" required /></Field>
                  </div>
                </ConditionalPanel>
              )}
            </Section>

            {won && (
              <Section title="Won deal" hint="Records the deal, its value, and the payment schedule. This is the moment the deal is born.">
                <ConditionalPanel tone="good" title={outcome === "won_pif" ? "Paid in full" : "Payment plan"}>
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Amount contracted ($)" required><input name="amountContracted" type="number" step="0.01" required /></Field>
                    <Field label="Cash collected today ($)"><input name="cashCollected" type="number" step="0.01" placeholder="0 for zero-down" /></Field>
                  </div>
                  <Field label="Start date (first payment)" required><input name="startDate" type="date" required /></Field>
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
                        <Field label="Payment plan" required hint="Pick the plan that was sold.">
                          <select name="pricingPlanId" required defaultValue="">
                            <option value="" disabled>Pick the plan sold</option>
                            {options.plans.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                          </select>
                        </Field>
                      )}
                      {cadence === "custom" && (
                        <div>
                          <label className="mb-1.5 block text-[13px] font-medium" style={{ color: "var(--text)" }}>Custom installments</label>
                          <p className="mb-2 text-[11px]" style={{ color: "var(--muted)" }}>Enter each installment as an amount and a date.</p>
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

                  <CheckRow>
                    <input type="checkbox" name="isCouple" checked={isCouple} onChange={(e) => setIsCouple(e.target.checked)} />
                    <span>Couples deal (two people, one contract)</span>
                  </CheckRow>
                  <p className="text-[11px] leading-relaxed" style={{ color: "var(--muted)" }}>
                    For a couples deal, enter the COMBINED value for both people as the Amount contracted above.
                  </p>
                  {isCouple && (
                    <ConditionalPanel tone="accent" title="Partner" hint="The second person on this contract. They get linked to the same deal.">
                      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                        <Field label="Partner first name"><input name="partnerFirstName" /></Field>
                        <Field label="Partner last name"><input name="partnerLastName" /></Field>
                      </div>
                      <Field label="Partner email"><input name="partnerEmail" type="email" /></Field>
                    </ConditionalPanel>
                  )}
                </ConditionalPanel>
              </Section>
            )}

            <Section title="Qualification and objections" hint="Whether the lead qualified, plus the main objection that came up.">
              <Field label="Was the lead qualified?">
                <select name="qualified" value={qualified} onChange={(e) => setQualified(e.target.value)}>
                  <option value="yes">Yes (qualified, even if no offer was made)</option>
                  <option value="no">No (not qualified)</option>
                </select>
              </Field>
              {(qualified === "no" || outcome === "dq_on_call") && (
                <Field label="Disqualified reason" required>
                  <select name="dqReasonId" required defaultValue="">
                    <option value="" disabled>Why disqualified</option>
                    {options.dqReasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                  </select>
                </Field>
              )}
              {outcome === "lost" && (
                <Field label="Lost reason" required>
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
            </Section>

            <Section title="Follow-up" hint="Schedule the next touch, or record why there is not one.">
              <Field label="Follow up?" required>
                <select name="followUpWanted" required value={followUp} onChange={(e) => setFollowUp(e.target.value)}>
                  <option value="" disabled>Choose</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </Field>
              {followUp === "yes" && (
                <ConditionalPanel tone="accent">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Follow up date" required>
                      <input name="followUpDate" type="date" required defaultValue={followUpDefault} key={followUpDefault} />
                    </Field>
                    <Field label="Assignee" hint="Defaults to the closer.">
                      <select name="followUpAssignee" defaultValue="">
                        <option value="">The closer</option>
                        {options.reps.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                      </select>
                    </Field>
                  </div>
                </ConditionalPanel>
              )}
              {followUp === "no" && (
                <Field label="Why not?" required>
                  <input name="followUpWhyNot" required placeholder="Why no follow-up" />
                </Field>
              )}
            </Section>

            <Section title="Notes" hint="Anything the team should know about this call.">
              <Field label="Outcome notes">
                <textarea name="notes" rows={3} placeholder="Anything worth knowing" />
              </Field>
            </Section>
          </FormCard>
          <ResultBanner state={state} />
        </form>
      }
    />
  );
}
