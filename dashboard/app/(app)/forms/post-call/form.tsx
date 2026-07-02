"use client";

import { useActionState } from "react";
import type { FormOptions } from "@/lib/form-options";
import { submitPostCallAction } from "./actions";

export function PostCallForm({ options }: { options: FormOptions }) {
  const [state, action, pending] = useActionState(submitPostCallAction, null as any);

  return (
    <form action={action} className="card max-w-2xl space-y-4 p-6">
      <Field label="Call">
        <select name="callId" required defaultValue="">
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
      <Field label="Notes">
        <textarea name="notes" rows={5} required placeholder="How the call went, next steps, anything the team should know" />
      </Field>
      <Field label="Objections that came up">
        <div className="grid grid-cols-2 gap-1.5">
          {options.objectionTypes.map((o) => (
            <label key={o.id} className="flex items-center gap-2 text-sm">
              <input type="checkbox" name="objections" value={o.id} /> {o.label}
            </label>
          ))}
        </div>
      </Field>
      <button type="submit" disabled={pending} className="btn w-full">{pending ? "Submitting..." : "Submit notes"}</button>
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
