"use client";

import { useState, useTransition } from "react";
import { Icon } from "@/components/icons";
import { setViewAsAction, clearViewAsAction } from "./view-as-actions";

type U = { id: string; label: string };

// Prominent top-bar control: an admin picks a role or a specific user to preview.
export function ViewAsControl({ users, current }: { users: U[]; current: string | null }) {
  const [open, setOpen] = useState(false);
  const [pending, start] = useTransition();
  const ROLES = [
    { id: "role:leadership", label: "Leadership" },
    { id: "role:closer", label: "Closer" },
    { id: "role:setter", label: "Setter" },
    { id: "role:csm", label: "CSM" },
  ];
  const pick = (id: string) => { setOpen(false); start(() => setViewAsAction(id)); };

  return (
    <div className="relative">
      <button onClick={() => setOpen((o) => !o)} disabled={pending}
        className="flex items-center gap-1.5 rounded-lg border px-2.5 py-1 text-xs"
        style={{ borderColor: "var(--line)", color: "var(--muted)", background: "var(--panel)" }}>
        <Icon name="eye" size={14} /> View as
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" onClick={() => setOpen(false)} />
          <div className="absolute right-0 z-20 mt-1 w-56 overflow-hidden rounded-lg border py-1 text-sm shadow-lg"
            style={{ borderColor: "var(--line)", background: "var(--panel)" }}>
            <button onClick={() => pick("")} className="block w-full px-3 py-1.5 text-left hover:bg-white/5" style={{ color: "var(--text)" }}>
              Myself (admin)
            </button>
            <div className="px-3 pb-1 pt-2 text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>Preview a role</div>
            {ROLES.map((r) => (
              <button key={r.id} onClick={() => pick(r.id)} className="block w-full px-3 py-1.5 text-left hover:bg-white/5"
                style={{ color: current === r.id ? "var(--accent)" : "var(--muted)" }}>{r.label}</button>
            ))}
            {users.length > 0 && (
              <>
                <div className="px-3 pb-1 pt-2 text-[10px] uppercase tracking-wide" style={{ color: "var(--muted)" }}>Specific user</div>
                {users.map((u) => (
                  <button key={u.id} onClick={() => pick(u.id)} className="block w-full px-3 py-1.5 text-left hover:bg-white/5"
                    style={{ color: current === u.id ? "var(--accent)" : "var(--muted)" }}>{u.label}</button>
                ))}
              </>
            )}
          </div>
        </>
      )}
    </div>
  );
}

export function ViewAsBanner({ name, role }: { name: string; role: string }) {
  const [pending, start] = useTransition();
  return (
    <div className="flex items-center justify-center gap-3 px-6 py-1.5 text-xs font-semibold"
      style={{ background: "color-mix(in srgb, var(--accent) 22%, transparent)", color: "var(--accent)" }}>
      Previewing as {name} — this is exactly their view
      <button onClick={() => start(() => clearViewAsAction())} disabled={pending}
        className="rounded border px-2 py-0.5" style={{ borderColor: "var(--accent)" }}>
        Exit preview
      </button>
    </div>
  );
}
