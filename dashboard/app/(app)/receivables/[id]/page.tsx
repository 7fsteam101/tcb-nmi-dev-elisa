import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccess } from "@/lib/access";
import { sql } from "@/lib/db";
import { reportTimezone } from "@/lib/settings";
import { money, dateTime, shortDate } from "@/lib/format";
import { EntityShell } from "@/components/entity-shell";
import { Card, SectionTitle, Badge, STATUS_TONE, label } from "@/components/ui";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const tone = (s: string | null | undefined) => STATUS_TONE[s ?? ""] ?? "neutral";

function Detail({ label: l, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-36 shrink-0 text-xs" style={{ color: "var(--muted)" }}>{l}</span>
      <span className="min-w-0 truncate text-sm" style={{ color: "var(--text)" }}>{value || "—"}</span>
    </div>
  );
}

// Receivable (one scheduled installment) detail: amount, due date, status, and
// links to its payment plan, deal, the contact (via the deal), and the matched
// payment when it has been collected.
export default async function ReceivableDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAccess("receivables");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const tz = await reportTimezone();

  const [r] = await sql`
    select r.id, r.payment_plan_id, r.deal_id, r.payment_id, r.installment_no,
           r.due_date, r.amount_minor, r.status, r.paid_at,
           d.contact_id, ct.full_name as contact_name
    from finance.receivable r
    left join sales.deal d on d.id = r.deal_id
    left join core.contact ct on ct.id = d.contact_id
    where r.id = ${id}`;
  if (!r) notFound();

  // Matched payment, when this installment has been collected. Single read.
  const payment = r.payment_id
    ? (await sql`
        select p.id, p.type, p.amount_minor, p.processor, p.occurred_at
        from finance.successful_payment p where p.id = ${r.payment_id}`)[0]
    : null;

  return (
    <EntityShell
      kicker="Receivable"
      title={money(r.amount_minor)}
      subtitle={<>Installment #{r.installment_no} · Due {shortDate(r.due_date, tz)}</>}
      badges={<Badge tone={tone(r.status)}>{label(r.status)}</Badge>}
    >
      <SectionTitle>Overview</SectionTitle>
      <Card>
        <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
          <Detail label="Installment" value={`#${r.installment_no}`} />
          <Detail label="Amount" value={money(r.amount_minor)} />
          <Detail label="Due date" value={shortDate(r.due_date, tz)} />
          <Detail label="Status" value={label(r.status)} />
          <Detail label="Paid" value={r.paid_at ? shortDate(r.paid_at, tz) : "—"} />
          <Detail
            label="Contact"
            value={
              r.contact_id ? (
                <Link href={`/contacts/${r.contact_id}`} style={{ color: "var(--accent)" }}>
                  {r.contact_name ?? "View contact"}
                </Link>
              ) : null
            }
          />
          <Detail
            label="Payment plan"
            value={
              r.payment_plan_id ? (
                <Link href={`/plans/${r.payment_plan_id}`} style={{ color: "var(--accent)" }}>
                  View payment plan
                </Link>
              ) : null
            }
          />
          <Detail
            label="Deal"
            value={
              r.deal_id ? (
                <Link href={`/deals/${r.deal_id}`} style={{ color: "var(--accent)" }}>
                  View deal
                </Link>
              ) : null
            }
          />
        </div>
      </Card>

      <SectionTitle>Matched payment</SectionTitle>
      {!payment ? (
        <p className="py-2 text-sm" style={{ color: "var(--muted)" }}>Not collected yet</p>
      ) : (
        <Card>
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <span className="font-medium">{money(payment.amount_minor)}</span>
            <Badge tone="good">{label(payment.type)}</Badge>
            <span className="text-xs" style={{ color: "var(--muted)" }}>
              {label(payment.processor)} · {dateTime(payment.occurred_at, tz)}
            </span>
          </div>
        </Card>
      )}
    </EntityShell>
  );
}
