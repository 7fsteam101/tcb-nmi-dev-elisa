import { getPaymentLinkByToken, scheduleFor } from "@/lib/nmi-links";
import { nmiTestMode } from "@/lib/nmi";
import { Checkout } from "./checkout";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const money = (m: number) => (m / 100).toLocaleString("en-US", { style: "currency", currency: "USD" });
const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default async function PayPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const link: any = await getPaymentLinkByToken(token);
  const testMode = await nmiTestMode();
  const tokenizationKey = process.env.NEXT_PUBLIC_NMI_TOKENIZATION_KEY || "";

  const shell = (children: React.ReactNode) => (
    <main style={{ minHeight: "100vh", background: "#0b0f17", color: "#e8edf5", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "ui-sans-serif, system-ui, -apple-system, sans-serif" }}>
      <div style={{ width: "100%", maxWidth: 460 }}>{children}</div>
    </main>
  );
  const card = (children: React.ReactNode) => (
    <div style={{ background: "#131a26", border: "1px solid #223049", borderRadius: 16, padding: 28, boxShadow: "0 20px 60px rgba(0,0,0,.4)" }}>{children}</div>
  );

  if (!link) return shell(card(<div><h1 style={{ fontSize: 20, fontWeight: 700 }}>Link not found</h1><p style={{ color: "#8aa0bd", marginTop: 8 }}>This payment link is invalid or has been removed.</p></div>));
  if (link.status === "paid") return shell(card(<div><div style={{ fontSize: 40 }}>&#10003;</div><h1 style={{ fontSize: 20, fontWeight: 700, marginTop: 8 }}>Payment complete</h1><p style={{ color: "#8aa0bd", marginTop: 8 }}>Thank you. This payment has already been processed.</p></div>));
  if (link.expires_at && new Date(link.expires_at) < new Date()) return shell(card(<div><h1 style={{ fontSize: 20, fontWeight: 700 }}>Link expired</h1><p style={{ color: "#8aa0bd", marginTop: 8 }}>Please contact your representative for a new payment link.</p></div>));

  const total = link.amount_minor as number;
  const n = (link.installments as number) || 1;
  const isPlan = n > 1;
  const schedule = isPlan ? scheduleFor(link) : [];
  const firstAmount = isPlan ? schedule[0].amountMinor : total;

  return shell(
    <>
      <div style={{ textAlign: "center", marginBottom: 18 }}>
        <div style={{ fontWeight: 800, letterSpacing: 0.5, fontSize: 15 }}>THE CREDIT BROTHERS</div>
        {testMode && <div style={{ display: "inline-block", marginTop: 8, fontSize: 11, fontWeight: 700, color: "#ffd479", background: "rgba(255,212,121,.12)", border: "1px solid rgba(255,212,121,.3)", borderRadius: 999, padding: "2px 10px" }}>TEST MODE</div>}
      </div>
      {card(
        <>
          <div style={{ fontSize: 13, color: "#8aa0bd" }}>{link.description || "Payment"}</div>
          <div style={{ fontSize: 34, fontWeight: 800, marginTop: 4 }}>{money(firstAmount)}{isPlan && <span style={{ fontSize: 14, color: "#8aa0bd", fontWeight: 500 }}> due today</span>}</div>

          {isPlan && (
            <div style={{ marginTop: 16, border: "1px solid #223049", borderRadius: 12, overflow: "hidden" }}>
              <div style={{ padding: "8px 12px", fontSize: 12, color: "#8aa0bd", borderBottom: "1px solid #223049" }}>
                {money(total)} total &middot; {n} payments &middot; {link.frequency || "monthly"}. The card you use today auto-charges the rest.
              </div>
              {schedule.map((s) => (
                <div key={s.no} style={{ display: "flex", justifyContent: "space-between", padding: "7px 12px", fontSize: 13, borderTop: s.no > 1 ? "1px solid #1a2536" : "none" }}>
                  <span style={{ color: "#8aa0bd" }}>#{s.no} &middot; {day(s.dueDate)}{s.no === 1 ? " (today)" : ""}</span>
                  <span style={{ fontWeight: 600 }}>{money(s.amountMinor)}</span>
                </div>
              ))}
            </div>
          )}

          <Checkout
            token={token}
            firstAmountLabel={money(firstAmount)}
            defaultName={link.customer_name || ""}
            defaultEmail={link.customer_email || ""}
            tokenizationKey={tokenizationKey}
            testMode={testMode}
            price={(firstAmount / 100).toFixed(2)}
          />

          <p style={{ fontSize: 11, color: "#5f728c", marginTop: 14, textAlign: "center" }}>
            Secured by NMI. Your card details are encrypted. Price is tax inclusive.
          </p>
        </>
      )}
    </>
  );
}
