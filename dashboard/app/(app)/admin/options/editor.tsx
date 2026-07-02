"use client";

import { useActionState, useState, useTransition } from "react";
import { addOptionAction, renameOptionAction, toggleOptionAction, moveOptionAction } from "./actions";

type Row = { id: string; name: string; sort_order: number | null; active: boolean };

export function OptionsEditor({ listKey, label, rows }: { listKey: string; label: string; rows: Row[] }) {
  const [addState, addAction, adding] = useActionState(addOptionAction, null as any);
  const [, start] = useTransition();
  const [editing, setEditing] = useState<string | null>(null);
  const [draft, setDraft] = useState("");

  return (
    <div className="card p-4">
      <div className="mb-3 text-sm font-semibold">{label}</div>
      <div className="space-y-1">
        {rows.map((r, i) => (
          <div key={r.id} className="flex items-center gap-2 rounded px-2 py-1 text-sm"
            style={{ background: "var(--panel-2)", opacity: r.active ? 1 : 0.45 }}>
            <div className="flex flex-col">
              <button className="text-[10px] leading-none" style={{ color: "var(--muted)" }} disabled={i === 0}
                onClick={() => start(() => moveOptionAction(listKey, r.id, "up"))}>▲</button>
              <button className="text-[10px] leading-none" style={{ color: "var(--muted)" }} disabled={i === rows.length - 1}
                onClick={() => start(() => moveOptionAction(listKey, r.id, "down"))}>▼</button>
            </div>
            {editing === r.id ? (
              <input autoFocus value={draft} onChange={(e) => setDraft(e.target.value)} className="flex-1 py-0.5"
                onBlur={() => { start(() => renameOptionAction(listKey, r.id, draft)); setEditing(null); }}
                onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur(); }} />
            ) : (
              <button className="flex-1 text-left" title="Click to rename"
                onClick={() => { setEditing(r.id); setDraft(r.name); }}>{r.name}</button>
            )}
            <button className="btn-ghost btn px-2 py-0.5 text-[11px]"
              onClick={() => start(() => toggleOptionAction(listKey, r.id))}>
              {r.active ? "Disable" : "Enable"}
            </button>
          </div>
        ))}
      </div>
      <form action={addAction} className="mt-3 flex gap-2">
        <input type="hidden" name="list" value={listKey} />
        <input name="name" placeholder={`Add to ${label}...`} required />
        <button type="submit" disabled={adding} className="btn shrink-0">Add</button>
      </form>
      {addState && !addState.ok && <div className="mt-2 text-sm" style={{ color: "var(--bad)" }}>{addState.message}</div>}
    </div>
  );
}
