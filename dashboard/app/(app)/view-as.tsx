"use client";

import { useTransition } from "react";
import { setViewAsAction, clearViewAsAction } from "./view-as-actions";

export function ViewAsSelect({ users, currentId }: { users: { id: string; label: string }[]; currentId: string | null }) {
  const [pending, start] = useTransition();
  return (
    <div className="mb-2">
      <label className="mb-1 block text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>View as</label>
      <select
        value={currentId ?? ""}
        disabled={pending}
        className="py-1 text-xs"
        onChange={(e) => start(() => setViewAsAction(e.target.value))}
      >
        <option value="">Myself (admin)</option>
        {users.map((u) => <option key={u.id} value={u.id}>{u.label}</option>)}
      </select>
    </div>
  );
}

export function ViewAsBanner({ name, role }: { name: string; role: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center justify-center gap-3 px-6 py-1.5 text-xs font-semibold"
      style={{ background: "color-mix(in srgb, var(--accent) 22%, transparent)", color: "var(--accent)" }}>
      Viewing as {name} ({role}) — what you see is exactly their dashboard
      <button onClick={() => start(() => clearViewAsAction())} disabled={pending}
        className="rounded border px-2 py-0.5" style={{ borderColor: "var(--accent)" }}>
        Exit
      </button>
    </div>
  );
}
