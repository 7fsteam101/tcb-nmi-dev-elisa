import { requireAccess } from "@/lib/access";
import { listPaymentLinks } from "@/lib/nmi-links";
import { money, dateTime } from "@/lib/format";
import { Card, SectionTitle, Badge, STATUS_TONE, label } from "@/components/ui";
import { LinkGenerator } from "./generator";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function Payments() {
  await requireAccess("receivables");
  const links = await listPaymentLinks();

  return (
    <div>
      <h1 className="text-xl font-semibold">Payment Links</h1>
      <p className="mb-6 text-sm" style={{ color: "var(--muted)" }}>
        Generate an NMI invoice with a hosted pay link. NMI emails the link to the customer; it flips to Paid here when it settles.
      </p>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        <div>
          <SectionTitle>New payment link</SectionTitle>
          <Card><LinkGenerator /></Card>
        </div>
        <div>
          <SectionTitle>Recent links</SectionTitle>
          <Card>
            <table>
              <thead><tr><th>Created</th><th>Customer</th><th className="text-right">Amount</th><th>Status</th></tr></thead>
              <tbody>
                {links.map((l: any) => (
                  <tr key={l.id}>
                    <td>{dateTime(l.created_at)}</td>
                    <td>{l.customer_name ?? l.customer_email ?? "—"}<div className="text-[11px]" style={{ color: "var(--muted)" }}>{l.description}</div></td>
                    <td className="text-right">{money(l.amount_minor)}</td>
                    <td><Badge tone={STATUS_TONE[l.status] ?? "neutral"}>{label(l.status)}</Badge></td>
                  </tr>
                ))}
                {links.length === 0 && <tr><td colSpan={4} style={{ color: "var(--muted)" }}>No links generated yet</td></tr>}
              </tbody>
            </table>
          </Card>
        </div>
      </div>
    </div>
  );
}
