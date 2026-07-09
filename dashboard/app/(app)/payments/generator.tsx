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
const dayLabel = (iso: string) => iso ? new Date(iso + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" }) : "—";
type Row = { amountStr: string; date: string };

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
  const [customRows, setCustomRows] = useState<Row[]>([]);

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

  const totalMinor = Math.round((parseFloat(amountStr) || 0) * 100);
  const canPlan = !!product?.allow_plan;
  const usePlan = canPlan && plan;
  const isCustom = usePlan && frequency === "custom";

  // seed the custom schedule the first time Custom is chosen: N rows, evenly
  // split, one month apart starting today. After that it is the user's to edit.
  useEffect(() => {
    if (!isCustom) return;
    setCustomRows((prev) => {
      if (prev.length) return prev;
      const n = Math.max(2, installments);
      const per = totalMinor > 0 ? Math.floor(totalMinor / n) : 0;
      return Array.from({ length: n }, (_, i) => {
        const d = new Date(); d.setMonth(d.getMonth() + i);
        return { amountStr: ((i === n - 1 ? totalMinor - per * (n - 1) : per) / 100).toFixed(2), date: d.toISOString().slice(0, 10) };
      });
    });
  }, [isCustom]); // eslint-disable-line react-hooks/exhaustive-deps

  const customSchedule = customRows.map((r, i) => ({ no: i + 1, dueDate: r.date, amountMinor: Math.round((parseFloat(r.amountStr) || 0) * 100) }));
  const customSum = customSchedule.reduce((s, r) => s + r.amountMinor, 0);
  const setRow = (i: number, patch: Partial<Row>) => setCustomRows((rows) => rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  const addRow = () => setCustomRows((rows) => { const last = rows[rows.length - 1]; const d = last ? new Date(last.date + "T00:00:00") : new Date(); d.setMonth(d.getMonth() + 1); return [...rows, { amountStr: "0.00", date: d.toISOString().slice(0, 10) }]; });
  const removeRow = (i: number) => setCustomRows((rows) => rows.filter((_, j) => j !== i));

  const effInstallments = isCustom ? customRows.length : installments;
  const perInstallment = usePlan && effInstallments > 0 ? Math.round(totalMinor / effInstallments) : totalMinor;
  const freqLabel = FREQS.find((f) => f.key === frequency)?.label ?? "Monthly";

  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts.slice(0, 30);
    return contacts.filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q)).slice(0, 30);
  }, [contacts, query]);

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
        <input type="hidden" name="installments" value={usePlan ? String(effInstallments) : ""} />
        <input type="hidden" name="customSchedule" value={isCustom ? JSON.stringify(customSchedule) : ""} />

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

        {/* amount + charge-as */}
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
          <div className="space-y-3 rounded-lg border p-3" style={{ borderColor: "var(--line)", background: "color-mix(in srgb, var(--accent) 6%, transparent)" }}>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Frequency</label>
                <select value={frequency} onChange={(e) => setFrequency(e.target.value)}>
                  {FREQS.map((f) => <option key={f.key} value={f.key}>{f.label}</option>)}
                </select>
              </div>
              {!isCustom && (
                <div>
                  <label className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Installments</label>
                  <input type="number" min="2" max="60" value={installments} onChange={(e) => setInstallments(Math.max(2, parseInt(e.target.value) || 2))} />
                </div>
              )}
            </div>

            {isCustom && (
              <div>
                <div className="mb-1 flex items-center justify-between">
                  <label className="text-xs" style={{ color: "var(--muted)" }}>Custom installments (set each amount and date)</label>
                  <span className="text-[11px]" style={{ color: customSum === totalMinor ? "var(--muted)" : "var(--warn)" }}>
                    {money(customSum)} of {money(totalMinor)}
                  </span>
                </div>
                <div className="space-y-2">
                  {customRows.map((r, i) => (
                    <div key={i} className="flex items-center gap-2">
                      <span className="w-5 text-[12px]" style={{ color: "var(--muted)" }}>#{i + 1}</span>
                      <div className="relative flex-1">
                        <span className="pointer-events-none absolute left-2 top-1/2 -translate-y-1/2 text-[12px]" style={{ color: "var(--muted)" }}>$</span>
                        <input type="number" step="0.01" min="0" value={r.amountStr} onChange={(e) => setRow(i, { amountStr: e.target.value })} className="pl-5" placeholder="0.00" />
                      </div>
                      <input type="date" value={r.date} onChange={(e) => setRow(i, { date: e.target.value })} className="flex-1" />
                      <button type="button" onClick={() => removeRow(i)} disabled={customRows.length <= 2}
                        className="btn-ghost btn px-2 py-1 text-[12px]" title="Remove">&times;</button>
                    </div>
                  ))}
                </div>
                <div className="mt-2 flex items-center gap-3">
                  <button type="button" onClick={addRow} className="btn-ghost btn px-2 py-1 text-[12px]">+ Add installment</button>
                  {customSum !== totalMinor && <span className="text-[11px]" style={{ color: "var(--warn)" }}>Installments should sum to the total.</span>}
                </div>
              </div>
            )}
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
        {(!selected || !productId) && <p className="text-[11px]" style={{ color: "var(--muted)" }}>Pick a contact and product to enable. No email is sent, you get a link to share.</p>}
        {state && <div className="rounded-lg border p-3 text-sm" style={{ borderColor: state.ok ? "var(--good)" : "var(--bad)" }}>
          <div style={{ color: state.ok ? "var(--text)" : "var(--bad)" }}>{state.message}</div>
          {state.ok && state.url && <CopyLink url={state.url} />}
        </div>}
      </form>

      {/* pro-forma invoice preview */}
      <ProForma contact={selected} product={product} totalMinor={totalMinor} usePlan={usePlan}
        installments={effInstallments} perInstallment={perInstallment} freqLabel={freqLabel}
        isCustom={isCustom} customSchedule={isCustom ? customSchedule : null}
        invoiceToken={state?.ok ? state.token : null} />
    </div>
  );
}

function ProForma({ contact, product, totalMinor, usePlan, installments, perInstallment, freqLabel, isCustom, customSchedule, invoiceToken }: {
  contact: ContactOption | null; product: ProductOption | null; totalMinor: number;
  usePlan: boolean; installments: number; perInstallment: number; freqLabel: string;
  isCustom: boolean; customSchedule: { no: number; dueDate: string; amountMinor: number }[] | null;
  invoiceToken: string | null;
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

      {usePlan && isCustom && customSchedule ? (
        <div className="mt-3 rounded-lg p-3 text-[12px]" style={{ background: "var(--panel-2)" }}>
          <div className="mb-1.5" style={{ color: "var(--muted)" }}>Custom payment plan, {customSchedule.length} payments:</div>
          <div className="space-y-1">
            {customSchedule.map((s) => (
              <div key={s.no} className="flex items-center justify-between">
                <span style={{ color: "var(--muted)" }}>#{s.no} &middot; {dayLabel(s.dueDate)}{s.no === 1 ? " (today)" : ""}</span>
                <span style={{ color: "var(--text)" }}>{money(s.amountMinor)}</span>
              </div>
            ))}
          </div>
        </div>
      ) : (
        <div className="mt-3 rounded-lg p-3 text-[12px]" style={{ background: "var(--panel-2)", color: "var(--muted)" }}>
          {usePlan
            ? <>Payment plan: <span style={{ color: "var(--text)" }}>{installments} payments of {money(perInstallment)}</span>, {freqLabel.toLowerCase()}.</>
            : <>One-time charge of <span style={{ color: "var(--text)" }}>{money(totalMinor)}</span>.</>}
        </div>
      )}

      {invoiceToken && (
        <a href={`/api/invoice/${invoiceToken}`} target="_blank" rel="noopener noreferrer"
           className="mt-4 flex items-center justify-center gap-2 rounded-lg px-4 py-2.5 text-sm font-semibold"
           style={{ background: "var(--good)", color: "#fff" }}>
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" y1="15" x2="12" y2="3" /></svg>
          Download PDF invoice
        </a>
      )}
    </div>
  );
}

// The generated pay link with a one-click copy. URL is monospace/muted/truncated
// (NMI links are long); the copy button flips to a green check for ~1.2s.
function CopyLink({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 1200);
    } catch { /* clipboard needs a secure context (https / localhost) — both hold here */ }
  };
  return (
    <div className="mt-1.5 flex items-center gap-2 rounded-lg border px-2.5 py-1.5"
         style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}>
      <span className="min-w-0 flex-1 truncate font-mono text-[12px]" style={{ color: "var(--muted)" }} title={url}>{url}</span>
      <button type="button" onClick={copy} title="Copy link" aria-live="polite"
        className="inline-flex shrink-0 items-center gap-1 rounded-md px-1.5 py-0.5 text-[11px] font-medium hover:bg-white/5"
        style={{ color: copied ? "var(--good)" : "var(--bad)" }}>
        {copied ? (
          <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12" /></svg>Copied!</>
        ) : (
          <><svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" /><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" /></svg>Copy</>
        )}
      </button>
    </div>
  );
}
