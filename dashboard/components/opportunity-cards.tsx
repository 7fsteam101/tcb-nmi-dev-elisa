"use client";

import Link from "next/link";
import { ReactNode, useState } from "react";
import { Badge, label } from "@/components/ui";

// Expandable opportunity records for the contact profile (Katie, July 10):
// the old cards' only detail path was an "Open ->" link to /opportunities/[id]
// (one more hop). Each opportunity is now a collapsed card that expands INLINE
// to the same field grid the full opportunity page shows, plus the linked deal
// line and the calls one-liner. Same pattern as appointment-cards: the server
// panel (contacts/[id]/detail.tsx) runs the (single, widened) query and
// serializes plain values; dates arrive PRE-FORMATTED in the report timezone
// so the SSR pass and browser hydration render identical text.
type Tone = "good" | "warn" | "bad" | "neutral" | "accent";

export type OppCardRow = {
  id: string;
  stage: string | null;
  stageTone: Tone; // tone() lives server-side (STATUS_TONE + EXTRA_TONE), so it ships resolved
  openedShort: string; // shortDate(opened_at, tz), for the collapsed header
  closedShort: string | null; // shortDate(closed_at, tz) when closed
  openedFull: string; // dateTime(opened_at, tz), for the expanded grid
  closedFull: string | null;
  cohortDisplay: string | null; // shortDate(cohort_month, tz), matching /opportunities/[id]
  firstTouch: string | null; // attribution channels, raw values (label()ed here)
  lastTouch: string | null;
  convertingTouch: string | null;
  dqReason: string | null; // core.dq_reason.name when the lead was screened out
  lostReason: string | null; // core.lost_reason.name when a qualified lead did not convert
  dealValue: string | null; // money(total_contract_value_minor) when a deal exists
  dealStatus: string | null;
  dealStatusTone: Tone | null;
  callsSummary: string; // "No calls yet" | "3 calls, latest Jul 2"
};

function Detail({ label: l, value }: { label: string; value: ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-28 shrink-0 text-xs" style={{ color: "var(--muted)" }}>{l}</span>
      <span className="min-w-0 text-sm" style={{ color: "var(--text)" }}>{value || "—"}</span>
    </div>
  );
}

export function OpportunityCards({ rows }: { rows: OppCardRow[] }) {
  // independent expansion (comparing two opportunities side by side is useful);
  // everything starts collapsed
  const [open, setOpen] = useState<Record<string, boolean>>({});

  return (
    <div className="space-y-2 text-sm">
      {/* :hover cannot be expressed inline; same pattern as appointment-cards */}
      <style>{`.opp-head:hover{background:var(--panel-2)}`}</style>
      {rows.map((r) => {
        const on = !!open[r.id];
        return (
          <div key={r.id} className="overflow-hidden rounded-lg border"
            style={{ borderColor: "var(--line)", background: "var(--panel)" }}>
            <button type="button" aria-expanded={on}
              onClick={() => setOpen((o) => ({ ...o, [r.id]: !o[r.id] }))}
              className="opp-head w-full px-3 py-2.5 text-left transition-colors">
              <div className="flex items-center gap-2">
                <Badge tone={r.stageTone}>{label(r.stage)}</Badge>
                <span className="min-w-0 truncate text-xs" style={{ color: "var(--muted)" }}>
                  Opened {r.openedShort}{r.closedShort ? ` · Closed ${r.closedShort}` : ""}
                </span>
                <svg aria-hidden width={16} height={16} viewBox="0 0 24 24" fill="none" stroke="currentColor"
                  strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round"
                  className={`ml-auto shrink-0 transition-transform${on ? "" : " -rotate-90"}`}
                  style={{ color: "var(--muted)" }}>
                  <path d="M6 9l6 6 6-6" />
                </svg>
              </div>
              <div className="mt-1 text-xs" style={{ color: "var(--muted)" }}>{r.callsSummary}</div>
            </button>
            {on && (
              <div className="border-t px-3 pb-3 pt-2.5" style={{ borderColor: "var(--line)" }}>
                {/* mirrors the field grid on /opportunities/[id] */}
                <div className="grid grid-cols-1 gap-x-8 gap-y-1.5 sm:grid-cols-2">
                  <Detail label="Stage" value={<Badge tone={r.stageTone}>{label(r.stage)}</Badge>} />
                  <Detail label="Opened" value={r.openedFull} />
                  <Detail label="Closed" value={r.closedFull} />
                  <Detail label="Cohort" value={r.cohortDisplay} />
                  <Detail label="First touch" value={label(r.firstTouch)} />
                  <Detail label="Last touch" value={label(r.lastTouch)} />
                  <Detail label="Converting touch" value={label(r.convertingTouch)} />
                  {r.dqReason && <Detail label="DQ reason" value={r.dqReason} />}
                  {r.lostReason && <Detail label="Lost reason" value={r.lostReason} />}
                </div>
                {r.dealValue && (
                  <div className="mt-3 border-t pt-2" style={{ borderColor: "var(--line)" }}>
                    <div className="mb-1 text-xs uppercase tracking-wide" style={{ color: "var(--muted)" }}>Deal</div>
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-semibold">{r.dealValue}</span>
                      <Badge tone={r.dealStatusTone ?? "neutral"}>{label(r.dealStatus)}</Badge>
                    </div>
                  </div>
                )}
                <div className="mt-2 text-xs" style={{ color: "var(--muted)" }}>{r.callsSummary}</div>
                {/* secondary escape hatch; in-app page, so same tab */}
                <div className="mt-3 border-t pt-2" style={{ borderColor: "var(--line)" }}>
                  <Link href={`/opportunities/${r.id}`} className="text-xs font-medium" style={{ color: "var(--accent)" }}>
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
