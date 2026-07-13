import { redirect } from "next/navigation";
import Link from "next/link";
import { getPortalSession } from "@/lib/portal-auth";
import { CancelSubscription } from "./cancel-subscription";
import {
  getPortalCustomer,
  getPortalFeatures,
  listCustomerInvoices,
  listCustomerReceipts,
  listCustomerCardsOnFile,
  listCustomerSubscriptions,
  listCustomerSchedule,
  money,
} from "@/lib/portal";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const card: React.CSSProperties = { background: "#131a26", border: "1px solid #223049", borderRadius: 14, padding: 20, marginTop: 16 };
const h2: React.CSSProperties = { fontSize: 15, fontWeight: 700, marginBottom: 12 };
const muted: React.CSSProperties = { color: "#8aa0bd" };
const row: React.CSSProperties = { display: "flex", justifyContent: "space-between", alignItems: "center", padding: "10px 0", borderTop: "1px solid #1a2536", fontSize: 14 };

function StatusPill({ status }: { status: string }) {
  const good = ["paid", "active", "completed"].includes(status);
  const bad = ["failed", "expired", "void", "refunded", "delinquent"].includes(status);
  const color = good ? "#4ade80" : bad ? "#f87171" : "#8aa0bd";
  return <span style={{ fontSize: 12, color, border: `1px solid ${color}55`, borderRadius: 999, padding: "1px 8px" }}>{status}</span>;
}

const day = (iso: string) => new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });

export default async function PortalHome() {
  const session = await getPortalSession();
  if (!session) redirect("/portal/login");
  const contactId = session.contactId;

  const [customer, f] = [await getPortalCustomer(contactId), await getPortalFeatures()];
  if (!customer) redirect("/portal/login");
  const accent = f.brandAccent && f.brandAccent.trim() ? f.brandAccent : "#3b82f6";

  const [invoices, receipts, cards, subs, schedule] = [
    f.showInvoices ? await listCustomerInvoices(contactId) : [],
    f.showInvoices ? await listCustomerReceipts(contactId) : [],
    f.showPaymentMethods ? await listCustomerCardsOnFile(contactId) : [],
    f.showSubscriptions ? await listCustomerSubscriptions(contactId) : [],
    f.showInvoices ? await listCustomerSchedule(contactId) : [],
  ];
  const upcoming = schedule.filter((s) => s.status !== "paid");

  return (
    <>
      <style>{`
        a.portal-pay-row { cursor: pointer; transition: background-color 120ms ease; }
        a.portal-pay-row:hover { background-color: rgba(255, 255, 255, 0.04); }
      `}</style>
      <h1 style={{ fontSize: 22, fontWeight: 800 }}>Hi{customer.first_name ? `, ${customer.first_name}` : ""}</h1>
      <p style={{ ...muted, marginTop: 4 }}>Manage your billing, payment methods, and account details.</p>

      {f.showPaymentMethods && (
        <section id="payment-methods" style={card}>
          <div style={h2}>Payment methods</div>
          {cards.length === 0 && <div style={muted}>No card on file.</div>}
          {cards.map((c) => (
            <div key={c.vaultId} style={row}>
              <div>
                {c.card ? <span>{c.card.brand} •••• {c.card.last4} · exp {c.card.exp}</span> : <span style={muted}>Card on file</span>}
                {c.description && <div style={{ ...muted, fontSize: 12 }}>{c.description}</div>}
              </div>
              {f.allowCardUpdate && c.linkToken && (
                <Link href={`/pay/${c.linkToken}/card`} target="_blank" rel="noopener noreferrer" style={{ fontSize: 13, color: accent, textDecoration: "none" }}>
                  Update card →
                </Link>
              )}
            </div>
          ))}
        </section>
      )}

      {f.showSubscriptions && subs.length > 0 && (
        <section style={card}>
          <div style={h2}>Subscriptions</div>
          {subs.map((s, i) => {
            // "Active" = not already in a terminal cancelled/ended state. The
            // cancel affordance only shows when the admin flag allowCancel is on.
            const cancellable = f.allowCancel && !["void", "refunded", "expired"].includes(s.status);
            return (
              <div key={s.linkId || `sub-${i}`} style={row}>
                <div>
                  <div>{s.description || "Payment plan"}</div>
                  <div style={{ ...muted, fontSize: 12 }}>Started {day(s.created_at)}</div>
                </div>
                <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                  <StatusPill status={s.status} />
                  {cancellable && <CancelSubscription linkId={s.linkId} />}
                </span>
              </div>
            );
          })}
        </section>
      )}

      {f.showInvoices && upcoming.length > 0 && (
        <section style={card}>
          <div style={h2}>Upcoming payments</div>
          {upcoming.map((s) => (
            <div key={s.id} style={row}>
              <span style={muted}>#{s.installment_no} · due {day(s.due_date)}</span>
              <span style={{ display: "flex", gap: 10, alignItems: "center" }}>{money(s.amount_minor)} <StatusPill status={s.status} /></span>
            </div>
          ))}
        </section>
      )}

      {f.showInvoices && (
        <section style={card}>
          <div style={h2}>Billing history</div>
          {invoices.length === 0 && receipts.length === 0 && <div style={muted}>No billing history yet.</div>}
          {invoices.map((inv) => {
            // Unpaid + has a hosted-pay token -> the whole row links to the existing
            // /pay/<token> page and is styled with the accent so it reads as
            // actionable. Paid (or tokenless) invoices render plain & non-clickable.
            const payable = ["pending", "sent", "created", "failed"].includes(inv.status) && !!inv.token;
            if (payable) {
              return (
                <Link
                  key={inv.id}
                  href={`/pay/${inv.token}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="portal-pay-row"
                  style={{ ...row, textDecoration: "none", color: "inherit" }}
                >
                  <div>
                    <div style={{ color: accent, fontWeight: 600 }}>{inv.description || "Payment"}</div>
                    <div style={{ ...muted, fontSize: 12 }}>{day(inv.created_at)}</div>
                  </div>
                  <span style={{ display: "flex", gap: 10, alignItems: "center" }}>
                    {money(inv.amount_minor)} <StatusPill status={inv.status} />
                    <span style={{ color: accent, fontWeight: 600 }}>Pay now →</span>
                  </span>
                </Link>
              );
            }
            return (
              <div key={inv.id} style={row}>
                <div>
                  <div>{inv.description || "Payment"}</div>
                  <div style={{ ...muted, fontSize: 12 }}>{day(inv.created_at)}</div>
                </div>
                <span style={{ display: "flex", gap: 10, alignItems: "center" }}>{money(inv.amount_minor)} <StatusPill status={inv.status} /></span>
              </div>
            );
          })}
          {receipts.map((r) => (
            <div key={r.id} style={row}>
              <div>
                <div>{r.type} payment</div>
                <div style={{ ...muted, fontSize: 12 }}>{day(r.occurred_at)} · {r.processor}</div>
              </div>
              <span style={{ display: "flex", gap: 10, alignItems: "center" }}>{money(r.amount_minor)} <StatusPill status="paid" /></span>
            </div>
          ))}
        </section>
      )}
    </>
  );
}
