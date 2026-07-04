"use client";

import { useActionState, useState } from "react";
import type { FormOptions } from "@/lib/form-options";
import { label } from "@/components/ui";
import { submitMissedCallAction } from "./actions";
import {
  FormPageHeader, FormLayout, Section, Field, ConditionalPanel, CheckRow,
  SubmitBar, ResultBanner, SummaryRail, RailRow, RailChip,
} from "../form-kit";

// Presentation-only: which chip color the summary rail shows for each outcome.
const WHAT_TONE: Record<string, "warn" | "bad" | "accent"> = {
  cancelled_by_lead: "bad", cancelled_by_team: "warn", no_show: "bad", rescheduled: "accent",
};

export function MissedCallForm({ options }: { options: FormOptions }) {
  const [state, action, pending] = useActionState(submitMissedCallAction, null as any);
  const [what, setWhat] = useState("no_show");
  const [dq, setDq] = useState(false);
  const [followUp, setFollowUp] = useState("");

  const rail = (
    <SummaryRail
      title="This Report"
      footer="The old slot stays in history so no-shows, cancellations, and reschedules stay measurable as leakage."
    >
      <RailRow k="Outcome"><RailChip tone={WHAT_TONE[what] ?? "warn"}>{label(what)}</RailChip></RailRow>
      {what === "rescheduled" && (
        <RailRow k="New time"><span style={{ color: "var(--muted)" }}>Set below</span></RailRow>
      )}
      <RailRow k="Disqualify">
        {dq ? <RailChip tone="bad">Yes</RailChip> : <RailChip tone="neutral">No</RailChip>}
      </RailRow>
      <RailRow k="Follow-up">
        {followUp === "yes" ? <RailChip tone="accent">Scheduled</RailChip>
          : followUp === "no" ? <RailChip tone="neutral">None</RailChip>
            : <span style={{ color: "var(--muted)" }}>Not set</span>}
      </RailRow>
    </SummaryRail>
  );

  return (
    <div>
      <FormPageHeader
        icon="calls"
        title="Missed Call Report"
        subtitle="No-shows, cancellations, and reschedules. The old slot stays in history so leakage is measurable."
      />
      <FormLayout
        rail={rail}
        form={
          <form action={action} className="space-y-5">
            <Section step={1} title="Call and rep" hint="Pick the booked call and who is submitting the report.">
              <Field label="Call" hint="This is the call date the report is tied to.">
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
            </Section>

            <Section step={2} title="What happened" hint="The missed-call outcome, plus an optional reason.">
              <Field label="Outcome">
                <select name="what" value={what} onChange={(e) => setWhat(e.target.value)}>
                  <option value="cancelled_by_lead">Lead cancelled</option>
                  <option value="cancelled_by_team">Closer cancelled</option>
                  <option value="no_show">No show</option>
                  <option value="rescheduled">Rescheduled</option>
                </select>
              </Field>
              {what === "rescheduled" && (
                <ConditionalPanel tone="accent" hint="Leave the new time empty if it is not set yet (it goes to the rebook-pending queue).">
                  <Field label="New date and time">
                    <input type="datetime-local" name="newTime" />
                  </Field>
                  <Field label="Rescheduled by" hint="Who moved the call.">
                    <select name="movedBy" defaultValue="closer">
                      <option value="closer">Closer</option>
                      <option value="lead_link">Lead</option>
                    </select>
                  </Field>
                </ConditionalPanel>
              )}
              <Field label="Reason">
                <select name="reasonId" defaultValue="">
                  <option value="">No reason given</option>
                  {options.cancelReasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </Field>
            </Section>

            <Section step={3} title="Qualification" hint="Disqualify the lead here if it should not be worked again.">
              <CheckRow>
                <input type="checkbox" checked={dq} onChange={(e) => setDq(e.target.checked)} />
                <span>Disqualify this lead</span>
              </CheckRow>
              {dq && (
                <Field label="Disqualified reason">
                  <select name="dqReasonId" required defaultValue="">
                    <option value="" disabled>Why disqualified</option>
                    {options.dqReasons.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                  </select>
                </Field>
              )}
            </Section>

            <Section step={4} title="Follow-up" hint="Schedule the next touch, or record why there is not one.">
              <Field label="Follow up?">
                <select name="followUpWanted" required value={followUp} onChange={(e) => setFollowUp(e.target.value)}>
                  <option value="" disabled>Choose</option>
                  <option value="yes">Yes</option>
                  <option value="no">No</option>
                </select>
              </Field>
              {followUp === "yes" && (
                <ConditionalPanel tone="accent">
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Field label="Follow up date"><input name="followUpDate" type="date" required /></Field>
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
                <Field label="Why not?">
                  <input name="followUpWhyNot" required placeholder="Why no follow-up" />
                </Field>
              )}
            </Section>

            <Section step={5} title="Notes" hint="Anything the team should know.">
              <Field label="Outcome notes">
                <textarea name="notes" rows={3} />
              </Field>
            </Section>

            <SubmitBar pending={pending} label="Submit report" pendingLabel="Submitting..." />
            <ResultBanner state={state} />
          </form>
        }
      />
    </div>
  );
}
