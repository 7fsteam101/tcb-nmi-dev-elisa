"use client";

import { useActionState, useState } from "react";
import type { FormOptions } from "@/lib/form-options";
import { submitPostCallAction } from "./actions";
import {
  FormPageHeader, FormLayout, Section, Field,
  SubmitBar, ResultBanner, SummaryRail, RailRow, RailChip,
} from "../form-kit";

export function PostCallForm({ options, defaultCallId = "" }: { options: FormOptions; defaultCallId?: string }) {
  const [state, action, pending] = useActionState(submitPostCallAction, null as any);
  // Display-only: count how many objection boxes are ticked for the summary rail.
  // The checkboxes stay real form fields (name="objections"); this never changes
  // what is submitted.
  const [objectionCount, setObjectionCount] = useState(0);

  const rail = (
    <SummaryRail
      title="This Report"
      footer="Notes and objections after a taken call. The note posts to the lead in Close so the record stays complete."
    >
      <RailRow k="Type"><RailChip tone="accent">Post-call notes</RailChip></RailRow>
      <RailRow k="Objections">
        {objectionCount > 0
          ? <RailChip tone="warn">{objectionCount} selected</RailChip>
          : <span style={{ color: "var(--muted)" }}>None</span>}
      </RailRow>
    </SummaryRail>
  );

  return (
    <div>
      <FormPageHeader
        icon="knowledge"
        title="Post-Call Notes"
        subtitle="Notes and objections after a taken call. The note posts to the lead in Close."
      />
      <FormLayout
        rail={rail}
        form={
          <form action={action} className="space-y-5">
            <Section step={1} title="Call and rep" hint="Pick the taken call and who is submitting the notes.">
              <Field label="Call">
                <select name="callId" required defaultValue={defaultCallId}>
                  <option value="" disabled>Pick the taken call</option>
                  {options.takenCalls.map((c) => <option key={c.id} value={c.id}>{c.label}</option>)}
                </select>
              </Field>
              <Field label="Rep submitting">
                <select name="repId" required defaultValue="">
                  <option value="" disabled>Pick the rep</option>
                  {options.reps.map((r) => <option key={r.id} value={r.id}>{r.label}</option>)}
                </select>
              </Field>
            </Section>

            <Section step={2} title="Notes" hint="How the call went and any next steps. This is the note that posts to Close.">
              <Field label="Notes">
                <textarea name="notes" rows={5} required placeholder="How the call went, next steps, anything the team should know" />
              </Field>
            </Section>

            <Section step={3} title="Objections" hint="Tick every objection that came up on the call.">
              <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                {options.objectionTypes.map((o) => (
                  <label
                    key={o.id}
                    className="flex cursor-pointer items-center gap-2.5 rounded-lg border px-3 py-2.5 text-sm transition-colors"
                    style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}
                  >
                    <input
                      type="checkbox"
                      name="objections"
                      value={o.id}
                      onChange={(e) => setObjectionCount((c) => c + (e.target.checked ? 1 : -1))}
                    />
                    <span>{o.label}</span>
                  </label>
                ))}
              </div>
            </Section>

            <SubmitBar pending={pending} label="Submit notes" pendingLabel="Submitting..." />
            <ResultBanner state={state} />
          </form>
        }
      />
    </div>
  );
}
