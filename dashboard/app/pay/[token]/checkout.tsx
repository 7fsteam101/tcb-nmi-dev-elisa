"use client";

import { useEffect, useRef, useState } from "react";

declare global { interface Window { CollectJS?: any } }

const input: React.CSSProperties = {
  width: "100%", padding: "11px 12px", marginTop: 8, borderRadius: 10,
  border: "1px solid #2a3a54", background: "#0e1622", color: "#e8edf5", fontSize: 15,
};
const label: React.CSSProperties = { fontSize: 12, color: "#8aa0bd", marginTop: 12, display: "block" };

export function Checkout({ token, firstAmountLabel, defaultName, defaultEmail, tokenizationKey, testMode, action = "/api/charge", payLabel, requireContact = true, collectZip = true }: {
  token: string; firstAmountLabel: string; defaultName: string; defaultEmail: string; tokenizationKey: string; testMode: boolean;
  action?: string; payLabel?: string; requireContact?: boolean; collectZip?: boolean;
}) {
  const [name, setName] = useState(defaultName);
  const [email, setEmail] = useState(defaultEmail);
  const [phone, setPhone] = useState("");
  const [zip, setZip] = useState("");
  const [status, setStatus] = useState<"idle" | "loading" | "done" | "error">("idle");
  const [message, setMessage] = useState("");
  const collectReady = useRef(false);

  const useCollect = !!tokenizationKey;

  async function charge(payload: Record<string, unknown>) {
    setStatus("loading"); setMessage("");
    try {
      const res = await fetch(action, {
        method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, name, email, phone, zip, ...payload }),
      });
      const body = await res.json();
      if (body.ok) { setStatus("done"); setMessage(body.message || "Payment successful."); }
      else { setStatus("error"); setMessage(body.message || "Payment failed."); }
    } catch (e) {
      setStatus("error"); setMessage("Network error, please try again.");
    }
  }

  // Collect.js: mount hosted fields + wallet buttons when a tokenization key is set.
  useEffect(() => {
    if (!useCollect || collectReady.current) return;
    const s = document.createElement("script");
    s.src = "https://secure.nmi.com/token/Collect.js";
    s.async = true;
    s.setAttribute("data-tokenization-key", tokenizationKey);
    s.onload = () => {
      if (!window.CollectJS) return;
      collectReady.current = true;
      window.CollectJS.configure({
        variant: "inline",
        googleFont: "",
        fields: {
          ccnumber: { selector: "#ccnumber", placeholder: "Card number" },
          ccexp: { selector: "#ccexp", placeholder: "MM / YY" },
          cvv: { selector: "#cvv", placeholder: "CVV" },
          // wallet buttons render into these when supported by the merchant/processor
          googlePay: { selector: "#googlepay", buttonType: "pay", buttonColor: "white" },
          applePay: { selector: "#applepay", buttonType: "plain", buttonStyle: "white-outline" },
        },
        callback: (resp: any) => { if (resp?.token) charge({ paymentToken: resp.token }); },
      });
    };
    document.body.appendChild(s);
    return () => { s.remove(); };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [useCollect, tokenizationKey]);

  if (status === "done") {
    return (
      <div style={{ marginTop: 20, textAlign: "center" }}>
        <div style={{ fontSize: 40 }}>&#10003;</div>
        <div style={{ fontWeight: 700, marginTop: 6 }}>Payment received</div>
        <div style={{ color: "#8aa0bd", marginTop: 6, fontSize: 14 }}>{message}</div>
      </div>
    );
  }

  const disabled = status === "loading" || (requireContact && (!name || !email)) || (collectZip && !zip.trim());
  const btnLabel = payLabel ?? `Pay ${firstAmountLabel}`;

  return (
    <div style={{ marginTop: 18 }}>
      <label style={label}>Full name</label>
      <input style={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Name on card" />
      <label style={label}>Email</label>
      <input style={input} value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@email.com" type="email" />
      <label style={label}>Phone (optional)</label>
      <input style={input} value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" />

      {useCollect ? (
        <>
          <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
            <div id="applepay" style={{ flex: 1 }} />
            <div id="googlepay" style={{ flex: 1 }} />
          </div>
          <div style={{ textAlign: "center", color: "#5f728c", fontSize: 12, margin: "12px 0" }}>or pay by card</div>
          <label style={label}>Card number</label>
          <div id="ccnumber" style={{ ...input, padding: 0, height: 44 }} />
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}><label style={label}>Expiry</label><div id="ccexp" style={{ ...input, padding: 0, height: 44 }} /></div>
            <div style={{ flex: 1 }}><label style={label}>CVV</label><div id="cvv" style={{ ...input, padding: 0, height: 44 }} /></div>
          </div>
          {collectZip && (
            <>
              <label style={label}>ZIP / Postal code</label>
              <input style={input} value={zip} onChange={(e) => setZip(e.target.value)} inputMode="numeric" placeholder="ZIP" autoComplete="postal-code" />
            </>
          )}
          <button type="button" disabled={disabled} onClick={() => window.CollectJS?.startPaymentRequest()}
            style={payBtn(disabled)}>{status === "loading" ? "Processing..." : btnLabel}</button>
        </>
      ) : (
        <TestCardForm buttonLabel={btnLabel} loading={status === "loading"} disabled={disabled}
          collectZip={collectZip} zip={zip} setZip={setZip} onPay={(card) => charge({ card })} />
      )}

      {status === "error" && <div style={{ marginTop: 12, color: "#ff8a8a", fontSize: 13, textAlign: "center" }}>{message}</div>}
      {testMode && !useCollect && <div style={{ marginTop: 12, color: "#ffd479", fontSize: 11, textAlign: "center" }}>Test mode: use 4111 1111 1111 1111, any future expiry, CVV 999. Apple Pay / Google Pay activate once the NMI tokenization key is set.</div>}
    </div>
  );
}

function payBtn(disabled: boolean): React.CSSProperties {
  return { width: "100%", marginTop: 18, padding: "13px", borderRadius: 10, border: "none",
    background: disabled ? "#2a3a54" : "#3b82f6", color: "#fff", fontWeight: 700, fontSize: 15, cursor: disabled ? "not-allowed" : "pointer" };
}

function TestCardForm({ buttonLabel, loading, disabled, collectZip, zip, setZip, onPay }: {
  buttonLabel: string; loading: boolean; disabled: boolean;
  collectZip: boolean; zip: string; setZip: (v: string) => void;
  onPay: (c: { ccnumber: string; ccexp: string; cvv: string }) => void;
}) {
  const [ccnumber, setCc] = useState("4111111111111111");
  const [ccexp, setExp] = useState("1027");
  const [cvv, setCvv] = useState("999");
  return (
    <>
      <label style={label}>Card number</label>
      <input style={input} value={ccnumber} onChange={(e) => setCc(e.target.value)} inputMode="numeric" />
      <div style={{ display: "flex", gap: 10 }}>
        <div style={{ flex: 1 }}><label style={label}>Expiry (MMYY)</label><input style={input} value={ccexp} onChange={(e) => setExp(e.target.value)} inputMode="numeric" /></div>
        <div style={{ flex: 1 }}><label style={label}>CVV</label><input style={input} value={cvv} onChange={(e) => setCvv(e.target.value)} inputMode="numeric" /></div>
      </div>
      {collectZip && (
        <>
          <label style={label}>ZIP / Postal code</label>
          <input style={input} value={zip} onChange={(e) => setZip(e.target.value)} inputMode="numeric" />
        </>
      )}
      <button type="button" disabled={disabled} onClick={() => onPay({ ccnumber, ccexp, cvv })} style={payBtn(disabled)}>
        {loading ? "Processing..." : buttonLabel}
      </button>
    </>
  );
}
