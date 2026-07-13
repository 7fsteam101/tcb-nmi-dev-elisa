"use client";

import { useActionState } from "react";
import { loginAction, type LoginState } from "./actions";

const field: React.CSSProperties = {
  width: "100%",
  background: "#0b0f17",
  border: "1px solid #223049",
  borderRadius: 8,
  padding: "11px 13px",
  color: "#e8edf5",
  fontSize: 15,
};
const btn: React.CSSProperties = {
  width: "100%",
  color: "#fff",
  border: "none",
  borderRadius: 8,
  padding: "11px 18px",
  fontSize: 15,
  fontWeight: 600,
  marginTop: 14,
  cursor: "pointer",
};
const muted: React.CSSProperties = { color: "#8aa0bd", fontSize: 13 };

export function LoginForm({ prefilledEmail = "", accent = "#3b82f6" }: { prefilledEmail?: string; accent?: string }) {
  const [state, action, pending] = useActionState(loginAction, {
    phase: "request",
    email: prefilledEmail,
    error: null,
  } as LoginState);

  const verifying = state.phase === "verify";

  return (
    <form action={action}>
      <input type="hidden" name="phase" value={verifying ? "verify" : "request"} />

      {!verifying && (
        <>
          <label style={{ ...muted, display: "block", marginBottom: 6 }}>Email address</label>
          <input
            name="email"
            type="email"
            defaultValue={state.email}
            placeholder="you@example.com"
            autoFocus
            required
            style={field}
          />
          <button type="submit" disabled={pending} style={{ ...btn, background: accent, opacity: pending ? 0.6 : 1 }}>
            {pending ? "Sending…" : "Email me a code"}
          </button>
        </>
      )}

      {verifying && (
        <>
          <input type="hidden" name="email" value={state.email} />
          <p style={{ ...muted, marginBottom: 12 }}>
            We sent a 6-digit code to <span style={{ color: "#e8edf5" }}>{state.email}</span>. It
            expires in 10 minutes.
          </p>
          <label style={{ ...muted, display: "block", marginBottom: 6 }}>Enter code</label>
          <input
            name="code"
            inputMode="numeric"
            pattern="\d{6}"
            maxLength={6}
            placeholder="000000"
            autoFocus
            required
            style={{ ...field, letterSpacing: 6, textAlign: "center", fontSize: 22 }}
          />
          <button type="submit" disabled={pending} style={{ ...btn, background: accent, opacity: pending ? 0.6 : 1 }}>
            {pending ? "Verifying…" : "Verify & sign in"}
          </button>
        </>
      )}

      {state.error && (
        <p style={{ color: "#f87171", fontSize: 13, marginTop: 12 }}>{state.error}</p>
      )}
    </form>
  );
}
