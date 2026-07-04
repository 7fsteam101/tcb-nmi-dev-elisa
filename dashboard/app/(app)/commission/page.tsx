import { isDemoMode } from "@/lib/settings";
import { money, pct } from "@/lib/format";
import { Card, SectionTitle, InfoTip, Badge } from "@/components/ui";
import { ProgressRing } from "@/components/charts";
import { DateRangeBar } from "@/components/date-range";
import { resolveRange } from "@/lib/range";
import { requireAccess } from "@/lib/access";
import { commissionForReps } from "@/lib/commission";
import { goalProgress } from "@/lib/goals";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function Commission({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; from?: string; to?: string }>;
}) {
  await requireAccess("reps");
  const demo = await isDemoMode();
  const days = resolveRange(await searchParams).days;

  // Both helpers fan out their own queries, so each is awaited on its own,
  // never inside a Promise.all together, to stay under the free-tier pooler cap.
  const commission = await commissionForReps(demo, days);
  const repGoals = await goalProgress(demo, "rep");

  // A closer's monthly cash-collected goal, keyed by rep id, for the ring column.
  const cashGoalByRep = new Map(
    repGoals
      .filter((g) => g.metric === "cash_collected" && g.rep_id)
      .map((g) => [g.rep_id as string, g]),
  );

  const totalOwed = commission.reduce((s, r) => s + Number(r.owed_minor), 0);
  const totalCash = commission.reduce((s, r) => s + Number(r.cash_minor), 0);

  return (
    <div>
      <h1 className="text-xl font-semibold">Commissions</h1>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm" style={{ color: "var(--muted)" }}>
          Rule-driven commission per closer over the selected window. 10% base rate, 15% while the trailing 2-week close rate holds 33.3%+.
        </p>
        <DateRangeBar />
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Card>
          <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--muted)" }}>
            Cash collected
            <InfoTip text="Program cash (NMI) attributed to closers in the selected window, excluding the $25 booking fees." />
          </div>
          <div className="mt-1 text-2xl font-semibold tracking-tight" style={{ color: "var(--good)" }}>
            {money(totalCash)}
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--muted)" }}>
            Est. commission owed
            <InfoTip text="Sum of the per-closer estimates below. Estimate only; payroll runs off validated commission reports." />
          </div>
          <div className="mt-1 text-2xl font-semibold tracking-tight" style={{ color: "var(--text)" }}>
            {money(totalOwed)}
          </div>
        </Card>
        <Card>
          <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--muted)" }}>
            Closers on tier
            <InfoTip text="Closers whose trailing 2-week close rate clears the tier threshold, so they earn the 15% rate right now." />
          </div>
          <div className="mt-1 text-2xl font-semibold tracking-tight" style={{ color: "var(--accent)" }}>
            {commission.filter((r) => r.tier_active).length}
          </div>
        </Card>
      </div>

      <SectionTitle>Commission by closer</SectionTitle>
      <Card>
        <div className="mb-3 flex items-center gap-1.5 text-xs" style={{ color: "var(--muted)" }}>
          Rule-driven estimate
          <InfoTip text="Computed from the commission rules enabled per member (base rate, tier bonus, refund clawback). Toggle a rule per member in Admin -> Commission. Estimate only; payroll runs off validated commission reports." />
        </div>
        <table>
          <thead>
            <tr>
              <th>Closer</th>
              <th className="text-right">Cash collected</th>
              <th className="text-right">Effective rate</th>
              <th className="text-right">Tier</th>
              <th className="text-right">Est. owed</th>
              <th>Rules on</th>
              <th className="text-right">Monthly cash goal</th>
            </tr>
          </thead>
          <tbody>
            {commission.map((r) => {
              const goal = cashGoalByRep.get(r.rep_id);
              const rulesOn = r.rules.filter((rule) => rule.enabled);
              return (
                <tr key={r.rep_id}>
                  <td className="font-medium">{r.full_name}</td>
                  <td className="text-right">{money(r.cash_minor)}</td>
                  <td className="text-right">{pct(r.effective_rate)}</td>
                  <td className="text-right">
                    {r.tier_active ? <Badge tone="good">Active</Badge> : <Badge>Base</Badge>}
                  </td>
                  <td className="text-right">{money(r.owed_minor)}</td>
                  <td>
                    <div className="flex flex-wrap gap-1">
                      {rulesOn.length > 0 ? (
                        rulesOn.map((rule) => (
                          <Badge key={rule.key} tone="accent">{rule.name}</Badge>
                        ))
                      ) : (
                        <span style={{ color: "var(--muted)" }}>None</span>
                      )}
                    </div>
                  </td>
                  <td className="text-right">
                    {goal ? (
                      <div className="flex justify-end">
                        <ProgressRing value={Math.min(1, goal.pct)} label={pct(goal.pct, 0)} size={62} />
                      </div>
                    ) : (
                      <span style={{ color: "var(--muted)" }}>{"—"}</span>
                    )}
                  </td>
                </tr>
              );
            })}
            {commission.length === 0 && (
              <tr><td colSpan={7} style={{ color: "var(--muted)" }}>No active closers</td></tr>
            )}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
