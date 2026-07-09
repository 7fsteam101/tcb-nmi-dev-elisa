import { sql } from "@/lib/db";
import { isDemoMode } from "@/lib/settings";
import { commissionLeaderboard } from "@/lib/commission";
import { money } from "@/lib/format";
import { Badge, SectionTitle, label } from "@/components/ui";
import { CommissionEditor } from "./editor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const STATEMENT_TONE: Record<string, "good" | "warn" | "bad" | "neutral" | "accent"> = {
  calculated: "warn", approved: "accent", paid: "good",
};

// "2026-07-01" -> "July 2026". Noon UTC so the calendar month never shifts.
function monthLabel(periodStart: string): string {
  return new Date(`${periodStart.slice(0, 7)}-01T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long", year: "numeric", timeZone: "UTC",
  });
}

export default async function CommissionAdmin() {
  const demo = await isDemoMode();
  // One light batch for the toggle grid, then the engine leaderboard on its own,
  // sequentially, to stay under the free-tier pooler cap.
  const [rules, reps, settings] = await Promise.all([
    sql`
      select id, key, name, description, params, default_enabled, sort_order
      from sales.commission_rule order by sort_order` as unknown as Promise<
        { id: string; key: string; name: string; description: string | null; params: any; default_enabled: boolean; sort_order: number | null }[]
      >,
    sql`
      select id, full_name from sales.rep
      where active and role in ('closer','hybrid')
      order by full_name` as unknown as Promise<{ id: string; full_name: string }[]>,
    sql`select rep_id, rule_id, enabled from sales.rep_commission_setting` as unknown as Promise<
      { rep_id: string; rule_id: string; enabled: boolean }[]
    >,
  ]);
  const board = await commissionLeaderboard(demo);

  return (
    <>
      <CommissionEditor
        rules={rules as never}
        reps={reps as never}
        settings={settings as never}
        demo={demo}
      />
      <div className="max-w-5xl">
        <SectionTitle>Statement leaderboard</SectionTitle>
        <div className="card p-4">
          <table>
            <thead>
              <tr>
                <th>Month</th>
                <th>Rank</th>
                <th>Rep</th>
                <th className="text-right">Commission</th>
                <th>Status</th>
              </tr>
            </thead>
            <tbody>
              {board.map((r) => (
                <tr key={`${r.rep_id}-${r.period_start}`}>
                  <td>{monthLabel(r.period_start)}</td>
                  <td className="tabular-nums">#{r.rank_in_period}</td>
                  <td className="font-medium">{r.full_name}</td>
                  <td className="text-right tabular-nums">{money(r.total_minor)}</td>
                  <td><Badge tone={STATEMENT_TONE[r.status] ?? "neutral"}>{label(r.status)}</Badge></td>
                </tr>
              ))}
              {board.length === 0 && (
                <tr><td colSpan={5} style={{ color: "var(--muted)" }}>No statements computed yet</td></tr>
              )}
            </tbody>
          </table>
          <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
            Monthly statement totals from the commission engine. Rule toggles apply on the next
            recompute; full statements live on the Commissions page.
          </p>
        </div>
      </div>
    </>
  );
}
