import Link from "next/link";
import { receivablesSummary, receivablesList, projectedCashByMonth } from "@/lib/kpi";
import { onboardingAndCollection } from "@/lib/kpi-quality";
import { isDemoMode } from "@/lib/settings";
import { money, pct, shortDate } from "@/lib/format";
import { Card, Stat, SectionTitle, Badge, STATUS_TONE, label, InfoTip } from "@/components/ui";
import { ProgressRing } from "@/components/charts";
import { PresetBar } from "@/components/preset-bar";
import { requireAccess } from "@/lib/access";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function Receivables({ searchParams }: { searchParams: Promise<{ days?: string }> }) {
  await requireAccess("receivables");
  const demo = await isDemoMode();
  const { days: daysRaw } = await searchParams;
  const days = Math.min(Math.max(parseInt(daysRaw ?? "30", 10) || 30, 1), 365);
  const [summary, list, byMonth, quality] = await Promise.all([
    receivablesSummary(demo),
    receivablesList(demo),
    projectedCashByMonth(demo),
    onboardingAndCollection(demo),
  ]);

  const onboardingRate = quality.onboardingTotal > 0 ? quality.onboardingComplete / quality.onboardingTotal : null;
  const collectionRate = quality.contractedMinor > 0 ? quality.collectedMinor / quality.contractedMinor : null;

  return (
    <div>
      <h1 className="text-xl font-semibold">Receivables</h1>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Current payment-plan versions only. Delinquent = 14+ days past due.
        </p>
        <PresetBar />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Scheduled (open pipeline)" value={money(summary.scheduled_minor)} href={`/explore/receivables?arg=scheduled&days=${days}`}
          help="Future installments on active plans — money on the books not yet due or collected." />
        <Stat label="Due in the next 30 days" value={money(summary.next_30d_minor)} tone="good" href={`/explore/receivables?arg=next30&days=${days}`}
          help="Projected cash: scheduled installments with a due date inside 30 days." />
        <Stat label="Late" value={money(summary.late_minor)} tone="warn" href={`/explore/receivables?arg=late&days=${days}`}
          help="Past due, under 14 days." />
        <Stat label="Delinquent" value={money(summary.delinquent_minor)} tone="bad" href={`/explore/receivables?arg=delinquent&days=${days}`}
          help="14+ days past due." />
      </div>

      <SectionTitle>Delivery and collections</SectionTitle>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <Card>
          <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--muted)" }}>
            Onboarding Completion Rate
            <InfoTip text="Won deals with onboarding finished, over all won deals needing onboarding (delivery.fulfilment records)." />
          </div>
          {onboardingRate != null ? (
            <div className="mt-2 flex items-center gap-4">
              <ProgressRing value={onboardingRate} label={`${quality.onboardingComplete} of ${quality.onboardingTotal} onboarded`} />
              <div>
                <div className="text-2xl font-semibold tracking-tight">{pct(onboardingRate)}</div>
                <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                  {quality.onboardingTotal - quality.onboardingComplete} still onboarding
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-2 text-sm" style={{ color: "var(--muted)" }}>No won deals needing onboarding yet</div>
          )}
        </Card>
        <Card>
          <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--muted)" }}>
            Collection Rate
            <InfoTip text="Cash collected (paid receivables) over the total contracted receivable amount on current payment-plan versions." />
          </div>
          {collectionRate != null ? (
            <div className="mt-2 flex items-center gap-4">
              <ProgressRing value={collectionRate} label={`${money(quality.collectedMinor)} of ${money(quality.contractedMinor)}`} />
              <div>
                <div className="text-2xl font-semibold tracking-tight">{pct(collectionRate)}</div>
                <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>
                  {money(quality.contractedMinor - quality.collectedMinor)} outstanding
                </div>
              </div>
            </div>
          ) : (
            <div className="mt-2 text-sm" style={{ color: "var(--muted)" }}>No contracted receivables yet</div>
          )}
        </Card>
      </div>

      <SectionTitle>Projected cash by month</SectionTitle>
      <Card>
        <table>
          <thead>
            <tr><th>Month</th><th className="text-right">Scheduled</th></tr>
          </thead>
          <tbody>
            {byMonth.map((m: any) => (
              <tr key={String(m.month)}>
                <td>{new Date(m.month).toLocaleDateString("en-US", { month: "long", year: "numeric" })}</td>
                <td className="text-right">{money(m.amount_minor)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>

      <SectionTitle>Open installments</SectionTitle>
      <Card>
        <table>
          <thead>
            <tr><th>Due</th><th>Client</th><th>Plan</th><th>Installment</th><th className="text-right">Amount</th><th>Status</th></tr>
          </thead>
          <tbody>
            {list.map((r: any) => (
              <tr key={r.id}>
                <td>{shortDate(r.due_date)}</td>
                <td>
                  {r.contact_id ? (
                    <Link href={`/contacts/${r.contact_id}`} style={{ color: "var(--accent)" }}>
                      {r.contact_name}
                    </Link>
                  ) : (
                    r.contact_name
                  )}
                </td>
                <td className="uppercase">{label(r.plan_type)}</td>
                <td>#{r.installment_no}</td>
                <td className="text-right">{money(r.amount_minor)}</td>
                <td><Badge tone={STATUS_TONE[r.status] ?? "neutral"}>{label(r.status)}</Badge></td>
              </tr>
            ))}
            {list.length === 0 && <tr><td colSpan={6} style={{ color: "var(--muted)" }}>No open installments</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
