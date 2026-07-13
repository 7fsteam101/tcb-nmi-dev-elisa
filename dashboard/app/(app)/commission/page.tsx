import Link from "next/link";
import { isDemoMode } from "@/lib/settings";
import { money, pct } from "@/lib/format";
import { Card, SectionTitle, InfoTip, Badge, Stat, label } from "@/components/ui";
import { requireAccess } from "@/lib/access";
import {
  recomputeCommissions,
  commissionStale,
  commissionLeaderboard,
  commissionStatements,
  type LeaderboardRow,
  type RepStatement,
} from "@/lib/commission";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PLAN_HELP =
  "July 2 comp plan: closers earn 10% of the invoice, locked until 25% of the invoice is collected, then released into that month's statement. Refunds claw the commission back. Setters: $1,000 monthly base plus 5% (attribution pending). Payouts run monthly.";

const STATEMENT_TONE: Record<string, "good" | "warn" | "bad" | "neutral" | "accent"> = {
  calculated: "warn", approved: "accent", paid: "good",
};
const LINE_TONE: Record<string, "good" | "warn" | "bad" | "neutral" | "accent"> = {
  base: "accent", residual: "neutral", adjustment: "warn", clawback: "bad",
  setter_base: "good", setter_pct: "accent", partner: "neutral", bonus: "good",
};

// Current month in the report timezone as YYYY-MM (en-CA formats ISO-style).
function currentMonthET(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "America/New_York", year: "numeric", month: "2-digit",
  }).format(new Date());
}

// "2026-07" -> "July 2026". Noon UTC so the calendar month never shifts.
function monthLabel(ym: string): string {
  return new Date(`${ym}-01T12:00:00Z`).toLocaleDateString("en-US", {
    month: "long", year: "numeric", timeZone: "UTC",
  });
}

function MonthPill({ href, active, children }: { href: string; active: boolean; children: string }) {
  return (
    <Link
      href={href}
      className="rounded-full border px-2.5 py-1 text-xs font-medium transition-colors"
      style={active
        ? { color: "var(--accent)", borderColor: "var(--accent)", background: "color-mix(in srgb, var(--accent) 12%, transparent)" }
        : { color: "var(--muted)", borderColor: "var(--line)" }}
    >
      {children}
    </Link>
  );
}

export default async function Commission({
  searchParams,
}: {
  searchParams: Promise<{ month?: string; recalc?: string }>;
}) {
  const user = await requireAccess("reps");
  const demo = await isDemoMode();
  const sp = await searchParams;

  const isPrivileged = user.role === "admin" || user.role === "leadership";
  // A closer (or any non-leadership role) sees only their own statement, keyed
  // by the rep their login is linked to. No linked rep means no statement.
  const ownRepId = isPrivileged ? null : user.repId;

  const current = currentMonthET();
  const selected = sp.month === "all"
    ? "all"
    : /^\d{4}-\d{2}$/.test(sp.month ?? "") ? (sp.month as string) : current;
  const monthISO = selected === "all" ? undefined : selected;

  // Freshness gate BEFORE any read, and everything sequential (pooler cap):
  // rebuild the open statements when they are older than 6h or on ?recalc=1.
  if (sp.recalc === "1" || (await commissionStale(demo))) {
    await recomputeCommissions(demo);
  }
  // All months once: feeds the leaderboard, the stat boxes, and the month pills.
  const allMonthsBoard = await commissionLeaderboard(demo);
  const statements: RepStatement[] = isPrivileged || ownRepId
    ? await commissionStatements(demo, monthISO ?? undefined, ownRepId ?? undefined)
    : [];

  const board: LeaderboardRow[] = monthISO
    ? allMonthsBoard.filter((r) => r.period_start.startsWith(monthISO))
    : allMonthsBoard;
  const totalMinor = board.reduce((s, r) => s + r.total_minor, 0);
  const payableMinor = board.filter((r) => r.status !== "paid").reduce((s, r) => s + r.total_minor, 0);
  const repCount = new Set(board.map((r) => r.rep_id)).size;
  const scopeLabel = monthISO ? monthLabel(monthISO) : "All months";

  // Month options: every month that has statements, plus the current month,
  // newest first, capped so the pill row stays short.
  const monthOptions = [...new Set([current, ...allMonthsBoard.map((r) => r.period_start.slice(0, 7))])]
    .sort().reverse().slice(0, 8);
  if (monthISO && !monthOptions.includes(monthISO)) monthOptions.push(monthISO);

  return (
    <div>
      <h1 className="text-xl font-semibold">Commissions</h1>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-2">
        <p className="flex items-center gap-1.5 text-sm" style={{ color: "var(--muted)" }}>
          Monthly commission statements from the database engine.
          <InfoTip text={PLAN_HELP} />
        </p>
        <div className="flex flex-wrap items-center gap-1.5">
          {monthOptions.map((m) => (
            <MonthPill key={m} href={`/commission?month=${m}`} active={selected === m}>
              {monthLabel(m)}
            </MonthPill>
          ))}
          <MonthPill href="/commission?month=all" active={selected === "all"}>All months</MonthPill>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Stat
          label={monthISO ? "Total this month" : "Total all months"}
          value={money(totalMinor)}
          sub={scopeLabel}
          tone="accent"
          help="Sum of every rep's statement in the selected period, net of clawbacks and including bonuses."
        />
        <Stat
          label="Released payable"
          value={money(payableMinor)}
          sub="Calculated + approved, not yet paid"
          tone="good"
          help="Commission already released by the 25%-collected gate but not yet marked paid."
        />
        <Stat
          label="Reps earning"
          value={String(repCount)}
          sub={scopeLabel}
          tone="neutral"
          help="Reps with a commission statement in the selected period."
        />
      </div>

      <SectionTitle
        right={user.role === "admin" ? (
          <Link
            href={`/commission?month=${selected}&recalc=1`}
            className="rounded-full border px-2.5 py-1 text-xs font-medium"
            style={{ color: "var(--accent)", borderColor: "var(--line)" }}
          >
            Recalculate
          </Link>
        ) : undefined}
      >
        Leaderboard
      </SectionTitle>
      <Card>
        <table>
          <thead>
            <tr>
              <th>Rank</th>
              {!monthISO && <th>Month</th>}
              <th>Rep</th>
              <th className="text-right">Commission</th>
              <th>Status</th>
            </tr>
          </thead>
          <tbody>
            {board.map((r) => (
              <tr key={`${r.rep_id}-${r.period_start}`}>
                <td className="tabular-nums">#{r.rank_in_period}</td>
                {!monthISO && <td>{monthLabel(r.period_start.slice(0, 7))}</td>}
                <td className="font-medium">
                  {r.full_name}
                  {r.is_partner && <span className="ml-1.5"><Badge tone="neutral">Partner</Badge></span>}
                </td>
                <td className="text-right tabular-nums">{money(r.total_minor)}</td>
                <td><Badge tone={STATEMENT_TONE[r.status] ?? "neutral"}>{label(r.status)}</Badge></td>
              </tr>
            ))}
            {board.length === 0 && (
              <tr>
                <td colSpan={monthISO ? 4 : 5} style={{ color: "var(--muted)" }}>
                  No commission statements for {scopeLabel}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </Card>

      <SectionTitle>{isPrivileged ? "Statements by rep" : "Your statement"}</SectionTitle>
      {!isPrivileged && !ownRepId && (
        <Card>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            Your login is not linked to a rep profile, so there is no statement to show.
            Ask an admin to link your user to a rep under Admin, Users.
          </p>
        </Card>
      )}
      {(isPrivileged || ownRepId) && statements.length === 0 && (
        <Card>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            No statement lines for {scopeLabel}.
          </p>
        </Card>
      )}
      <div className="space-y-3">
        {statements.map((rep) => (
          <Card key={rep.rep_id}>
            <div className="mb-2 flex items-center justify-between">
              <div className="text-sm font-semibold">{rep.full_name}</div>
              <div className="text-sm font-semibold tabular-nums">{money(rep.total_minor)}</div>
            </div>
            {rep.months.map((m) => (
              <div key={m.period_start} className="mt-4 first:mt-0">
                <div className="mb-1.5 flex items-center gap-2 text-xs" style={{ color: "var(--muted)" }}>
                  <span className="font-medium">{monthLabel(m.period_start.slice(0, 7))}</span>
                  <Badge tone={STATEMENT_TONE[m.status] ?? "neutral"}>{label(m.status)}</Badge>
                  <span className="ml-auto tabular-nums">{money(m.total_minor)}</span>
                </div>
                <table>
                  <thead>
                    <tr>
                      <th>Type</th>
                      <th>Deal</th>
                      <th>Contact</th>
                      <th className="text-right">Rate</th>
                      <th className="text-right">Amount</th>
                    </tr>
                  </thead>
                  <tbody>
                    {m.lines.map((l) => (
                      <tr key={l.id}>
                        <td><Badge tone={LINE_TONE[l.type] ?? "neutral"}>{label(l.type)}</Badge></td>
                        <td>
                          {l.deal_id
                            ? <Link href={`/deals/${l.deal_id}`} style={{ color: "var(--accent)" }}>View deal</Link>
                            : <span style={{ color: "var(--muted)" }}>{label(null)}</span>}
                        </td>
                        <td>
                          {l.contact_id
                            ? <Link href={`/contacts/${l.contact_id}`} style={{ color: "var(--accent)" }}>{l.contact_name ?? "View contact"}</Link>
                            : <span style={{ color: "var(--muted)" }}>{label(null)}</span>}
                        </td>
                        <td className="text-right tabular-nums">
                          {l.rate_applied > 0 ? pct(l.rate_applied, 0) : label(null)}
                        </td>
                        <td className="text-right tabular-nums" style={l.amount_minor < 0 ? { color: "var(--bad)" } : undefined}>
                          {money(l.amount_minor)}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ))}
          </Card>
        ))}
      </div>
    </div>
  );
}
