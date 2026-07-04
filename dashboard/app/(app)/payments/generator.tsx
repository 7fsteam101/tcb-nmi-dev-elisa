"use client";

import { useActionState, useMemo, useRef, useState, useEffect } from "react";
import { createPaymentLinkAction } from "./actions";

export type ContactOption = { id: string; name: string; email: string };
export type ProductOption = {
  id: string; name: string; description: string | null; amount_minor: number;
  allow_plan: boolean; default_installments: number | null; default_frequency: string | null;
};

const FREQS = [
  { key: "monthly", label: "Monthly" },
  { key: "biweekly", label: "Every 2 weeks" },
  { key: "weekly", label: "Weekly" },
  { key: "custom", label: "Custom" },
];
const money = (minor: number) => `$${(minor / 100).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

export function LinkGenerator({
  contacts, products, canPickStripe,
}: {
  contacts: ContactOption[]; products: ProductOption[]; canPickStripe: boolean;
}) {
  const [state, action, pending] = useActionState(createPaymentLinkAction, null as any);
  const [processor, setProcessor] = useState<"nmi" | "stripe">("nmi");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ContactOption | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  const [productId, setProductId] = useState<string>("");
  const product = products.find((p) => p.id === productId) ?? null;
  const [amountStr, setAmountStr] = useState<string>("");
  const [plan, setPlan] = useState(false);
  const [frequency, setFrequency] = useState<string>("monthly");
  const [installments, setInstallments] = useState<number>(4);

  // when a product is chosen, seed amount + plan defaults
  useEffect(() => {
    if (!product) return;
    setAmountStr((product.amount_minor / 100).toString());
    setPlan(false);
    if (product.default_frequency) setFrequency(product.default_frequency);
    if (product.default_installments) setInstallments(product.default_installments);
  }, [productId]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts.slice(0, 30);
    return contacts.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)).slice(0, 30);
  }, [contacts, query]);

  const totalMinor = Math.round((parseFloat(amountStr) || 0) * 100);
  const canPlan = !!product?.allow_plan;
  const usePlan = canPlan && plan;
  const perInstallment = usePlan && installments > 0 ? Math.round(totalMinor / installments) : totalMinor;
  const freqLabel = FREQS.find((f) => f.key === frequency)?.label ?? "Monthly";

  return (
    <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_320px]">
      <form action={action} className="space-y-3">
        <input type="hidden" name="contactId" value={selected?.id ?? ""} />
        <input type="hidden" name="processor" value={processor} />
        <input type="hidden" name="productId" value={productId} />
        <input type="hidden" name="amount" value={amountStr} />
        <input type="hidden" name="description" value={product?.name ?? ""} />
        <input type="hidden" name="planType" value={usePlan ? "plan" : "onetime"} />
        <input type="hidden" name="frequency" value={usePlan ? frequency : ""} />
        <input type="hidden" name="installments" value={usePlan ? String(installments) : ""} />

        {/* contact */}
        <div ref={ref} className="relative">
          <label className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Contact</label>
          {selected ? (
            <div className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm" style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}>
              <span>{selected.name}{selected.email && <span className="ml-2 text-[11px]" style={{ color: "var(--muted)" }}>{selected.email}</span>}</span>
              <button type="button" className="btn-ghost btn px-2 py-0.5 text-[11px]" onClick={() => { setSelected(null); setOpen(true); }}>Change</button>
            </div>
          ) : (
            <>
              <input type="text" value={query} placeholder="Search contacts by name or email"
                onChange={(e) => { setQuery(e.target.value); setOpen(true); }} onFocus={() => setOpen(true)} />
              {open && (
                <div className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border p-1 shadow-xl" style={{ borderColor: "var(--line)", background: "var(--panel)" }}>
                  {matches.length === 0 && <div className="px-3 py-2 text-[13px]" style={{ color: "var(--muted)" }}>No matching contacts</div>}
                  {matches.map((c) => (
                    <button key={c.id} type="button" onClick={() => { setSelected(c); setQuery(""); setOpen(false); }}
                      className="block w-full rounded-md px-3 py-1.5 text-left text-[13px] hover:bg-white/5" style={{ color: "var(--text)" }}>
                      {c.name}{c.email && <span className="ml-2 text-[11px]" style={{ color: "var(--muted)" }}>{c.email}</span>}
                    </button>
                  ))}
                </div>
              )}
            </>
          )}
        </div>

        {/* product */}
        <div>
          <label className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Product</label>
          <select value={productId} onChange={(e) => setProductId(e.target.value)} required>
            <option value="">Select a product</option>
            {products.map((p) => <option key={p.id} value={p.id}>{p.name} — {money(p.amount_minor)}</option>)}
          </select>
          {products.length === 0 && <p className="mt-1 text-[11px]" style={{ color: "var(--warn)" }}>No products yet. Add them in Admin, Products.</p>}
        </div>

        {/* amount (editable, seeded from product) */}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Total amount ($)</label>
            <input type="number" step="0.01" min="0" value={amountStr} onChange={(e) => setAmountStr(e.target.value)} placeholder="0.00" required />
          </div>
          {canPlan && (
            <div>
              <label className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Charge as</label>
              <div className="flex gap-2">
                {[{ k: false, l: "One-time" }, { k: true, l: "Payment plan" }].map((o) => (
                  <button key={String(o.k)} type="button" onClick={() => setPlan(o.k)}
                    className="flex-1 rounded-lg border px-2 py-1.5 text-[13px] font-medium"
                    style={{ background: plan === o.k ? "var(--accent)" : "var(--panel)", color: plan === o.k ? "#fff" : "var(--muted)", borderColor: plan === o.k ? "var(--accent)" : "var(--line)" }}>
                    {o.l}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>

        {/* plan details */}
        {usePlan && (
          <div className="grid grid-cols-2 gap-3 rounded-lg border p-3" style={{ borderColor: "var(--line)", background: "color-mix(in srgb, var(--accent) 6%, transparent)" }}>
            <div>
              <label className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Frequency</label>
              <select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                {FREQS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
              </select>
            </div>
            <div>
              <label className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Installments</label>
              <input type="number" min="2" max="60" value={installments} onChange={(e) => setInstallments(Math.max(2, parseInt(e.target.value) || 2))} />
            </div>
          </div>
        )}

        {canPickStripe && (
          <div>
            <label className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Processor</label>
            <div className="flex gap-2">
              {(["nmi", "stripe"] as const).map((p) => (
                <button key={p} type="button" onClick={() => setProcessor(p)}
                  className="rounded-lg border px-3 py-1.5 text-[13px] font-medium"
                  style={{ background: processor === p ? "var(--accent)" : "var(--panel)", color: processor === p ? "#fff" : "var(--muted)", borderColor: processor === p ? "var(--accent)" : "var(--line)" }}>
                  {p === "nmi" ? "NMI" : "Stripe"}
                </button>
              ))}
            </div>
            {processor === "stripe" && <p className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>Stripe activates when its connector is wired; for now this records a placeholder.</p>}
          </div>
        )}

        <button type="submit" disabled={pending || !selected || !productId || totalMinor <= 0} className="btn">
          {pending ? "Creating..." : usePlan ? "Create payment plan link" : "Create payment link"}
        </button>
        {(!selected || !productId) && <p className="text-[11px]" style={{ color: "var(--muted)" }}>Pick a contact and product to enable.</p>}
        {state && <div className="rounded-lg border p-3 text-sm" style={{ borderColor: state.ok ? "var(--good)" : "var(--bad)" }}>{state.message}</div>}
      </form>

      {/* pro-forma invoice preview */}
      <ProForma contact={selected} product={product} totalMinor={totalMinor} usePlan={usePlan}
        installments={installments} perInstallment={perInstallment} freqLabel={freqLabel} money={money} />
    </div>
  );
}

function ProForma({ contact, product, totalMinor, usePlan, installments, perInstallment, freqLabel, money }: {
  contact: ContactOption | null; product: ProductOption | null; totalMinor: number;
  usePlan: boolean; installments: number; perInstallment: number; freqLabel: string; money: (m: number) => string;
}) {
  return (
    <div className="rounded-xl border p-5 text-sm" style={{ borderColor: "var(--line)", background: "var(--panel)", height: "fit-content" }}>
      <div className="mb-4 flex items-center justify-between">
        <span className="text-[10px] uppercase tracking-wider" style={{ color: "var(--muted)" }}>Pro forma invoice</span>
        <span className="text-[11px]" style={{ color: "var(--muted)" }}>The Credit Brothers</span>
      </div>
      <div className="mb-3">
        <div className="text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>Bill to</div>
        <div style={{ color: "var(--text)" }}>{contact?.name ?? "—"}</div>
        {contact?.email && <div className="text-[11px]" style={{ color: "var(--muted)" }}>{contact.email}</div>}
      </div>
      <div className="my-3 border-t" style={{ borderColor: "var(--line)" }} />
      <div className="flex items-start justify-between gap-2">
        <div>
          <div style={{ color: "var(--text)" }}>{product?.name ?? "No product selected"}</div>
          {product?.description && <div className="mt-0.5 text-[11px]" style={{ color: "var(--muted)" }}>{product.description}</div>}
        </div>
        <div className="whitespace-nowrap font-medium" style={{ color: "var(--text)" }}>{money(totalMinor)}</div>
      </div>
      <div className="my-3 border-t" style={{ borderColor: "var(--line)" }} />
      <div className="flex items-center justify-between">
        <span style={{ color: "var(--muted)" }}>Total</span>
        <span className="text-lg font-semibold" style={{ color: "var(--text)" }}>{money(totalMinor)}</span>
      </div>
      <div className="mt-3 rounded-lg p-3 text-[12px]" style={{ background: "var(--panel-2)", color: "var(--muted)" }}>
        {usePlan
          ? <>Payment plan: <span style={{ color: "var(--text)" }}>{installments} payments of {money(perInstallment)}</span>, {freqLabel.toLowerCase()}.</>
          : <>One-time charge of <span style={{ color: "var(--text)" }}>{money(totalMinor)}</span>.</>}
      </div>
    </div>
  );
}
