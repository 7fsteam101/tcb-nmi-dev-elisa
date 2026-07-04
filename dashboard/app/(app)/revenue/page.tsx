import {
  overviewComparison, dailyCloserSeries, revenueByMonth, planSplit,
  installmentStack, commissionOwed, pipelineValue, projected30d,
} from "@/lib/kpi-closer";
import { isDemoMode, reportTimezone } from "@/lib/settings";
import { money, num, pct } from "@/lib/format";
import { Card, SectionTitle, Badge, InfoTip } from "@/components/ui";
import { StatSpark } from "@/components/stat-spark";
import { DateRangeBar } from "@/components/date-range";
import { resolveRange } from "@/lib/range";
import { requireAccess } from "@/lib/access";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const ratio = (a: number, b: number) => (b > 0 ? a / b : 0);
// StatSpark's chip expects percentage points (12.5 = +12.5%), not a fraction.
const delta = (cur: number, prev: number) => (prev > 0 ? ((cur - prev) / prev) * 100 : null);
const monthLabel = (m: string | Date) =>
  new Date(m).toLocaleDateString("en-US", { month: "short", year: "numeric", timeZone: "UTC" });

function EmptyNote({ children }: { children: string }) {
  return <div className="py-2 text-sm" style={{ color: "var(--muted)" }}>{children}</div>;
}

export default async function Revenue({ searchParams }: { searchParams: Promise<{ days?: string; from?: string; to?: string }> }) {
  await requireAccess("receivables");
  const demo = await isDemoMode();
  const tz = await reportTimezone();
  const days = resolveRange(await searchParams).days;
  const [cmp, daily, byMonth, split, stack, commissions, pipeline, projected] = await Promise.all([
    overviewComparison({ demo, days }),
    dailyCloserSeries({ demo, days, tz }),
    revenueByMonth(demo, 12, tz),
    planSplit({ demo, days }),
    installmentStack(demo),
    commissionOwed({ demo, days }),
    pipelineValue(demo),
    projected30d(demo),
  ]);

  const cur = cmp.current;
  const prev = cmp.previous;
  const refundRate = ratio(cur.refundsMinor, cur.cashMinor);
  const sInvoiced = daily.map((d: any) => Number(d.invoiced_minor));
  const sCash = daily.map((d: any) => Number(d.cash_minor));
  const sRefunds = daily.map((d: any) => Number(d.refunds_minor));
  const sStack = stack.map((m: any) => Number(m.amount_minor));

  const withPlan = split.pif + split.multi; // deals that have a plan snapshot recorded
  const pifPct = ratio(split.pif, withPlan);
  const monthsEmpty = byMonth.every(
    (m: any) => Number(m.invoiced_minor) === 0 && Number(m.cash_minor) === 0 && Number(m.refunds_minor) === 0,
  );
  const stackEmpty = stack.every((m: any) => Number(m.amount_minor) === 0);
  const commissionsEmpty =
    commissions.length === 0 ||
    commissions.every((c: any) => Number(c.cash_minor) === 0 && Number(c.refunded_cash_minor) === 0);

  return (
    <div>
      <h1 className="text-xl font-semibold">Revenue & Commission</h1>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Last {days} days vs the {days} days before. Invoiced = contracts signed; cash = money that actually moved.
        </p>
        <DateRangeBar />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-5">
        <StatSpark label="Invoiced this period" value={money(cur.invoicedMinor)} series={sInvoiced}
          deltaPct={delta(cur.invoicedMinor, prev.invoicedMinor)} href={`/explore/deals?days=${days}`}
          help="Total contract value of deals closed in range, refunded deals excluded. Invoiced is a promise — cash collected is the money." />
        <StatSpark label="Cash collected" value={money(cur.cashMinor)} series={sCash} tone="good"
          deltaPct={delta(cur.cashMinor, prev.cashMinor)} href={`/explore/cash?days=${days}`}
          help="Gross program payments (NMI), excluding the $25 booking fees, before reversals." />
        <StatSpark label="Refunds" value={`${money(cur.refundsMinor)} (${pct(refundRate)})`} series={sRefunds}
          tone={cur.refundsMinor > 0 ? "warn" : undefined}
          deltaPct={delta(cur.refundsMinor, prev.refundsMinor)} href={`/explore/reversals?days=${days}`}
          help="Refunds and chargebacks in range, and what share of cash collected they claw back." />
        <StatSpark label="Pipeline value" value={money(pipeline)} series={sStack} deltaPct={null}
          href={`/explore/receivables?arg=open&days=${days}`}
          help="Contracted money not yet collected: scheduled + late + delinquent installments on current plan versions of active deals. Point-in-time — no period delta." />
        <StatSpark label="Projected 30d cash" value={money(projected)} series={sStack} deltaPct={null}
          href={`/explore/receivables?arg=next30&days=${days}`}
          help="Scheduled installments due within the next 30 days on current plan versions. Point-in-time — no period delta." />
      </div>

      <SectionTitle>Invoiced vs cash by month</SectionTitle>
      <Card>
        {monthsEmpty ? (
          <EmptyNote>Nothing invoiced or collected in the last 12 months yet — this table fills in once deal and NMI payment data lands.</EmptyNote>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th className="text-right">Invoiced <InfoTip text="Total contract value of deals by close month (refunded deals excluded)" /></th>
                <th className="text-right">Cash collected <InfoTip text="Program payments received that month, excluding $25 booking fees" /></th>
                <th className="text-right">Refunds <InfoTip text="Refunds and chargebacks that month" /></th>
              </tr>
            </thead>
            <tbody>
              {byMonth.map((m: any) => (
                <tr key={String(m.month)}>
                  <td>{monthLabel(m.month)}</td>
                  <td className="text-right">{money(m.invoiced_minor)}</td>
                  <td className="text-right">{money(m.cash_minor)}</td>
                  <td className="text-right" style={Number(m.refunds_minor) > 0 ? { color: "var(--warn)" } : undefined}>
                    {money(m.refunds_minor)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>

      <div className="grid grid-cols-1 gap-3 lg:grid-cols-2">
        <div>
          <SectionTitle>PIF vs payment plan</SectionTitle>
          <Card>
            {split.total === 0 ? (
              <EmptyNote>No deals closed in range yet.</EmptyNote>
            ) : withPlan === 0 ? (
              <EmptyNote>{`${split.total} deals closed in range, but none has a plan type recorded yet — the split appears as payment-plan data syncs.`}</EmptyNote>
            ) : (
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--muted)" }}>
                    Paid in full
                    <InfoTip text="Deals won in range with a PIF plan snapshot (refunded deals excluded)" />
                  </div>
                  <div className="mt-1 text-3xl font-semibold tracking-tight" style={{ color: "var(--good)" }}>{num(split.pif)}</div>
                  <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>{pct(pifPct)} of {withPlan < split.total ? "plan-recorded deals" : "deals won"}</div>
                </div>
                <div>
                  <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--muted)" }}>
                    Payment plans
                    <InfoTip text="Deals won on any multi-pay plan: 3/6/7/12/13-pay or zero-down" />
                  </div>
                  <div className="mt-1 text-3xl font-semibold tracking-tight">{num(split.multi)}</div>
                  <div className="mt-0.5 text-xs" style={{ color: "var(--muted)" }}>{pct(1 - pifPct)} of {withPlan < split.total ? "plan-recorded deals" : "deals won"}</div>
                </div>
                {withPlan < split.total && (
                  <div className="col-span-2 text-[11px]" style={{ color: "var(--muted)" }}>
                    {num(split.total - withPlan)} of {num(split.total)} deals in range have no plan type recorded yet and are excluded from the split.
                  </div>
                )}
              </div>
            )}
          </Card>
        </div>

        <div>
          <SectionTitle>Installment stack (12 months forward)</SectionTitle>
          <Card>
            {stackEmpty ? (
              <EmptyNote>No scheduled installments yet — the stack builds as NMI payment plans sync.</EmptyNote>
            ) : (
              <table>
                <thead>
                  <tr>
                    <th>Month</th>
                    <th className="text-right">Installments</th>
                    <th className="text-right">Scheduled <InfoTip text="Scheduled installments on current plan versions, by due month" /></th>
                  </tr>
                </thead>
                <tbody>
                  {stack.map((m: any) => (
                    <tr key={String(m.month)}>
                      <td>{monthLabel(m.month)}</td>
                      <td className="text-right">{num(m.installments)}</td>
                      <td className="text-right">{money(m.amount_minor)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </Card>
        </div>
      </div>

      <SectionTitle>
        Commission owed (estimate)
      </SectionTitle>
      <Card>
        {commissionsEmpty ? (
          <EmptyNote>No cash collected in range yet — commission estimates appear once NMI payments land.</EmptyNote>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Closer</th>
                <th className="text-right">Cash collected</th>
                <th>Tier <InfoTip text="10% base; 15% while the trailing 2-week close rate (closed / taken) holds 33.3%+" /></th>
                <th className="text-right">14d close rate</th>
                <th className="text-right">Refund clawback <InfoTip text="10% of cash collected in range on deals that are now refunded" /></th>
                <th className="text-right">Est. owed <InfoTip text="Cash x tier rate minus the refund clawback. Estimate only — payroll runs off validated commission reports." /></th>
              </tr>
            </thead>
            <tbody>
              {commissions.map((c: any) => (
                <tr key={c.id}>
                  <td>{c.full_name}</td>
                  <td className="text-right">{money(c.cash_minor)}</td>
                  <td><Badge tone={Number(c.commission_rate) >= 0.15 ? "good" : "neutral"}>{pct(c.commission_rate, 0)}</Badge></td>
                  <td className="text-right">{pct(c.close_rate_14d)}</td>
                  <td className="text-right" style={Number(c.refunded_cash_minor) > 0 ? { color: "var(--warn)" } : undefined}>
                    {Number(c.refunded_cash_minor) > 0 ? `-${money(Number(c.refunded_cash_minor) * 0.1)}` : money(0)}
                  </td>
                  <td className="text-right">{money(c.owed_minor)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Card>
    </div>
  );
}
