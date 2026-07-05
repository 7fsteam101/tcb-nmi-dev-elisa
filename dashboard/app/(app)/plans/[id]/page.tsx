import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccess } from "@/lib/access";
import { sql } from "@/lib/db";
import { reportTimezone } from "@/lib/settings";
import { money, shortDate } from "@/lib/format";
import { EntityShell } from "@/components/entity-shell";
import { Card, SectionTitle, Badge, STATUS_TONE, label } from "@/components/ui";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const EXTRA_TONE: Record<string, "good" | "warn" | "bad" | "neutral" | "accent"> = {
  superseded: "neutral", active: "good", refunded: "bad", churned: "warn",
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

// Payment-plan detail: one versioned plan for a deal, with its receivable schedule.
// The deal and each receivable link to their own detail pages.
export default async function PlanDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAccess("receivables");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const tz = await reportTimezone();

  const [plan] = await sql`
    select pp.id, pp.deal_id, pp.version, pp.plan_type, pp.total_minor, pp.cadence,
           pp.is_current, pp.start_date
    from finance.payment_plan pp where pp.id = ${id}`;
  if (!plan) notFound();

  const receivables = await sql`
    select r.id, r.installment_no, r.due_date, r.amount_minor, r.status
    from finance.receivable r where r.payment_plan_id = ${id} order by r.installment_no`;

  const paidMinor = receivables
    .filter((r: any) => r.status === "paid")
    .reduce((s: number, r: any) => s + Number(r.amount_minor), 0);

  return (
    <EntityShell
      kicker="Payment plan"
      title={<>Version {plan.version}</>}
      subtitle={<>{label(plan.plan_type)}{plan.total_minor != null ? ` · ${money(plan.total_minor)}` : ""}</>}
      badges={
        <>
          <Badge tone={plan.is_current ? "good" : "neutral"}>{plan.is_current ? "Current" : "Superseded"}</Badge>
          {plan.cadence && <Badge tone="accent">{label(plan.cadence)}</Badge>}
        </>
      }
    >
      <SectionTitle>Overview</SectionTitle>
      <Card>
        <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
          <Detail label="Version" value={String(plan.version)} />
          <Detail label="Plan type" value={label(plan.plan_type)} />
          <Detail label="Total" value={plan.total_minor != null ? money(plan.total_minor) : "—"} />
          <Detail label="Cadence" value={label(plan.cadence)} />
          <Detail label="Current" value={plan.is_current ? "Yes" : "No"} />
          <Detail label="Start date" value={plan.start_date ? shortDate(plan.start_date, tz) : "—"} />
          <Detail
            label="Deal"
            value={
              plan.deal_id ? (
                <Link href={`/deals/${plan.deal_id}`} style={{ color: "var(--accent)" }}>
                  View deal
                </Link>
              ) : null
            }
          />
        </div>
      </Card>

      <SectionTitle right={<span className="text-[11px]" style={{ color: "var(--muted)" }}>{money(paidMinor)} paid</span>}>
        Receivables
      </SectionTitle>
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
    </EntityShell>
  );
}
