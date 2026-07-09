"use client";

import Link from "next/link";
import { ReactNode, useLayoutEffect, useState } from "react";
import { Badge, STATUS_TONE, label } from "@/components/ui";

// Expandable appointment records for the contact profile (Katie, July 10):
// the old table sent her to /appointments/[id] for every detail (too many
// hops). Each slot is now a collapsed card that expands INLINE to the same
// field grid the full appointment page shows. The server panel
// (contacts/[id]/detail.tsx) runs the query and serializes plain values;
// dates arrive PRE-FORMATTED in the report timezone so the SSR pass and the
// browser hydration render identical text (client-side toLocaleString can
// drift between Node and browser ICU).
export type ApptCardRow = {
  id: string;
  callId: string | null; // sibling slots share this: same call, seq 1..N
  seq: number | null;
  status: string | null;
  scheduledDisplay: string; // dateTime(scheduled_for, tz), formatted server-side
  createdDisplay: string; // dateTime(created_at, tz)
  calendarName: string | null;
  paidBooking: boolean | null;
  bookedBy: string | null;
  sourceChannel: string | null;
  reason: string | null; // cancellation reason name, when set
  movedBy: string | null;
  ghlAppointmentId: string | null; // carried with the call context; not rendered yet
};

const tone = (s: string | null) => STATUS_TONE[s ?? ""] ?? "neutral";

function Detail({ label: l, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-28 shrink-0 text-xs" style={{ color: "var(--muted)" }}>{l}</span>
      <span className="min-w-0 text-sm" style={{ color: "var(--text)" }}>{value || "—"}</span>
    </div>
  );
}

export function AppointmentCards({ rows }: { rows: ApptCardRow[] }) {
  // independent expansion (comparing two slots side by side is useful);
  // everything starts collapsed
  const [open, setOpen] = useState<Record<string, boolean>>({});

  // sibling slots of the same call, for the slot-history list: rows arrive
  // per-slot already, so grouping by callId is all the derivation needed
  const byCall = new Map<string, ApptCardRow[]>();
  for (const r of rows) {
    if (!r.callId) continue;
    const list = byCall.get(r.callId);
    if (list) list.push(r);
    else byCall.set(r.callId, [r]);
  }

  return (
    <div className="space-y-2 text-sm">
      {/* :hover cannot be expressed inline; same pattern as SectionTabs' pills */}
      <style>{`.appt-head:hover{background:var(--panel-2)}`}</style>
      {rows.map((r) => {
        const on = !!open[r.id];
        const siblings = (r.callId ? byCall.get(r.callId) ?? [] : [])
          .slice()
          .sort((a, b) => (a.seq ?? 0) - (b.seq ?? 0));
        return (
          <div key={r.id} className="overflow-hidden rounded-lg border"
            style={{ borderColor: "var(--line)", background: "var(--panel)" }}>
            <button type="button" aria-expanded={on}
              onClick={() => setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))}
              className="appt-head flex w-full items-center gap-2 px-3 py-2.5 text-left transition-colors">
              <span className="shrink-0 font-semibold">{r.scheduledDisplay}</span>
              {(r.seq ?? 1) > 1
                ? <Badge tone="warn">#{r.seq}</Badge>
                : <span className="num shrink-0 text-xs" style={{ color: "var(--muted)" }}>#1</span>}
              <Badge tone={tone(r.status)}>{label(r.status)}</Badge>
              {r.calendarName && (
                <span className="min-w-0 truncate text-xs" style={{ color: "var(--muted)" }}>{r.calendarName}</span>
              )}
              <svg aria-hidden width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor"
                strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
                className={`ml-auto shrink-0 transition-transform${on ? "" : " -rotate-90"}`}
                style={{ color: "var(--muted)" }}>
                <path d="M6 9l6 6 6-6" />
              </svg>
            </button>
            {on && (
              <div className="border-t px-3 pb-3 pt-2.5" style={{ borderColor: "var(--line)" }}>
                {/* mirrors the field grid on /appointments/[id] */}
                <div className="grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2">
                  <Detail label="Status" value={<Badge tone={tone(r.status)}>{label(r.status)}</Badge>} />
                  <Detail label="Scheduled for" value={r.scheduledDisplay} />
                  <Detail label="Attempt" value={<Badge tone={(r.seq ?? 1) > 1 ? "warn" : "neutral"}>#{r.seq ?? 1}</Badge>} />
                  <Detail label="Calendar" value={r.calendarName} />
                  <Detail label="Paid booking" value={r.paidBooking == null ? "—"
                    : <Badge tone={r.paidBooking ? "good" : "neutral"}>{r.paidBooking ? "Paid" : "Free"}</Badge>} />
                  <Detail label="Booked by" value={label(r.bookedBy)} />
                  <Detail label="Source" value={label(r.sourceChannel)} />
                  {r.reason && <Detail label="Reason" value={r.reason} />}
                  {r.movedBy && <Detail label="Moved by" value={label(r.movedBy)} />}
                  <Detail label="Created" value={r.createdDisplay} />
                </div>
                {siblings.length > 1 && (
                  <div className="mt-3 border-t pt-2" style={{ borderColor: "var(--line)" }}>
                    <div className="mb-1 text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>
                      Slot history (same call)
                    </div>
                    <div className="space-y-1">
                      {siblings.map((s) => (
                        <div key={s.id} className="flex flex-wrap items-center gap-2 text-[13px]">
                          <span className="num w-7 shrink-0" style={{ color: "var(--muted)" }}>#{s.seq ?? "—"}</span>
                          <span>{s.scheduledDisplay}</span>
                          <Badge tone={tone(s.status)}>{label(s.status)}</Badge>
                          {s.id === r.id && <span className="text-[11px]" style={{ color: "var(--muted)" }}>this slot</span>}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                {/* secondary escape hatch; in-app page, so same tab */}
                <div className="mt-3 border-t pt-2" style={{ borderColor: "var(--line)" }}>
                  <Link href={`/appointments/${r.id}`} className="text-xs font-medium" style={{ color: "var(--accent)" }}>
                    Open full page &rarr;
                  </Link>
                </div>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// Legacy-hash alias: the "Calls" tab is now "Opportunities", but old deep links
// and bookmarks still say #calls. Rendered BEFORE SectionTabs so its layout
// effect runs first (React commits sibling effects in tree order) and rewrites
// the hash before SectionTabs' own mount handler reads it. replaceState (never
// location.hash=) so no history entry is added: in the drawer, Back must still
// close the drawer in one step. The synthetic hashchange covers rewrites after
// mount, since replaceState does not fire one on its own.
export function HashAlias({ from, to }: { from: string; to: string }) {
  useLayoutEffect(() => {
    const fix = () => {
      if (window.location.hash.replace(/^#/, "") !== from) return;
      window.history.replaceState(null, "", `#${to}`);
      window.dispatchEvent(new HashChangeEvent("hashchange"));
    };
    fix();
    window.addEventListener("hashchange", fix);
    return () => window.removeEventListener("hashchange", fix);
  }, [from, to]);
  return null;
}
