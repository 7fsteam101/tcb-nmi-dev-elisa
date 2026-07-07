import Link from "next/link";
import { callLogRows, callLogSummary, closerOptions } from "@/lib/kpi-calllog";
import { isDemoMode, reportTimezone } from "@/lib/settings";
import { num } from "@/lib/format";
import { Card, SectionTitle, InfoTip } from "@/components/ui";
import { DateRangeBar } from "@/components/date-range";
import { CallsTable } from "@/components/calls-table";
import { requireAccess } from "@/lib/access";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PENDING_HELP = "Pending means the slot's time has passed but attendance has not been marked yet (taken or no-show).";

const STATUS_OPTIONS = [
  { value: "pending", label: "Pending attendance" },
  { value: "scheduled", label: "Scheduled" },
  { value: "confirmed", label: "Confirmed" },
  { value: "taken", label: "Taken" },
  { value: "no_show", label: "No show" },
  { value: "cancelled_by_lead", label: "Cancelled by lead" },
  { value: "cancelled_by_team", label: "Cancelled by team" },
];

export default async function Calls({
  searchParams,
}: {
  searchParams: Promise<{ days?: string; q?: string; closer?: string; status?: string }>;
}) {
  await requireAccess("calls");
  const sp = await searchParams;
  const demo = await isDemoMode();
  const tz = await reportTimezone();
  const days = Math.min(Math.max(parseInt(sp.days ?? "30", 10) || 30, 7), 365);
  const q = (sp.q ?? "").trim();
  const closer = sp.closer ?? "";
  const status = sp.status ?? "";

  const [summary, rows, closers] = await Promise.all([
    callLogSummary({ demo, days }),
    callLogRows({ demo, days, q, closerId: closer, status }),
    closerOptions(demo),
  ]);

  // Chip/banner links keep the current search + closer + range, swap the status.
  const href = (nextStatus: string) => {
    const p = new URLSearchParams();
    p.set("days", String(days));
    if (q) p.set("q", q);
    if (closer) p.set("closer", closer);
    if (nextStatus) p.set("status", nextStatus);
    return `/calls?${p.toString()}`;
  };

  const pending = Number(summary.pending);
  const chips = [
    { key: "scheduled", name: "Scheduled", value: summary.scheduled, help: "Current slots whose time is still ahead (scheduled or confirmed)." },
    { key: "pending", name: "Pending", value: summary.pending, help: PENDING_HELP, alert: pending > 0 },
    { key: "taken", name: "Taken", value: summary.taken },
    { key: "no_show", name: "No-shows", value: summary.no_show },
    { key: "cancelled_by_lead", name: "Cancelled by lead", value: summary.cancelled_by_lead },
    { key: "cancelled_by_team", name: "Cancelled by team", value: summary.cancelled_by_team },
  ];

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold">Call Logs</h1>
          <p className="text-sm" style={{ color: "var(--muted)" }}>
            One row per live appointment slot, last {days} days. {num(rows.length)} shown{rows.length === 200 ? " (first 200)" : ""}.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <DateRangeBar />
          <Link href="/forms/sales-call" className="btn">Log a call outcome</Link>
        </div>
      </div>

      {pending > 0 && (
        <div className="card mb-6 flex flex-wrap items-center justify-between gap-3 p-4" style={{ borderColor: "var(--accent)" }}>
          <div>
            <div className="flex items-center gap-1.5 text-sm font-semibold">
              Attendance tracking <InfoTip text={PENDING_HELP} />
            </div>
            <p className="mt-0.5 text-sm" style={{ color: "var(--muted)" }}>
              {num(pending)} call{pending === 1 ? " needs" : "s need"} attendance marking. Show up files a minimal
              taken report and syncs Close/GHL. The closer should still file the full Sales Call Report after.
            </p>
          </div>
          <Link href={href("pending")} className="btn">Review pending</Link>
        </div>
      )}

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
        {chips.map((c) => {
          const active = status === c.key;
          return (
            <Link key={c.key} href={active ? href("") : href(c.key)}>
              <div className="card card-hover p-3" style={active ? { borderColor: "var(--accent)" } : undefined}>
                <div className="flex items-center gap-1.5 text-xs" style={{ color: "var(--muted)" }}>
                  {c.name}
                  {c.help && <InfoTip text={c.help} />}
                </div>
                <div className="mt-1 text-xl font-semibold tracking-tight" style={c.alert ? { color: "var(--warn)" } : undefined}>
                  {num(c.value)}
                </div>
              </div>
            </Link>
          );
        })}
      </div>

      <SectionTitle>Call log</SectionTitle>
      <form method="get" action="/calls" className="mb-4 flex flex-wrap items-center gap-2">
        <input type="hidden" name="days" value={days} />
        <div className="w-full max-w-xs">
          <input name="q" defaultValue={q} placeholder="Lead name or email" aria-label="Search by lead name or email" />
        </div>
        <select name="closer" defaultValue={closer} aria-label="Filter by closer" className="!w-auto">
          <option value="">All closers</option>
          {closers.map((r) => <option key={r.id} value={r.id}>{r.full_name}</option>)}
        </select>
        <select name="status" defaultValue={status} aria-label="Filter by status" className="!w-auto">
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
        </select>
        <button type="submit" className="btn">Filter</button>
      </form>

      <Card>
        <CallsTable rows={rows} tz={tz} />
      </Card>
    </div>
  );
}
