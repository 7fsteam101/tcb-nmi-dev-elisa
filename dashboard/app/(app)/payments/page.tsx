import { requireAccess } from "@/lib/access";
import { requireSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { listPaymentLinks } from "@/lib/nmi-links";
import { money, dateTime } from "@/lib/format";
import { Card, SectionTitle, Badge, STATUS_TONE, label } from "@/components/ui";
import { LinkGenerator, type ContactOption } from "./generator";
import { StripeToggle } from "./stripe-toggle";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function Payments() {
  await requireAccess("receivables");
  const user = await requireSession();

  // Independent single-statement reads, safe to run together (<=4 concurrent).
  const [links, contactRows, stripeFlag] = await Promise.all([
    listPaymentLinks(),
    sql`
      select id, full_name, primary_email from core.contact
      where full_name is not null
      order by full_name limit 500` as unknown as Promise<
        { id: string; full_name: string | null; primary_email: string | null }[]
      >,
    getSetting<string>("payment_links_stripe_enabled", "false"),
  ]);

  const contacts: ContactOption[] = contactRows.map((c) => ({
    id: c.id,
    name: c.full_name ?? "",
    email: c.primary_email ?? "",
  }));

  const isAdmin = user.role === "admin";
  const stripeEnabled = stripeFlag === "true";
  // Stripe is only offered when the flag is on AND the caller is an admin.
  const canPickStripe = isAdmin && stripeEnabled;

  return (
    <div>
      <h1 className="text-xl font-semibold">Payment Links</h1>
      <p className="mb-6 text-sm" style={{ color: "var(--muted)" }}>
        Generate an NMI invoice with a hosted pay link. NMI emails the link to the customer; it flips to Paid here when it settles.
      </p>

      {isAdmin && (
        <div className="mb-6">
          <StripeToggle enabled={stripeEnabled} />
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <SectionTitle>New payment link</SectionTitle>
          <Card><LinkGenerator contacts={contacts} canPickStripe={canPickStripe} /></Card>
        </div>
        <div>
          <SectionTitle>Recent links</SectionTitle>
          <Card>
            <table>
              <thead><tr><th>Created</th><th>Customer</th><th>Processor</th><th className="text-right">Amount</th><th>Status</th></tr></thead>
              <tbody>
                {links.map((l: any) => (
                  <tr key={l.id}>
                    <td>{dateTime(l.created_at)}</td>
                    <td>{l.customer_name ?? l.customer_email ?? "—"}<div className="text-[11px]" style={{ color: "var(--muted)" }}>{l.description}</div></td>
                    <td><Badge tone="neutral">{label(l.processor)}</Badge></td>
                    <td className="text-right">{money(l.amount_minor)}</td>
                    <td><Badge tone={STATUS_TONE[l.status] ?? "neutral"}>{label(l.status)}</Badge></td>
                  </tr>
                ))}
                {links.length === 0 && <tr><td colSpan={5} style={{ color: "var(--muted)" }}>No links generated yet</td></tr>}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </div>
  );
}
