import { repPerformance } from "@/lib/kpi";
import { isDemoMode } from "@/lib/settings";
import { money, num, pct } from "@/lib/format";
import { Card, SectionTitle, Badge, InfoTip, label } from "@/components/ui";
import { requireAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

export default async function Reps() {
  await requireAccess("reps");
  const demo = await isDemoMode();
  const reps = await repPerformance({ demo, days: 30 });

  return (
    <div>
      <h1 className="text-xl font-semibold">Reps & Commission</h1>
      <p className="mb-6 text-sm" style={{ color: "var(--muted)" }}>
        Last 30 days. Tier rule: 10% base, 15% while the rolling 2-week close rate holds 33.3%+.
      </p>

      <SectionTitle>
        Performance
      </SectionTitle>
      <Card>
        <table>
          <thead>
            <tr>
              <th>Rep</th><th>Role</th>
              <th className="text-right">Taken</th>
              <th className="text-right">Closed</th>
              <th className="text-right">Close rate <InfoTip text="Deals won / calls taken, last 30 days" /></th>
              <th className="text-right">14d close rate <InfoTip text="Rolling 2-week close rate — this decides the commission tier" /></th>
              <th className="text-right">Cash collected</th>
              <th>Tier</th>
              <th className="text-right">Est. commission <InfoTip text="Cash collected x current tier rate. Indicative — payroll runs off validated commission reports." /></th>
            </tr>
          </thead>
          <tbody>
            {reps.map((r: any) => (
              <tr key={r.id}>
                <td>{r.full_name}</td>
                <td className="capitalize" style={{ color: "var(--muted)" }}>{label(r.role)}</td>
                <td className="text-right">{num(r.taken)}</td>
                <td className="text-right">{num(r.closed)}</td>
                <td className="text-right">{Number(r.taken) > 0 ? pct(Number(r.closed) / Number(r.taken)) : "—"}</td>
                <td className="text-right">{pct(r.close_rate_14d)}</td>
                <td className="text-right">{money(r.cash_minor)}</td>
                <td><Badge tone={Number(r.commission_rate) >= 0.15 ? "good" : "neutral"}>{pct(r.commission_rate, 0)}</Badge></td>
                <td className="text-right">{money(r.est_commission_minor)}</td>
              </tr>
            ))}
            {reps.length === 0 && <tr><td colSpan={9} style={{ color: "var(--muted)" }}>No rep activity in range</td></tr>}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
