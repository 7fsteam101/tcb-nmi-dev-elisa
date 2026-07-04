"use client";

import { useActionState, useState, useTransition } from "react";
import { Badge, label } from "@/components/ui";
import { money } from "@/lib/format";
import { saveProductAction, toggleProductAction, deleteProductAction } from "./actions";

type Product = {
  id: string;
  name: string;
  description: string | null;
  amount_minor: number;
  active: boolean;
  allow_plan: boolean;
  default_installments: number | null;
  default_frequency: string | null;
  sort_order: number | null;
};

const CADENCES = ["monthly", "biweekly", "weekly", "custom"];

// One blank product used as the default state when the form opens for a new
// record. Dollars is left empty so the price field starts clear.
const BLANK: Product = {
  id: "",
  name: "",
  description: null,
  amount_minor: 0,
  active: true,
  allow_plan: false,
  default_installments: null,
  default_frequency: null,
  sort_order: 0,
};

export function ProductsEditor({ products, canWrite }: { products: Product[]; canWrite: boolean }) {
  const [state, action, pending] = useActionState(saveProductAction, null as any);
  const [, start] = useTransition();
  const [editing, setEditing] = useState<Product | null>(null);

  // When editing, seed the form from that product; otherwise start blank. Keyed
  // so switching rows resets every field to the selected record.
  const form = editing ?? BLANK;
  const formKey = editing ? editing.id : "new";

  return (
    <div className="max-w-4xl space-y-4">
      <div className="card p-4">
        <div className="mb-3 text-sm font-semibold">Products</div>
        <table>
          <thead>
            <tr>
              <th>Name</th>
              <th>Price</th>
              <th>Status</th>
              <th>Plan</th>
              <th>Default frequency</th>
              <th>Installments</th>
              {canWrite && <th></th>}
            </tr>
          </thead>
          <tbody>
            {products.map((p) => (
              <tr key={p.id} style={{ opacity: p.active ? 1 : 0.45 }}>
                <td>
                  <div className="font-medium">{p.name}</div>
                  {p.description && <div className="text-xs" style={{ color: "var(--muted)" }}>{p.description}</div>}
                </td>
                <td>{money(p.amount_minor)}</td>
                <td><Badge tone={p.active ? "good" : "neutral"}>{p.active ? "Active" : "Inactive"}</Badge></td>
                <td>{p.allow_plan ? "Yes" : "No"}</td>
                <td style={{ color: p.default_frequency ? "var(--text)" : "var(--muted)" }}>{label(p.default_frequency)}</td>
                <td style={{ color: p.default_installments ? "var(--text)" : "var(--muted)" }}>{p.default_installments ?? "None"}</td>
                {canWrite && (
                  <td className="text-right whitespace-nowrap">
                    <button className="btn-ghost btn px-2 py-0.5 text-[11px]" onClick={() => setEditing(p)}>Edit</button>{" "}
                    <button className="btn-ghost btn px-2 py-0.5 text-[11px]" onClick={() => start(() => toggleProductAction(p.id))}>
                      {p.active ? "Disable" : "Enable"}
                    </button>{" "}
                    <button className="btn-ghost btn px-2 py-0.5 text-[11px]" style={{ color: "var(--bad)" }}
                      onClick={() => { if (confirm(`Delete ${p.name}? This cannot be undone.`)) start(() => deleteProductAction(p.id)); }}>
                      Delete
                    </button>
                  </td>
                )}
              </tr>
            ))}
            {products.length === 0 && (
              <tr><td colSpan={canWrite ? 7 : 6} style={{ color: "var(--muted)" }}>No products yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      {canWrite && (
        <div className="card p-4">
          <div className="mb-3 flex items-center justify-between">
            <div className="text-sm font-semibold">{editing ? `Edit ${editing.name}` : "New product"}</div>
            {editing && (
              <button className="btn-ghost btn px-2 py-0.5 text-[11px]" onClick={() => setEditing(null)}>Cancel edit</button>
            )}
          </div>
          <form key={formKey} action={action} className="grid grid-cols-1 gap-3 md:grid-cols-2">
            <input type="hidden" name="id" value={form.id} />

            <label className="flex flex-col gap-1 text-sm md:col-span-2">
              <span style={{ color: "var(--muted)" }}>Name</span>
              <input name="name" defaultValue={form.name} placeholder="Product name" required />
            </label>

            <label className="flex flex-col gap-1 text-sm md:col-span-2">
              <span style={{ color: "var(--muted)" }}>Description</span>
              <textarea name="description" defaultValue={form.description ?? ""} rows={2} placeholder="Optional description" />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span style={{ color: "var(--muted)" }}>Price (dollars)</span>
              <input name="price" type="number" step="0.01" min="0" defaultValue={form.id ? form.amount_minor / 100 : ""} placeholder="0.00" required />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span style={{ color: "var(--muted)" }}>Sort order</span>
              <input name="sort_order" type="number" defaultValue={form.sort_order ?? 0} />
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span style={{ color: "var(--muted)" }}>Default frequency</span>
              <select name="default_frequency" defaultValue={form.default_frequency ?? ""}>
                <option value="">None</option>
                {CADENCES.map((c) => <option key={c} value={c}>{label(c)}</option>)}
              </select>
            </label>

            <label className="flex flex-col gap-1 text-sm">
              <span style={{ color: "var(--muted)" }}>Default installments</span>
              <input name="default_installments" type="number" min="1" defaultValue={form.default_installments ?? ""} placeholder="Optional" />
            </label>

            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="active" defaultChecked={form.active} /> Active
            </label>

            <label className="flex items-center gap-1.5 text-sm">
              <input type="checkbox" name="allow_plan" defaultChecked={form.allow_plan} /> Allow payment plan
            </label>

            <div className="md:col-span-2">
              <button type="submit" disabled={pending} className="btn">{editing ? "Save changes" : "Add product"}</button>
            </div>
          </form>
          {state && <div className="mt-2 text-sm" style={{ color: state.ok ? "var(--good)" : "var(--bad)" }}>{state.message}</div>}
        </div>
      )}
    </div>
  );
}
