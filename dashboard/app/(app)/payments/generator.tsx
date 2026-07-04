"use client";

import { useActionState, useMemo, useRef, useState, useEffect } from "react";
import { createPaymentLinkAction } from "./actions";

export type ContactOption = { id: string; name: string; email: string };

export function LinkGenerator({
  contacts,
  canPickStripe,
}: {
  contacts: ContactOption[];
  canPickStripe: boolean;
}) {
  const [state, action, pending] = useActionState(createPaymentLinkAction, null as any);
  const [processor, setProcessor] = useState<"nmi" | "stripe">("nmi");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<ContactOption | null>(null);
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  // Client-side filter as the user types. Cap the rendered list so a 500-row
  // contact set never floods the dropdown.
  const matches = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return contacts.slice(0, 30);
    return contacts
      .filter((c) => c.name.toLowerCase().includes(q) || c.email.toLowerCase().includes(q))
      .slice(0, 30);
  }, [contacts, query]);

  const pick = (c: ContactOption) => {
    setSelected(c);
    setQuery("");
    setOpen(false);
  };

  return (
    <form action={action} className="space-y-3">
      <input type="hidden" name="contactId" value={selected?.id ?? ""} />
      <input type="hidden" name="processor" value={processor} />

      <div ref={ref} className="relative">
        <label className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Contact</label>
        {selected ? (
          <div
            className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2 text-sm"
            style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}
          >
            <span>
              {selected.name}
              {selected.email && (
                <span className="ml-2 text-[11px]" style={{ color: "var(--muted)" }}>{selected.email}</span>
              )}
            </span>
            <button
              type="button"
              className="btn-ghost btn px-2 py-0.5 text-[11px]"
              onClick={() => { setSelected(null); setOpen(true); }}
            >
              Change
            </button>
          </div>
        ) : (
          <>
            <input
              type="text"
              value={query}
              placeholder="Search contacts by name or email"
              onChange={(e) => { setQuery(e.target.value); setOpen(true); }}
              onFocus={() => setOpen(true)}
            />
            {open && (
              <div
                className="absolute z-30 mt-1 max-h-64 w-full overflow-auto rounded-xl border p-1 shadow-xl"
                style={{ borderColor: "var(--line)", background: "var(--panel)" }}
              >
                {matches.length === 0 && (
                  <div className="px-3 py-2 text-[13px]" style={{ color: "var(--muted)" }}>No matching contacts</div>
                )}
                {matches.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    onClick={() => pick(c)}
                    className="block w-full rounded-md px-3 py-1.5 text-left text-[13px] hover:bg-white/5"
                    style={{ color: "var(--text)" }}
                  >
                    {c.name}
                    {c.email && <span className="ml-2 text-[11px]" style={{ color: "var(--muted)" }}>{c.email}</span>}
                  </button>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <Field label="Amount ($)"><input name="amount" type="number" step="0.01" min="0" required placeholder="2500" /></Field>
        <Field label="Description"><input name="description" placeholder="Backdoor Credit Reset" /></Field>
      </div>

      {canPickStripe && (
        <div>
          <label className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Processor</label>
          <div className="flex gap-2">
            {(["nmi", "stripe"] as const).map((p) => (
              <button
                key={p}
                type="button"
                onClick={() => setProcessor(p)}
                className="rounded-lg border px-3 py-1.5 text-[13px] font-medium transition-colors"
                style={{
                  background: processor === p ? "var(--accent)" : "var(--panel)",
                  color: processor === p ? "#fff" : "var(--muted)",
                  borderColor: processor === p ? "var(--accent)" : "var(--line)",
                }}
              >
                {p === "nmi" ? "NMI" : "Stripe"}
              </button>
            ))}
          </div>
          {processor === "stripe" && (
            <p className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>
              Stripe link generation activates when the Stripe connector is wired. For now this records a placeholder.
            </p>
          )}
        </div>
      )}

      <button type="submit" disabled={pending || !selected} className="btn">
        {pending ? "Creating..." : "Create payment link"}
      </button>
      {!selected && (
        <p className="text-[11px]" style={{ color: "var(--muted)" }}>Pick a contact to enable.</p>
      )}
      {state && (
        <div className="rounded-lg border p-3 text-sm" style={{ borderColor: state.ok ? "var(--good)" : "var(--bad)" }}>
          {state.message}
        </div>
      )}
    </form>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>{label}</label>
      {children}
    </div>
  );
}
