"use client";

import { useActionState, useState } from "react";
import { resplitPlanAction } from "./actions";

export function PlanEditor({ deals }: { deals: any[] }) {
  const [state, action, pending] = useActionState(resplitPlanAction, null as any);
  const [selected, setSelected] = useState("");
  const deal = deals.find((d) => d.id === selected);

  return (
    <div className="max-w-3xl space-y-4">
      <div className="card p-4">
        <div className="mb-3 text-sm font-semibold">Active deals</div>
        <table>
          <thead><tr><th>Client</th><th>Plan</th><th>Contract</th><th>Collected</th><th>Remaining</th><th>Open installments</th></tr></thead>
          <tbody>
            {deals.map((d) => (
              <tr key={d.id} style={selected === d.id ? { background: "color-mix(in srgb, var(--accent) 12%, transparent)" } : undefined}>
                <td><button onClick={() => setSelected(d.id)} className="text-left font-medium">{d.contact_name}</button></td>
                <td className="uppercase">{d.plan_type} v{d.version}</td>
                <td>${(d.tcv_minor / 100).toLocaleString()}</td>
                <td>${(d.paid_minor / 100).toLocaleString()}</td>
                <td>${((d.tcv_minor - d.paid_minor) / 100).toLocaleString()}</td>
                <td>{d.open_receivables}</td>
              </tr>
            ))}
            {deals.length === 0 && <tr><td colSpan={6} style={{ color: "var(--muted)" }}>No active deals</td></tr>}
          </tbody>
        </table>
      </div>

      {deal && (
        <div className="card p-4">
          <div className="mb-1 text-sm font-semibold">Re-split: {deal.contact_name}</div>
          <p className="mb-3 text-xs" style={{ color: "var(--muted)" }}>
            Creates plan version {deal.version + 1} for the remaining ${((deal.tcv_minor - deal.paid_minor) / 100).toLocaleString()}.
            Paid installments and the old schedule stay in history — nothing is overwritten.
          </p>
          <form action={action} className="flex flex-wrap items-end gap-3">
            <input type="hidden" name="dealId" value={deal.id} />
            <div>
              <label className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>New plan label</label>
              <select name="planType" defaultValue={deal.plan_type} className="w-auto">
                {["pif", "3pay", "6pay", "7pay", "12pay", "13pay", "zero_down"].map((n) => <option key={n} value={n}>{n}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Installments</label>
              <input name="installments" type="number" min="1" defaultValue={3} className="w-28" required />
            </div>
            <div>
              <label className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>First due date</label>
              <input name="firstDue" type="date" required />
            </div>
            <button type="submit" disabled={pending} className="btn">{pending ? "Creating..." : "Create new version"}</button>
          </form>
          {state && <div className="mt-3 text-sm" style={{ color: state.ok ? "var(--good)" : "var(--bad)" }}>{state.message}</div>}
        </div>
      )}
    </div>
  );
}
