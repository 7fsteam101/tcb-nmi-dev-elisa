"use client";

import { useActionState } from "react";
import { saveAccountAction } from "./actions";

type Initial = {
  first_name: string;
  last_name: string;
  company_name: string;
  website: string;
  primary_phone: string;
  primary_email: string;
};

const field: React.CSSProperties = { width: "100%", background: "#0b0f17", border: "1px solid #223049", borderRadius: 8, padding: "9px 11px", color: "#e8edf5", fontSize: 14 };
const label: React.CSSProperties = { fontSize: 12, color: "#8aa0bd", marginBottom: 5, display: "block" };

export function AccountForm({ initial, accent = "#3b82f6" }: { initial: Initial; accent?: string }) {
  const [state, action, pending] = useActionState(saveAccountAction, null as { ok: boolean; message: string } | null);

  return (
    <form action={action} style={{ background: "#131a26", border: "1px solid #223049", borderRadius: 14, padding: 20, marginTop: 16, maxWidth: 520 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
        <div>
          <label style={label}>First name</label>
          <input name="first_name" defaultValue={initial.first_name} style={field} />
        </div>
        <div>
          <label style={label}>Last name</label>
          <input name="last_name" defaultValue={initial.last_name} style={field} />
        </div>
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={label}>Business name</label>
        <input name="company_name" defaultValue={initial.company_name} style={field} />
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={label}>Website</label>
        <input name="website" defaultValue={initial.website} style={field} placeholder="https://" />
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={label}>Phone</label>
        <input name="primary_phone" defaultValue={initial.primary_phone} style={field} />
      </div>

      <div style={{ marginTop: 12 }}>
        <label style={label}>Email (contact support to change)</label>
        <input value={initial.primary_email} disabled style={{ ...field, opacity: 0.55, cursor: "not-allowed" }} />
      </div>

      <div style={{ marginTop: 18, display: "flex", alignItems: "center", gap: 12 }}>
        <button type="submit" disabled={pending} style={{ background: accent, color: "#fff", border: "none", borderRadius: 8, padding: "9px 18px", fontSize: 14, fontWeight: 600, cursor: pending ? "default" : "pointer", opacity: pending ? 0.6 : 1 }}>
          {pending ? "Saving…" : "Save changes"}
        </button>
        {state && <span style={{ fontSize: 13, color: state.ok ? "#4ade80" : "#f87171" }}>{state.message}</span>}
      </div>
    </form>
  );
}
