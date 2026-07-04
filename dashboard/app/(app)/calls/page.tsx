import Link from "next/link";
import { callLogRows, callLogSummary, closerOptions } from "@/lib/kpi-calllog";
import { recentCallOutcomes } from "@/lib/kpi";
import { isDemoMode, reportTimezone } from "@/lib/settings";
import { dateTime, money, num, shortDate } from "@/lib/format";
import { Card, SectionTitle, Badge, STATUS_TONE, label, InfoTip } from "@/components/ui";
import { PresetBar } from "@/components/preset-bar";
import { requireAccess } from "@/lib/access";
import { MarkButtons } from "./mark-buttons";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PENDING_HELP = "Pending = the slot's time passed with no attendance marked.";

// Shape of lib/kpi.ts recentCallOutcomes rows (that file stays untyped).
type OutcomeRow = {
  id: string;
  occurred_at: string | Date;
  disposition: string | null;
  contact_id: string;
  contact_name: string;
  closer: string | null;
  total_contract_value_minor: number | null;
  plan_type_snapshot: string | null;
};

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

  const [summary, rows, closers, outcomes] = await Promise.all([
    callLogSummary({ demo, days }),
    callLogRows({ demo, days, q, closerId: closer, status }),
    closerOptions(demo),
    recentCallOutcomes(demo),
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
          <PresetBar />
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
              taken report and syncs Close/GHL — the closer should still file the full Sales Call Report after.
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
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Created <InfoTip text="When this slot was booked — each reschedule creates a new slot." /></th>
                <th>Event date</th>
                <th>Lead</th>
                <th>Closer</th>
                <th>Attempt <InfoTip text="Slot number for this booking — #2 and up means it was rescheduled." /></th>
                <th>Status <InfoTip text={PENDING_HELP} /></th>
                <th>Cancellation reason</th>
                <th>Actions <InfoTip text="Quick attendance marking. Show up files a minimal taken report — the closer still files the full Sales Call Report after." /></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.appointment_id}>
                  <td style={{ color: "var(--muted)" }}>{shortDate(r.created_at, tz)}</td>
                  <td>{dateTime(r.scheduled_for, tz)}</td>
                  <td>
                    <Link href={`/contacts/${r.contact_id}`} style={{ color: "var(--accent)" }}>{r.contact_name}</Link>
                    {r.contact_email && <div className="text-xs" style={{ color: "var(--muted)" }}>{r.contact_email}</div>}
                  </td>
                  <td>{r.closer ?? "—"}</td>
                  <td>{r.seq > 1 ? <Badge tone="warn">{`#${r.seq}`}</Badge> : "#1"}</td>
                  <td>
                    <Badge tone={r.needs_attendance ? "warn" : (STATUS_TONE[r.status] ?? "neutral")}>
                      {r.needs_attendance ? "pending" : label(r.status)}
                    </Badge>
                  </td>
                  <td style={{ color: "var(--muted)" }}>{r.cancellation_reason ?? "—"}</td>
                  <td>
                    {r.needs_attendance
                      ? <MarkButtons appointmentId={r.appointment_id} />
                      : <span style={{ color: "var(--muted)" }}>—</span>}
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={8} style={{ color: "var(--muted)" }}>No call slots match this view</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>

      <SectionTitle>Recent outcomes</SectionTitle>
      <Card>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr><th>Taken</th><th>Contact</th><th>Closer</th><th>Disposition</th><th>Deal</th></tr>
            </thead>
            <tbody>
              {(outcomes as unknown as OutcomeRow[]).map((c) => (
                <tr key={c.id}>
                  <td>{dateTime(c.occurred_at, tz)}</td>
                  <td><Link href={`/contacts/${c.contact_id}`} style={{ color: "var(--accent)" }}>{c.contact_name}</Link></td>
                  <td>{c.closer ?? "—"}</td>
                  <td><Badge tone={STATUS_TONE[c.disposition ?? ""] ?? "neutral"}>{label(c.disposition)}</Badge></td>
                  <td>{c.total_contract_value_minor ? `${money(c.total_contract_value_minor)} (${label(c.plan_type_snapshot)})` : "—"}</td>
                </tr>
              ))}
              {outcomes.length === 0 && <tr><td colSpan={5} style={{ color: "var(--muted)" }}>No taken calls yet</td></tr>}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
