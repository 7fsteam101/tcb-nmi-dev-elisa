"use client";

import Link from "next/link";
import { Fragment, ReactNode, useEffect, useMemo, useRef, useState } from "react";
import { CallLogRow } from "@/lib/kpi-calllog";
import { Badge, STATUS_TONE, label, InfoTip } from "@/components/ui";
import { dateTime, num, shortDate } from "@/lib/format";
import { MarkButtons } from "@/app/(app)/calls/mark-buttons";

// User-customizable Call Logs table. The visible column set is chosen from the
// "Columns" dropdown and persisted per browser in localStorage; rows can be
// grouped by closer / status / source with collapsible group headers (same
// grouping idea as the Explore table). The table scrolls inside a capped-height
// container so the header row stays visible however deep the log goes.
// Rendering, cell content, and the pending MarkButtons stay identical to the
// previous fixed-column table.

const STORAGE_KEY = "tcb_call_columns";
const PENDING_HELP = "Pending means the slot's time has passed but attendance has not been marked yet (taken or no-show).";

type ColKey =
  | "created" | "event_date" | "lead" | "email" | "phone" | "closer"
  | "attempt" | "stage" | "source" | "paid" | "status" | "cancellation" | "actions" | "open";

type Column = {
  key: ColKey;
  name: string;
  help?: string;
  cell: (r: CallLogRow, tz: string) => ReactNode;
};

// Every available column. `name` is the header; toggling drives what renders.
const COLUMNS: Column[] = [
  {
    key: "created",
    name: "Created",
    help: "When this slot was booked — each reschedule creates a new slot.",
    cell: (r, tz) => <span style={{ color: "var(--muted)" }}>{shortDate(r.created_at, tz)}</span>,
  },
  {
    key: "event_date",
    name: "Scheduled for",
    cell: (r, tz) => dateTime(r.scheduled_for, tz),
  },
  {
    key: "lead",
    name: "Lead",
    cell: (r) => (
      <>
        <Link href={`/contacts/${r.contact_id}`} style={{ color: "var(--accent)" }}>{r.contact_name}</Link>
        {r.contact_email && <div className="text-xs" style={{ color: "var(--muted)" }}>{r.contact_email}</div>}
      </>
    ),
  },
  {
    key: "email",
    name: "Email",
    cell: (r) => <span style={{ color: "var(--muted)" }}>{r.contact_email ?? "—"}</span>,
  },
  {
    key: "phone",
    name: "Phone",
    cell: (r) => <span style={{ color: "var(--muted)" }}>{r.contact_phone ?? "—"}</span>,
  },
  {
    key: "closer",
    name: "Closer",
    cell: (r) => r.closer ?? "—",
  },
  {
    key: "attempt",
    name: "Attempt",
    help: "Booking attempt number. #2 or higher means the call was rescheduled.",
    cell: (r) => (r.seq > 1 ? <Badge tone="warn">{`#${r.seq}`}</Badge> : "#1"),
  },
  {
    key: "stage",
    name: "Opportunity",
    cell: (r) => (r.stage ? <Badge tone={STATUS_TONE[r.stage] ?? "neutral"}>{label(r.stage)}</Badge> : "—"),
  },
  {
    key: "source",
    name: "Source",
    cell: (r) => (r.booking_source ? label(r.booking_source) : "—"),
  },
  {
    key: "paid",
    name: "Paid",
    help: "Whether the booking came through a paid (booking-fee) calendar. Attribute only; free bookings still count as tracked calls.",
    cell: (r) =>
      r.paid_booking === true ? <Badge tone="good">Paid</Badge>
      : r.paid_booking === false ? <Badge tone="neutral">Free</Badge>
      : <span style={{ color: "var(--muted)" }}>—</span>,
  },
  {
    key: "status",
    name: "Status",
    help: PENDING_HELP,
    cell: (r) => (
      <Badge tone={r.needs_attendance ? "warn" : (STATUS_TONE[r.status] ?? "neutral")}>
        {r.needs_attendance ? label("pending") : label(r.status)}
      </Badge>
    ),
  },
  {
    key: "cancellation",
    name: "Cancellation reason",
    cell: (r) => <span style={{ color: "var(--muted)" }}>{r.cancellation_reason ?? "—"}</span>,
  },
  {
    key: "actions",
    name: "Actions",
    help: "Quick attendance marking. Show up files a minimal taken report — the closer still files the full Sales Call Report after.",
    cell: (r) =>
      r.needs_attendance
        ? <MarkButtons appointmentId={r.appointment_id} />
        : <span style={{ color: "var(--muted)" }}>—</span>,
  },
  {
    key: "open",
    name: "",
    cell: (r) => <Link href={`/appointments/${r.appointment_id}`} className="text-xs" style={{ color: "var(--accent)" }}>Open &rarr;</Link>,
  },
];

const ALL_KEYS = COLUMNS.map((c) => c.key);
const DEFAULT_KEYS: ColKey[] = ["event_date", "lead", "closer", "attempt", "stage", "status", "actions", "open"];

// Keep only recognized keys, preserve canonical column order, never empty.
function normalize(keys: string[]): ColKey[] {
  const set = new Set(keys);
  const kept = ALL_KEYS.filter((k) => set.has(k));
  return kept.length > 0 ? kept : DEFAULT_KEYS;
}

// Group-by options: the label-ish fields that make useful buckets. Each value
// function mirrors what the corresponding column renders, so groups match what
// the user sees (status folds needs_attendance into "pending").
type GroupKey = "" | "closer" | "status" | "source";

const GROUPS: { key: Exclude<GroupKey, "">; name: string; value: (r: CallLogRow) => string | null }[] = [
  { key: "closer", name: "Closer", value: (r) => r.closer },
  { key: "status", name: "Status", value: (r) => (r.needs_attendance ? "pending" : r.status) },
  { key: "source", name: "Source", value: (r) => r.booking_source },
];

export function CallsTable({ rows, tz }: { rows: CallLogRow[]; tz: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  // Start from the default so server and first client render match; hydrate the
  // saved set after mount (localStorage is client-only).
  const [visible, setVisible] = useState<ColKey[]>(DEFAULT_KEYS);

  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) setVisible(normalize(JSON.parse(raw) as string[]));
    } catch {
      // ignore malformed storage
    }
  }, []);

  useEffect(() => {
    const onClick = (e: MouseEvent) => { if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false); };
    if (open) document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, [open]);

  function toggle(key: ColKey) {
    setVisible((prev) => {
      const has = prev.includes(key);
      const nextSet = has ? prev.filter((k) => k !== key) : [...prev, key];
      const next = normalize(nextSet);
      try { localStorage.setItem(STORAGE_KEY, JSON.stringify(next)); } catch { /* ignore */ }
      return next;
    });
  }

  // ---- grouping (session-only state; groups start expanded) ----
  const [groupKey, setGroupKey] = useState<GroupKey>("");
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());

  // Rows keep the server's date ordering inside each group; groups are ordered
  // by size, biggest first (same as the Explore table).
  const groups = useMemo(() => {
    const group = GROUPS.find((g) => g.key === groupKey);
    if (!group) return null;
    const byValue = new Map<string, CallLogRow[]>();
    for (const row of rows) {
      const v = group.value(row);
      const k = v == null || v === "" ? "" : v;
      const list = byValue.get(k);
      if (list) list.push(row);
      else byValue.set(k, [row]);
    }
    return [...byValue.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [rows, groupKey]);

  function onGroupChange(value: string) {
    setGroupKey(value === "closer" || value === "status" || value === "source" ? value : "");
    setCollapsed(new Set()); // a new grouping starts fully expanded
  }

  function toggleGroup(value: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return next;
    });
  }

  const shown = COLUMNS.filter((c) => visible.includes(c.key));

  const bodyRow = (r: CallLogRow) => (
    <tr key={r.appointment_id}>
      {shown.map((c) => <td key={c.key}>{c.cell(r, tz)}</td>)}
    </tr>
  );

  return (
    <div>
      <div className="mb-3 flex flex-wrap items-center justify-end gap-3">
        <label className="flex items-center gap-1.5 text-xs" style={{ color: "var(--muted)" }}>
          Group by
          <select
            value={groupKey}
            onChange={(e) => onGroupChange(e.target.value)}
            className="!w-auto !py-1.5 text-sm"
          >
            <option value="">None</option>
            {GROUPS.map((g) => <option key={g.key} value={g.key}>{g.name}</option>)}
          </select>
        </label>
        <div className="relative" ref={ref}>
          <button type="button" onClick={() => setOpen((o) => !o)}
            className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-[12px] font-medium"
            style={{ background: "var(--panel)", color: "var(--muted)", borderColor: "var(--line)" }}>
            Columns <span style={{ opacity: 0.7 }}>▾</span>
          </button>
          {open && (
            <div className="absolute right-0 z-30 mt-1 w-56 rounded-xl border p-1 shadow-xl"
              style={{ borderColor: "var(--line)", background: "var(--panel)" }}>
              {COLUMNS.map((c) => {
                const checked = visible.includes(c.key);
                const last = checked && visible.length === 1;
                return (
                  <label key={c.key}
                    className="flex cursor-pointer items-center gap-2 rounded-md px-3 py-1.5 text-[13px] hover:bg-white/5"
                    style={{ color: "var(--text)" }}>
                    <input type="checkbox" checked={checked} disabled={last}
                      onChange={() => toggle(c.key)} className="!w-auto" />
                    {c.name}
                  </label>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* The table scrolls inside this capped-height container, so the sticky
          header row (top: 0 within it) stays visible however deep the log
          goes. border-collapse separate: with collapse, the header's bottom
          border would scroll away while the cells stay pinned. */}
      <div className="overflow-auto" style={{ maxHeight: "max(320px, calc(100vh - 320px))" }}>
        <table style={{ borderCollapse: "separate", borderSpacing: 0 }}>
          <thead>
            <tr>
              {shown.map((c) => (
                <th key={c.key} style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--panel)" }}>
                  {c.name}{c.help && <> <InfoTip text={c.help} /></>}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {groups
              ? groups.map(([value, groupRows]) => {
                  const isCollapsed = collapsed.has(value);
                  return (
                    <Fragment key={`g:${value}`}>
                      <tr>
                        <td
                          colSpan={shown.length}
                          className="!p-0"
                          style={{ background: "color-mix(in srgb, var(--panel-2) 70%, transparent)" }}
                        >
                          <button
                            type="button"
                            onClick={() => toggleGroup(value)}
                            aria-expanded={!isCollapsed}
                            className="flex w-full cursor-pointer items-center gap-1.5 px-3 py-2 text-left text-[13px] font-semibold"
                            style={{ color: "var(--text)" }}
                          >
                            <span aria-hidden style={{ color: "var(--muted)" }}>{isCollapsed ? "▸" : "▾"}</span>
                            {label(value === "" ? null : value)}
                            <span className="font-normal" style={{ color: "var(--muted)" }}>({num(groupRows.length)})</span>
                          </button>
                        </td>
                      </tr>
                      {!isCollapsed && groupRows.map((r) => bodyRow(r))}
                    </Fragment>
                  );
                })
              : rows.map((r) => bodyRow(r))}
            {rows.length === 0 && (
              <tr><td colSpan={shown.length} style={{ color: "var(--muted)" }}>No call slots match this view</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
