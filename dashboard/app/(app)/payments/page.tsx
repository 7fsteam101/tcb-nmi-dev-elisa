import { requireAccess } from "@/lib/access";
import { requireSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { getSetting } from "@/lib/settings";
import { listPaymentLinks } from "@/lib/nmi-links";
import { getVaultCardCached } from "@/lib/nmi";
import { money, dateTime } from "@/lib/format";
import { Card, Badge, STATUS_TONE, label } from "@/components/ui";
import { LinkGenerator, type ContactOption, type ProductOption } from "./generator";
import { StripeToggle } from "./stripe-toggle";
import { PaymentsTabs } from "./tabs";
import { ChargeNow } from "./charge-now";
import { RecentLinkRow } from "./recent-link-row";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function Payments() {
  await requireAccess("receivables");
  const user = await requireSession();

  // Sequential (not Promise.all): this page loads a 500-row contact list plus
  // three other reads; fanning them concurrently on top of the layout's shell
  // queries spikes past the free-tier pooler cap and stalls. Latency here is fine.
  const links = await listPaymentLinks();
  const contactRows = await (sql`select id, full_name, primary_email from core.contact where full_name is not null order by full_name limit 500` as unknown as Promise<
    { id: string; full_name: string | null; primary_email: string | null }[]>);
  const products = await (sql`select id, name, description, amount_minor, allow_plan, default_installments, default_frequency
      from finance.payment_product where active order by sort_order nulls last, name` as unknown as Promise<ProductOption[]>);
  const stripeFlag = await getSetting<string>("payment_links_stripe_enabled", "false");

  const contacts: ContactOption[] = contactRows.map((c) => ({ id: c.id, name: c.full_name ?? "", email: c.primary_email ?? "" }));
  const isAdmin = user.role === "admin";
  const stripeEnabled = stripeFlag === "true";
  const canPickStripe = isAdmin && stripeEnabled;

  // Masked saved-card details for the admin table. Cached (5-min TTL) so a normal
  // refresh does not re-hit NMI; external HTTP, so parallel is fine here.
  const cardByVault = new Map<string, string>();
  if (isAdmin) {
    const vaultIds = [...new Set(
      links.filter((l: any) => l.nmi_customer_vault_id).map((l: any) => l.nmi_customer_vault_id as string),
    )];
    await Promise.all(vaultIds.map(async (vid) => {
      const c = await getVaultCardCached(vid);
      if (c) cardByVault.set(vid, `${c.brand} •••• ${c.last4}${c.exp ? ` · exp ${c.exp}` : ""}`);
    }));
  }

  const recent = (
    <Card>
      <div className="overflow-x-auto">
        <table>
          <thead><tr><th>Created</th><th>Customer</th><th>Product</th><th>Plan</th><th>Processor</th><th className="text-right">Amount</th><th>Status</th>{isAdmin && <th className="text-right">Charge now</th>}</tr></thead>
          <tbody>
            {links.map((l: any) => (
              <RecentLinkRow key={l.id} token={l.token}>
                <td data-row-noclick>
                  <a href={`/pay/${l.token}`} target="_blank" rel="noopener noreferrer"
                     className="underline-offset-2 hover:underline">{dateTime(l.created_at)}</a>
                </td>
                <td>{l.customer_name ?? l.customer_email ?? "—"}</td>
                <td>{l.description ?? "—"}</td>
                <td>{l.installments && l.installments > 1
                  ? <span className="text-[12px]" style={{ color: "var(--muted)" }}>{l.installments}x {label(l.frequency)}</span>
                  : <span style={{ color: "var(--muted)" }}>One-time</span>}</td>
                <td><Badge tone="neutral">{label(l.processor)}</Badge></td>
                <td className="text-right">{money(l.amount_minor)}</td>
                <td><Badge tone={STATUS_TONE[l.status] ?? "neutral"}>{label(l.status)}</Badge></td>
                {isAdmin && (
                  <td className="text-right" data-row-noclick>
                    {l.nmi_customer_vault_id ? (
                      <div className="flex flex-col items-end gap-1">
                        {cardByVault.get(l.nmi_customer_vault_id) && (
                          <span className="text-[11px]" style={{ color: "var(--muted)" }}>{cardByVault.get(l.nmi_customer_vault_id)}</span>
                        )}
                        <ChargeNow linkId={l.id} defaultAmountMinor={l.amount_minor} customerLabel={l.customer_name ?? l.customer_email ?? "this client"} />
                      </div>
                    ) : (
                      <span className="text-[11px]" style={{ color: "var(--muted)" }}>No card on file</span>
                    )}
                  </td>
                )}
              </RecentLinkRow>
            ))}
            {links.length === 0 && <tr><td colSpan={isAdmin ? 8 : 7} style={{ color: "var(--muted)" }}>No links generated yet</td></tr>}
          </tbody>
        </table>
      </div>
    </Card>
  );

  return (
    <div>
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Payment Links</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Pick a product and a contact, choose one-time or a payment plan, and send an invoice with a hosted pay link.
          </p>
        </div>
        {isAdmin && <StripeToggle enabled={stripeEnabled} />}
      </div>

      <PaymentsTabs
        recentCount={links.length}
        newLink={<Card><LinkGenerator contacts={contacts} products={products} canPickStripe={canPickStripe} /></Card>}
        recent={recent}
      />
    </div>
  );
}
