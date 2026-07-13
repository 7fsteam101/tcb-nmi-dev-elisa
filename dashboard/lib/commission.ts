import { sql } from "./db";

// July 2 comp plan, computed IN the database by finance.recompute_commissions()
// (migrations 0036 + 0037) and persisted as finance.commission_payout (one
// statement per rep per month, status calculated -> approved -> paid) plus
// finance.commission_line (rate frozen per line). This module is a thin reader
// over the engine's views:
//   recomputeCommissions  rebuilds all OPEN statements (never approved/paid)
//   commissionStale       true when statements are older than 6 hours (or absent)
//   commissionLeaderboard finance.v_commission_leaderboard (rep x month totals)
//   commissionStatements  finance.v_commission_statement_line grouped rep -> month
// Plan summary (help text): closers earn 10% of the invoice, locked until 25%
// of the invoice is collected, then released into that month's statement;
// refunds claw back; setter $1k base + 5% (attribution pending); payouts monthly.
// Every function issues at most one query (pooler-safe; call them sequentially).

export type LeaderboardRow = {
  rep_id: string;
  full_name: string;
  role: string;
  is_partner: boolean;
  period_start: string; // YYYY-MM-DD, first day of the month
  total_minor: number;
  status: string; // calculated | approved | paid
  rank_in_period: number;
};

export type StatementLine = {
  id: string;
  type: string; // base | residual | adjustment | clawback | setter_base | setter_pct | partner | bonus
  deal_id: string | null;
  contact_id: string | null;
  contact_name: string | null;
  rate_applied: number; // frozen at calc time; 0 for flat lines (setter_base, flat bonus)
  amount_minor: number; // negative for clawbacks
};

export type StatementMonth = {
  period_start: string; // YYYY-MM-DD, first day of the month
  status: string; // calculated | approved | paid
  total_minor: number;
  lines: StatementLine[];
};

export type RepStatement = {
  rep_id: string;
  full_name: string;
  total_minor: number;
  months: StatementMonth[]; // newest first
};

/** Rebuild all OPEN monthly statements (status 'calculated') for the demo scope.
 *  Never touches approved/paid statements. ~1.4s in the DB. Returns false on
 *  failure instead of throwing, so a stale-but-readable page still renders. */
export async function recomputeCommissions(demo: boolean): Promise<boolean> {
  try {
    await sql`select finance.recompute_commissions(${demo})`;
    return true;
  } catch (err) {
    console.error("finance.recompute_commissions failed:", err);
    return false;
  }
}

/** True when the newest payout was last rebuilt more than 6 hours ago, or no
 *  payouts exist yet, so the caller knows to recompute before reading. */
export async function commissionStale(demo: boolean): Promise<boolean> {
  const rows = await sql`
    select max(updated_at) as newest
    from finance.commission_payout
    where is_demo = ${demo}`;
  const newest = rows[0]?.newest as string | Date | null | undefined;
  if (!newest) return true;
  return Date.now() - new Date(newest).getTime() > 6 * 60 * 60 * 1000;
}

/** Per-rep monthly totals with rank, from finance.v_commission_leaderboard.
 *  monthISO ("YYYY-MM") filters to that month's statements; omit for all months. */
export async function commissionLeaderboard(demo: boolean, monthISO?: string): Promise<LeaderboardRow[]> {
  const monthFilter = monthISO ? sql`and period_start = ${`${monthISO}-01`}` : sql``;
  const rows = await sql`
    select rep_id, full_name, role::text as role, is_partner,
           period_start::text as period_start, total_commission_minor,
           status::text as status, rank_in_period
    from finance.v_commission_leaderboard
    where is_demo = ${demo} ${monthFilter}
    order by period_start desc, rank_in_period asc, full_name asc`;
  return rows.map((r) => ({
    rep_id: r.rep_id as string,
    full_name: r.full_name as string,
    role: r.role as string,
    is_partner: Boolean(r.is_partner),
    period_start: r.period_start as string,
    total_minor: Number(r.total_commission_minor),
    status: r.status as string,
    rank_in_period: Number(r.rank_in_period),
  }));
}

/** Statement lines from finance.v_commission_statement_line, grouped per rep and
 *  per month (newest month first), reps ordered by total desc. monthISO ("YYYY-MM")
 *  filters the period; repId narrows to a single rep (the closer's own view). */
export async function commissionStatements(demo: boolean, monthISO?: string, repId?: string): Promise<RepStatement[]> {
  const monthFilter = monthISO ? sql`and l.period_start = ${`${monthISO}-01`}` : sql``;
  const repFilter = repId ? sql`and l.rep_id = ${repId}` : sql``;
  const rows = await sql`
    select l.id, l.rep_id, rep.full_name, l.period_start::text as period_start,
           l.status::text as status, l.type::text as type, l.deal_id, l.contact_id,
           ct.full_name as contact_name, l.rate_applied, l.commission_amount_minor
    from finance.v_commission_statement_line l
    join sales.rep rep on rep.id = l.rep_id
    left join core.contact ct on ct.id = l.contact_id
    where l.is_demo = ${demo} ${monthFilter} ${repFilter}
    order by rep.full_name asc, l.period_start desc, l.type asc, l.id asc`;

  const byRep = new Map<string, RepStatement>();
  for (const r of rows) {
    const repKey = r.rep_id as string;
    let rep = byRep.get(repKey);
    if (!rep) {
      rep = { rep_id: repKey, full_name: r.full_name as string, total_minor: 0, months: [] };
      byRep.set(repKey, rep);
    }
    const periodStart = r.period_start as string;
    let month = rep.months.find((m) => m.period_start === periodStart);
    if (!month) {
      month = { period_start: periodStart, status: r.status as string, total_minor: 0, lines: [] };
      rep.months.push(month);
    }
    const amount = Number(r.commission_amount_minor);
    rep.total_minor += amount;
    month.total_minor += amount;
    month.lines.push({
      id: r.id as string,
      type: r.type as string,
      deal_id: (r.deal_id as string | null) ?? null,
      contact_id: (r.contact_id as string | null) ?? null,
      contact_name: (r.contact_name as string | null) ?? null,
      rate_applied: Number(r.rate_applied ?? 0),
      amount_minor: amount,
    });
  }
  return [...byRep.values()].sort((a, b) => b.total_minor - a.total_minor || a.full_name.localeCompare(b.full_name));
}
