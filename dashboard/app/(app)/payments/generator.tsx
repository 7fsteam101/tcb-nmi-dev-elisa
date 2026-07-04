"use client";

import { useActionState } from "react";
import { createPaymentLinkAction } from "./actions";

export function LinkGenerator() {
  const [state, action, pending] = useActionState(createPaymentLinkAction, null as any);
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount ($)"><input name="amount" type="number" step="0.01" min="0" required placeholder="2500" /></Field>
        <Field label="Customer email (link is emailed here)"><input name="customerEmail" type="email" required /></Field>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <Field label="Customer name"><input name="customerName" placeholder="Optional" /></Field>
        <Field label="Description"><input name="description" placeholder="Backdoor Credit Reset" /></Field>
      </div>
      <button type="submit" disabled={pending} className="btn">{pending ? "Creating..." : "Create payment link"}</button>
      {state && (
        <div className="rounded-lg border p-3 text-sm" style={{ borderColor: state.ok ? "var(--good)" : "var(--bad)" }}>
          {state.message}
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
