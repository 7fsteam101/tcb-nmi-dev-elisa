"use client";

import { useActionState, useState, useTransition } from "react";
import { togglePlanAction, updatePlanAmountAction, addPlanAction, toggleOfferAction } from "./actions";

export function PricingEditor({ offers, plans }: { offers: any[]; plans: any[] }) {
  const [state, action, pending] = useActionState(addPlanAction, null as any);
  const [, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  return (
    <div className="max-w-4xl space-y-4">
      <div className="card p-4">
        <div className="mb-3 text-sm font-semibold">Offers</div>
        <table>
          <thead><tr><th>Offer</th><th>Type</th><th>Default price</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {offers.map((o) => (
              <tr key={o.id} style={{ opacity: o.active ? 1 : 0.45 }}>
                <td>{o.name}</td>
                <td style={{ color: "var(--muted)" }}>{o.type}</td>
                <td>{o.default_price_minor ? `$${(o.default_price_minor / 100).toLocaleString()}` : "—"}</td>
                <td>{o.active ? "active" : "inactive"}</td>
                <td className="text-right">
                  <button className="btn-ghost btn px-2 py-0.5 text-[11px]" onClick={() => start(() => toggleOfferAction(o.id))}>
                    {o.active ? "Deactivate" : "Activate"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="card p-4">
        <div className="mb-3 text-sm font-semibold">BDCR payment plans (what the Sales Call form offers)</div>
        <table>
          <thead><tr><th>Plan</th><th>Version</th><th>Installments</th><th>Per installment</th><th>Total</th><th>First+last upfront</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {plans.map((p) => (
              <tr key={p.id} style={{ opacity: p.effective_to ? 0.45 : 1 }}>
                <td className="uppercase">{p.name}</td>
                <td>v{p.version}</td>
                <td>{p.installments}</td>
                <td>
                  {editing === p.id ? (
                    <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} className="w-24 py-0.5"
                      onBlur={() => { start(() => updatePlanAmountAction(p.id, draft)); setEditing(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                  ) : (
                    <button title="Click to edit" onClick={() => { setEditing(p.id); setDraft(String(p.installment_amount_minor / 100)); }}>
                      ${(p.installment_amount_minor / 100).toLocaleString()}
                    </button>
                  )}
                </td>
                <td>${((p.installments * p.installment_amount_minor) / 100).toLocaleString()}</td>
                <td>{p.requires_first_last ? "yes" : "no"}</td>
                <td>{p.effective_to ? "retired" : "active"}</td>
                <td className="text-right">
                  <button className="btn-ghost btn px-2 py-0.5 text-[11px]" onClick={() => start(() => togglePlanAction(p.id))}>
                    {p.effective_to ? "Reactivate" : "Retire"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <form action={action} className="mt-4 flex flex-wrap items-center gap-2">
          <select name="name" defaultValue="zero_down" className="w-auto">
            {["pif", "3pay", "6pay", "7pay", "12pay", "13pay", "zero_down"].map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
          <input name="installments" type="number" min="1" placeholder="Installments" className="max-w-32" required />
          <input name="amount" type="number" step="0.01" placeholder="$ per installment" className="max-w-40" required />
          <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="firstLast" /> first+last upfront</label>
          <button type="submit" disabled={pending} className="btn">Add plan</button>
        </form>
        {state && <div className="mt-2 text-sm" style={{ color: state.ok ? "var(--good)" : "var(--bad)" }}>{state.message}</div>}
        <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
          When the new zero-down pricing lands, add it here — it becomes selectable on the Sales Call form immediately.
        </p>
      </div>
    </div>
  );
}
