"use client";

import { useActionState } from "react";
import { saveKeyAction } from "./actions";

export function KeyForm() {
  const [state, action, pending] = useActionState(saveKeyAction, null as any);
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div>
          <label className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Provider</label>
          <select name="provider" defaultValue="close">
            <option value="close">Close (API key)</option>
            <option value="stripe">Stripe (restricted key)</option>
            <option value="nmi">NMI (security key)</option>
            <option value="meta">Meta (access token)</option>
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Label</label>
          <input name="label" placeholder="e.g. Close - TCB" />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Account id (optional)</label>
        <input name="accountId" placeholder="org / account id, or leave blank" />
      </div>
      <div>
        <label className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Key</label>
        <input name="key" type="password" placeholder="Pasted keys are stored encrypted in the database vault" required />
      </div>
      <button type="submit" disabled={pending} className="btn">{pending ? "Saving..." : "Save connection"}</button>
      {state && <div className="text-sm" style={{ color: state.ok ? "var(--good)" : "var(--bad)" }}>{state.message}</div>}
    </form>
  );
}
