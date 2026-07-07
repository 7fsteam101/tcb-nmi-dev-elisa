"use client";

import { useActionState } from "react";
import { chargeNowAction } from "./actions";

// Admin control shown per payment-link row that has a saved card. The amount is
// prefilled from the link but editable; submitting asks a native confirm (the
// codebase's pattern for destructive actions) before charging the real card.
// The server action re-checks admin role, the cap, and the 60s dedupe.
export function ChargeNow({ linkId, defaultAmountMinor, customerLabel }: {
  linkId: string; defaultAmountMinor: number; customerLabel: string;
}) {
  const [state, action, pending] = useActionState(chargeNowAction, null as any);
  return (
    <form
      action={action}
      onSubmit={(e) => {
        const amt = String(new FormData(e.currentTarget).get("amount") ?? "");
        if (!amt || !confirm(`Charge $${amt} to ${customerLabel}'s saved card now? This moves real money.`)) e.preventDefault();
      }}
      className="flex items-center justify-end gap-1.5 whitespace-nowrap"
    >
      <input type="hidden" name="linkId" value={linkId} />
      <input
        name="amount" type="number" step="0.01" min="0.01"
        defaultValue={(defaultAmountMinor / 100).toFixed(2)}
        className="w-20 rounded border px-1.5 py-0.5 text-[12px]"
        style={{ borderColor: "var(--line)", background: "var(--panel-2)", color: "var(--text)" }}
      />
      <button type="submit" disabled={pending} className="btn-ghost btn px-2 py-0.5 text-[11px]">
        {pending ? "Charging…" : "Charge saved card"}
      </button>
      {state && (
        <span className="text-[11px]" style={{ color: state.ok ? "var(--good)" : "var(--bad)" }}>{state.message}</span>
      )}
    </form>
  );
}
