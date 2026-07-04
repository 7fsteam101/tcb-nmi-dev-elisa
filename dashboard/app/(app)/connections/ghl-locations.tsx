"use client";

import { useActionState } from "react";
import { setGhlLocationsAction } from "./location-actions";

export function GhlLocations({ marketing, repair }: { marketing: string; repair: string }) {
  const [state, action, pending] = useActionState(setGhlLocationsAction, null as any);
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <label className="block text-xs" style={{ color: "var(--muted)" }}>
          GHL Marketing location id
          <input name="marketing" defaultValue={marketing} placeholder="e.g. abc123LocationId" className="mt-1" />
        </label>
        <label className="block text-xs" style={{ color: "var(--muted)" }}>
          GHL Repair location id
          <input name="repair" defaultValue={repair} placeholder="e.g. def456LocationId" className="mt-1" />
        </label>
      </div>
      <div className="flex items-center gap-3">
        <button type="submit" disabled={pending} className="btn">{pending ? "Saving..." : "Save location ids"}</button>
        {state && <span className="text-sm" style={{ color: state.ok ? "var(--good)" : "var(--bad)" }}>{state.message}</span>}
      </div>
    </form>
  );
}
