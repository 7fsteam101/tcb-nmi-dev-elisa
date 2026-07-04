"use client";

import { useActionState, useTransition } from "react";
import { createAnnouncementAction, toggleAnnouncementAction } from "./actions";
import { Badge } from "@/components/ui";

export function Composer() {
  const [state, action, pending] = useActionState(createAnnouncementAction, null as any);
  return (
    <form action={action} className="space-y-3">
      <input name="title" placeholder="Announcement title" required />
      <textarea name="body" rows={2} placeholder="Optional details" />
      <div className="flex flex-wrap items-center gap-3">
        <select name="level" defaultValue="info" className="w-auto">
          <option value="info">Info</option>
          <option value="success">Success</option>
          <option value="warning">Warning</option>
          <option value="critical">Critical</option>
        </select>
        <label className="flex items-center gap-1.5 text-sm"><input type="checkbox" name="pinned" /> Pin to top banner</label>
        <button type="submit" disabled={pending} className="btn">{pending ? "Posting..." : "Post announcement"}</button>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="text-xs" style={{ color: "var(--muted)" }}>Show from<input name="starts" type="datetime-local" /></label>
        <label className="text-xs" style={{ color: "var(--muted)" }}>Hide after<input name="ends" type="datetime-local" /></label>
      </div>
      {state && <div className="text-sm" style={{ color: state.ok ? "var(--good)" : "var(--bad)" }}>{state.message}</div>}
    </form>
  );
}

export function RowActions({ id, active, pinned }: { id: string; active: boolean; pinned: boolean }) {
  const [, start] = useTransition();
  return (
    <div className="flex gap-2">
      <button className="btn-ghost btn px-2 py-0.5 text-[11px]" onClick={() => start(() => toggleAnnouncementAction(id, "pinned_to_banner"))}>
        {pinned ? "Unpin" : "Pin"}
      </button>
      <button className="btn-ghost btn px-2 py-0.5 text-[11px]" onClick={() => start(() => toggleAnnouncementAction(id, "active"))}>
        {active ? "Deactivate" : "Reactivate"}
      </button>
    </div>
  );
}

export function LevelBadge({ level }: { level: string }) {
  const tone = level === "critical" ? "bad" : level === "warning" ? "warn" : level === "success" ? "good" : "accent";
  return <Badge tone={tone as never}>{level}</Badge>;
}
