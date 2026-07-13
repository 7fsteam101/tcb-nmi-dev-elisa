"use client";

import { useState, useTransition } from "react";
import { cancelSubscriptionAction } from "./actions";

const pill: React.CSSProperties = {
  borderRadius: 8,
  padding: "3px 10px",
  fontSize: 12,
  cursor: "pointer",
  lineHeight: 1.4,
};

// Two-click confirm so a subscription is never cancelled on a single tap:
// "Cancel" -> "Confirm cancel" / "Keep". Only rendered by the page when
// features.allowCancel is true.
export function CancelSubscription({ linkId }: { linkId: string }) {
  const [confirming, setConfirming] = useState(false);
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const doCancel = () =>
    start(async () => {
      setError(null);
      const r = await cancelSubscriptionAction(linkId);
      setConfirming(false);
      if (!r?.ok) setError(r?.message || "Could not cancel. Please try again.");
      // On success revalidatePath re-renders the row as 'void' and this button
      // disappears (the page only renders it for active subscriptions).
    });

  return (
    <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
      {error && <span style={{ color: "#f87171", fontSize: 11 }}>{error}</span>}
      {!confirming ? (
        <button
          type="button"
          onClick={() => { setError(null); setConfirming(true); }}
          style={{ ...pill, background: "none", border: "1px solid #223049", color: "#8aa0bd" }}
        >
          Cancel
        </button>
      ) : (
        <>
          <button
            type="button"
            disabled={pending}
            onClick={doCancel}
            style={{ ...pill, background: "#f87171", border: "none", color: "#fff", opacity: pending ? 0.6 : 1 }}
          >
            {pending ? "Cancelling…" : "Confirm cancel"}
          </button>
          <button
            type="button"
            disabled={pending}
            onClick={() => setConfirming(false)}
            style={{ ...pill, background: "none", border: "1px solid #223049", color: "#8aa0bd" }}
          >
            Keep
          </button>
        </>
      )}
    </span>
  );
}
