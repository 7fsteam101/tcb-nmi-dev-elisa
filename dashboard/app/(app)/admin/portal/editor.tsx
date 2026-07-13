"use client";

import { useState, useTransition } from "react";
import {
  setPortalFlagAction,
  setPortalBrandNameAction,
  setPortalBrandAccentAction,
  type PortalBoolField,
} from "./actions";

type Features = {
  showInvoices: boolean;
  showPaymentMethods: boolean;
  allowCardUpdate: boolean;
  editBusinessInfo: boolean;
  showSubscriptions: boolean;
  allowCancel: boolean;
  brandName: string;
  brandAccent: string;
};

// Each surface toggle; children (card updates / cancellation) only apply while
// their parent surface is on, so they're disabled when the parent is off.
const ROWS: { field: PortalBoolField; label: string; desc: string; parent?: PortalBoolField; parentLabel?: string }[] = [
  { field: "showInvoices", label: "Invoice history", desc: "Billing history — invoices, receipts, and the upcoming payment schedule." },
  { field: "showPaymentMethods", label: "Payment methods", desc: "The customer's saved cards on file." },
  { field: "allowCardUpdate", label: "Card updates", desc: "Let customers update a card via the hosted pay page.", parent: "showPaymentMethods", parentLabel: "Payment methods" },
  { field: "editBusinessInfo", label: "Business-info editing", desc: "Let customers edit their business and contact details." },
  { field: "showSubscriptions", label: "Subscriptions", desc: "The customer's active subscriptions / payment plans." },
  { field: "allowCancel", label: "Subscription cancellation", desc: "Let customers cancel a subscription (requires NMI cancel to be wired).", parent: "showSubscriptions", parentLabel: "Subscriptions" },
];

function Toggle({ on, disabled, onClick }: { on: boolean; disabled?: boolean; onClick: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onClick}
      className="relative inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors"
      style={{
        background: on ? "var(--accent)" : "var(--panel-2)",
        border: "1px solid var(--line)",
        opacity: disabled ? 0.4 : 1,
        cursor: disabled ? "not-allowed" : "pointer",
      }}
    >
      <span className="inline-block h-3.5 w-3.5 rounded-full bg-white transition-transform"
        style={{ transform: on ? "translateX(18px)" : "translateX(3px)" }} />
    </button>
  );
}

export function PortalSettingsEditor({ initial }: { initial: Features }) {
  const [f, setF] = useState<Features>(initial);
  const [name, setName] = useState(initial.brandName);
  const [accent, setAccent] = useState(initial.brandAccent);
  const [pending, start] = useTransition();

  const flip = (field: PortalBoolField) => {
    const next = !f[field];
    setF((s) => ({ ...s, [field]: next })); // optimistic
    start(async () => {
      try {
        await setPortalFlagAction(field, next);
      } catch {
        setF((s) => ({ ...s, [field]: !next })); // revert on failure
      }
    });
  };

  const saveName = () =>
    start(async () => {
      const r = await setPortalBrandNameAction(name);
      if (r?.value) setName(r.value);
    });

  const saveAccent = (val: string) => {
    setAccent(val);
    start(async () => {
      const r = await setPortalBrandAccentAction(val);
      if (r?.value) setAccent(r.value); // reflect the sanitized value
    });
  };

  const colorValue = /^#[0-9a-fA-F]{6}$/.test(accent) ? accent : "#3b82f6";

  return (
    <div>
      <div className="mb-3 text-[12px]" style={{ color: "var(--muted)" }}>
        {pending ? "Saving…" : "All changes save automatically."}
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {/* Customer-facing surfaces */}
        <div className="card p-4">
          <div className="mb-1 text-sm font-semibold">Customer-facing surfaces</div>
          <p className="mb-3 text-[12px]" style={{ color: "var(--muted)" }}>
            What each customer can see and do in their portal.
          </p>
          <div className="space-y-1">
            {ROWS.map((r) => {
              const disabled = r.parent ? !f[r.parent] : false;
              return (
                <div
                  key={r.field}
                  className="flex items-start justify-between gap-3 rounded px-2 py-2"
                  style={{ background: "var(--panel-2)", marginLeft: r.parent ? 16 : 0, opacity: disabled ? 0.6 : 1 }}
                >
                  <div>
                    <div className="text-sm">{r.label}</div>
                    <div className="text-[11px]" style={{ color: "var(--muted)" }}>
                      {disabled ? `Turn on ${r.parentLabel} to configure this.` : r.desc}
                    </div>
                  </div>
                  <Toggle on={f[r.field]} disabled={disabled} onClick={() => flip(r.field)} />
                </div>
              );
            })}
          </div>
        </div>

        {/* Branding */}
        <div className="card p-4">
          <div className="mb-3 text-sm font-semibold">Branding</div>

          <label className="mb-1 block text-xs" style={{ color: "var(--muted)" }}>Brand name</label>
          <div className="flex gap-2">
            <input
              value={name}
              onChange={(e) => setName(e.target.value)}
              onBlur={saveName}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              placeholder="The Credit Brothers"
              className="flex-1"
            />
            <button type="button" onClick={saveName} className="btn shrink-0">Save</button>
          </div>
          <p className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>Shown in the portal header and on the login page.</p>

          <label className="mb-1 mt-4 block text-xs" style={{ color: "var(--muted)" }}>Brand accent</label>
          <div className="flex items-center gap-2">
            <input
              type="color"
              value={colorValue}
              onChange={(e) => saveAccent(e.target.value)}
              style={{ width: 40, height: 34, padding: 0, background: "transparent", border: "1px solid var(--line)", borderRadius: 8, cursor: "pointer" }}
              aria-label="Brand accent color"
            />
            <input
              value={accent}
              onChange={(e) => setAccent(e.target.value)}
              onBlur={() => saveAccent(accent)}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }}
              placeholder="#3b82f6"
              className="w-28"
            />
            <span className="inline-block h-6 w-6 rounded" style={{ background: colorValue, border: "1px solid var(--line)" }} />
          </div>
          <p className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>Accent color for portal buttons and links. Hex (e.g. #3b82f6).</p>
        </div>
      </div>
    </div>
  );
}
