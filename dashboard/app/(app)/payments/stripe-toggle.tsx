"use client";

import { useActionState } from "react";
import { InfoTip } from "@/components/ui";
import { setStripeEnabledAction } from "./actions";

// Admin-only switch for whether the Stripe processor is offered on the form.
// The parent page renders this only for admins; the server action re-checks.
export function StripeToggle({ enabled }: { enabled: boolean }) {
  const [state, action, pending] = useActionState(setStripeEnabledAction, null as any);
  return (
    <div className="card flex flex-wrap items-center justify-between gap-3 p-4">
      <div className="flex items-center gap-1.5 text-sm">
        <span className="font-medium">Stripe processor</span>
        <InfoTip text="When on, admins can pick Stripe on the payment-links form. Stripe link generation activates once the Stripe connector is wired. NMI is always available." />
        <span className="ml-2 text-xs" style={{ color: enabled ? "var(--good)" : "var(--muted)" }}>
          {enabled ? "Enabled" : "Disabled"}
        </span>
      </div>
      <form action={action}>
        <input type="hidden" name="enabled" value={enabled ? "false" : "true"} />
        <button type="submit" disabled={pending} className="btn-ghost btn">
          {pending ? "Saving..." : enabled ? "Disable Stripe option" : "Enable Stripe option"}
        </button>
      </form>
      {state && !state.ok && (
        <div className="w-full text-sm" style={{ color: "var(--bad)" }}>{state.message}</div>
      )}
    </div>
  );
}
