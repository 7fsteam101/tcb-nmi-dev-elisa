"use client";

import { useActionState, useState, useTransition } from "react";
import { setCalendarTypeAction, toggleCalendarBookingAction, toggleCalendarActiveAction, renameCalendarAction, addCalendarAction } from "./actions";

export function CalendarEditor({ calendars }: { calendars: any[] }) {
  const [state, action, pending] = useActionState(addCalendarAction, null as any);
  const [, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  return (
    <div className="max-w-4xl space-y-4">
      <div className="card p-4">
        <div className="mb-3 text-sm font-semibold">GHL calendars → call type</div>
        <p className="mb-3 text-xs" style={{ color: "var(--muted)" }}>
          Every calendar GHL sends an appointment from shows up here automatically (defaulting to strategy).
          Tracked decides whether a calendar's calls count in the funnel numbers; Paid is only an attribute
          (free bookings still count when tracked). Toggling either re-applies to the calendar's history.
        </p>
        <table>
          <thead><tr><th>Sub-account</th><th>Calendar</th><th>Tracked</th><th>Call type</th><th>Paid booking</th></tr></thead>
          <tbody>
            {calendars.map((c) => (
              <tr key={c.id}>
                <td style={{ color: "var(--muted)" }}>{c.location_id}</td>
                <td>
                  {editing === c.id ? (
                    <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} className="py-0.5"
                      onBlur={() => { start(() => renameCalendarAction(c.id, draft)); setEditing(null); }}
                      onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
                  ) : (
                    <button title="Click to rename" onClick={() => { setEditing(c.id); setDraft(c.calendar_name ?? ""); }}>
                      {c.calendar_name ?? c.calendar_id}
                    </button>
                  )}
                </td>
                <td>
                  <button className="btn-ghost btn px-2 py-0.5 text-[11px]"
                    style={{ color: c.active ? "var(--good)" : "var(--muted)" }}
                    onClick={() => start(() => toggleCalendarActiveAction(c.id))}>
                    {c.active ? "Tracked" : "Off"}
                  </button>
                </td>
                <td>
                  <select value={c.call_type} className="w-auto py-1"
                    onChange={(e) => start(() => setCalendarTypeAction(c.id, e.target.value))}>
                    <option value="readiness">readiness</option>
                    <option value="strategy">strategy</option>
                    <option value="follow_up">follow_up</option>
                  </select>
                </td>
                <td>
                  <button className="btn-ghost btn px-2 py-0.5 text-[11px]" onClick={() => start(() => toggleCalendarBookingAction(c.id))}>
                    {c.is_booking ? "Paid" : "Free"}
                  </button>
                </td>
              </tr>
            ))}
            {calendars.length === 0 && (
              <tr><td colSpan={5} style={{ color: "var(--muted)" }}>
                Nothing yet — calendars appear here automatically as GHL events arrive, or add one manually below.
              </td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="card p-4">
        <div className="mb-3 text-sm font-semibold">Map a calendar manually</div>
        <form action={action} className="flex flex-wrap gap-2">
          <input name="locationId" placeholder="GHL location id" required className="max-w-48" />
          <input name="calendarId" placeholder="Calendar id" required className="max-w-48" />
          <input name="name" placeholder="Name (optional)" className="max-w-48" />
          <select name="callType" defaultValue="strategy" className="w-auto">
            <option value="readiness">readiness</option>
            <option value="strategy">strategy</option>
            <option value="follow_up">follow_up</option>
          </select>
          <button type="submit" disabled={pending} className="btn">Map</button>
        </form>
        {state && <div className="mt-2 text-sm" style={{ color: state.ok ? "var(--good)" : "var(--bad)" }}>{state.message}</div>}
      </div>
    </div>
  );
}
