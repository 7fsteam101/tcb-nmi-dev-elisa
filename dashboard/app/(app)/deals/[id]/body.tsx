import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccess } from "@/lib/access";
import { sql } from "@/lib/db";
import { reportTimezone } from "@/lib/settings";
import { money, dateTime, shortDate } from "@/lib/format";
import { EntityShell } from "@/components/entity-shell";
import { Card, SectionTitle, Badge, STATUS_TONE, label } from "@/components/ui";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Extra status tones beyond the shared STATUS_TONE map, for deal / plan / payment
// vocab that only appears on these entity pages.
const EXTRA_TONE: Record<string, "good" | "warn" | "bad" | "neutral" | "accent"> = {
  active: "good", refunded: "bad", churned: "warn", superseded: "neutral",
  won_pif: "good", won_pp: "good", deposit: "good",
};
const tone = (s: string | null | undefined) =>
  STATUS_TONE[s ?? ""] ?? EXTRA_TONE[s ?? ""] ?? "neutral";

function None({ children = "None" }: { children?: string }) {
  return <p className="py-2 text-sm" style={{ color: "var(--muted)" }}>{children}</p>;
}

function Detail({ label: l, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-32 shrink-0 text-xs" style={{ color: "var(--muted)" }}>{l}</span>
      <span className="min-w-0 truncate text-sm" style={{ color: "var(--text)" }}>{value || "—"}</span>
    </div>
  );
}

// Deal detail: the sold agreement, its payment-plan versions, receivable schedule,
// collected payments, the contract, and fulfilment. Every related record links to
// its own detail page.
export async function DealBody({ id }: { id: string }) {
  await requireAccess("receivables");
  if (!UUID.test(id)) notFound();
  const tz = await reportTimezone();

  const [deal] = await sql`
    select d.id, d.opportunity_id, d.contact_id, d.closer_rep_id, d.total_contract_value_minor,
           d.plan_type_snapshot, d.discount_pct, d.is_couple, d.partner_contact_id,
           d.deal_close_date, d.status,
           ct.full_name as contact_name, pc.full_name as partner_name, rep.full_name as closer
    from sales.deal d
    left join core.contact ct on ct.id = d.contact_id
    left join core.contact pc on pc.id = d.partner_contact_id
    left join sales.rep rep on rep.id = d.closer_rep_id
    where d.id = ${id}`;
  if (!deal) notFound();

  // pooler-safe: one batch of <= 4 concurrent reads.
  const [plans, receivables, payments, agreements] = await Promise.all([
    sql`select pp.id, pp.version, pp.plan_type, pp.total_minor, pp.cadence, pp.is_current, pp.start_date
        from finance.payment_plan pp where pp.deal_id = ${id} order by pp.version`,
    sql`select r.id, r.installment_no, r.due_date, r.amount_minor, r.status, r.paid_at
        from finance.receivable r where r.deal_id = ${id} order by r.installment_no`,
    sql`select p.id, p.type, p.amount_minor, p.processor, p.occurred_at
        from finance.successful_payment p where p.deal_id = ${id} order by p.occurred_at`,
    sql`select a.id, a.title, a.status, a.amount_minor, a.sent_at, a.signed_at, a.document_url
        from sales.agreement a where a.deal_id = ${id}
        order by coalesce(a.signed_at, a.sent_at, a.created_at) desc`,
  ]);
  // second batch: single read, kept separate to respect the <= 4 concurrency rule.
  const [fulfilment] = await sql`
    select f.id, f.status, f.program_start, f.program_end, f.onboarding_complete, f.onboarded_at
    from delivery.fulfilment f where f.deal_id = ${id} order by f.created_at limit 1`;

  const paidMinor = payments.reduce((s: number, p: any) => s + Number(p.amount_minor), 0);
  const scheduledMinor = receivables
    .filter((r: any) => r.status !== "paid")
    .reduce((s: number, r: any) => s + Number(r.amount_minor), 0);

  return (
    <EntityShell
      kicker="Deal"
      title={money(deal.total_contract_value_minor)}
      subtitle={<>Closed {shortDate(deal.deal_close_date, tz)}{deal.closer ? ` by ${deal.closer}` : ""}</>}
      badges={
        <>
          <Badge tone="accent">{label(deal.plan_type_snapshot)}</Badge>
          <Badge tone={tone(deal.status)}>{label(deal.status)}</Badge>
          {deal.is_couple && <Badge tone="neutral">Couple</Badge>}
        </>
      }
    >
      <SectionTitle>Overview</SectionTitle>
      <Card>
        <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
          <Detail label="Contract value" value={money(deal.total_contract_value_minor)} />
          <Detail label="Plan as sold" value={label(deal.plan_type_snapshot)} />
          <Detail label="Status" value={label(deal.status)} />
          <Detail label="Closed" value={dateTime(deal.deal_close_date, tz)} />
          <Detail
            label="Contact"
            value={
              deal.contact_id ? (
                <Link href={`/contacts/${deal.contact_id}`} style={{ color: "var(--accent)" }}>
                  {deal.contact_name ?? "View contact"}
                </Link>
              ) : null
            }
          />
          <Detail
            label="Opportunity"
            value={
              deal.opportunity_id ? (
                <Link href={`/opportunities/${deal.opportunity_id}`} style={{ color: "var(--accent)" }}>
                  View opportunity
                </Link>
              ) : null
            }
          />
          <Detail label="Closer" value={deal.closer} />
          <Detail
            label="Couple partner"
            value={
              deal.is_couple
                ? deal.partner_contact_id
                  ? (
                    <Link href={`/contacts/${deal.partner_contact_id}`} style={{ color: "var(--accent)" }}>
                      {deal.partner_name ?? "View partner"}
                    </Link>
                  )
                  : "Yes"
                : "No"
            }
          />
        </div>
      </Card>

      <SectionTitle right={<span className="text-[11px]" style={{ color: "var(--muted)" }}>{money(paidMinor)} collected · {money(scheduledMinor)} scheduled</span>}>
        Payment plans
      </SectionTitle>
      {plans.length === 0 ? <None>No payment plans</None> : (
        <div className="space-y-2">
          {plans.map((p: any) => (
            <Card key={p.id} href={`/plans/${p.id}`}>
              <div className="flex flex-wrap items-center gap-2 text-sm">
                <span className="font-medium">Version {p.version}</span>
                <Badge tone={p.is_current ? "good" : "neutral"}>{p.is_current ? "Current" : "Superseded"}</Badge>
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  {label(p.plan_type)}{p.total_minor != null ? ` · ${money(p.total_minor)}` : ""}{p.cadence ? ` · ${label(p.cadence)}` : ""}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <SectionTitle>Receivables</SectionTitle>
      {receivables.length === 0 ? <None>No receivables</None> : (
        <Card>
          <div className="overflow-x-auto">
            <table>
              <thead><tr><th>#</th><th>Due</th><th className="text-right">Amount</th><th>Status</th><th className="text-right">Open</th></tr></thead>
              <tbody>
                {receivables.map((r: any) => (
                  <tr key={r.id}>
                    <td>#{r.installment_no}</td>
                    <td>{shortDate(r.due_date, tz)}</td>
                    <td className="text-right">{money(r.amount_minor)}</td>
                    <td><Badge tone={tone(r.status)}>{label(r.status)}</Badge></td>
                    <td className="text-right">
                      <Link href={`/receivables/${r.id}`} style={{ color: "var(--accent)" }}>View</Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <SectionTitle>Payments</SectionTitle>
      {payments.length === 0 ? <None>No payments</None> : (
        <Card>
          <div className="overflow-x-auto">
            <table>
              <thead><tr><th>Paid</th><th>Type</th><th className="text-right">Amount</th><th>Processor</th></tr></thead>
              <tbody>
                {payments.map((p: any) => (
                  <tr key={p.id}>
                    <td>{dateTime(p.occurred_at, tz)}</td>
                    <td style={{ color: "var(--muted)" }}>{label(p.type)}</td>
                    <td className="text-right">{money(p.amount_minor)}</td>
                    <td style={{ color: "var(--muted)" }}>{label(p.processor)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      <SectionTitle>Contract</SectionTitle>
      {agreements.length === 0 ? <None>No contract</None> : (
        <div className="space-y-2">
          {agreements.map((a: any) => (
            <Card key={a.id} href={`/agreements/${a.id}`}>
              <div className="flex flex-wrap items-center gap-3 text-sm">
                <span className="font-medium">{a.title ?? "Agreement"}</span>
                <Badge tone={tone(a.status)}>{label(a.status)}</Badge>
                <span className="text-xs" style={{ color: "var(--muted)" }}>
                  {a.amount_minor != null ? money(a.amount_minor) : "—"}
                  {a.signed_at ? ` · Signed ${shortDate(a.signed_at, tz)}` : a.sent_at ? ` · Sent ${shortDate(a.sent_at, tz)}` : ""}
                </span>
              </div>
            </Card>
          ))}
        </div>
      )}

      <SectionTitle>Fulfilment</SectionTitle>
      {!fulfilment ? <None>No fulfilment record</None> : (
        <Card>
          <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
            <Detail label="Status" value={<Badge tone={tone(fulfilment.status)}>{label(fulfilment.status)}</Badge>} />
            <Detail label="Onboarding" value={fulfilment.onboarding_complete ? "Complete" : "In progress"} />
            <Detail label="Onboarded" value={fulfilment.onboarded_at ? shortDate(fulfilment.onboarded_at, tz) : "—"} />
            <Detail label="Program start" value={fulfilment.program_start ? shortDate(fulfilment.program_start, tz) : "—"} />
            <Detail label="Program end" value={fulfilment.program_end ? shortDate(fulfilment.program_end, tz) : "—"} />
          </div>
        </Card>
      )}
    </EntityShell>
  );
}
