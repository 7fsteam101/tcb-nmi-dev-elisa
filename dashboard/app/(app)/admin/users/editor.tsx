"use client";

import { useActionState, useState, useTransition } from "react";
import { PAGES, PAGE_LABELS, ROLE_DEFAULTS, effectivePages, type PageKey } from "@/lib/access-rules";
import {
  addUserAction, toggleUserActiveAction, setUserRoleAction, setUserRepAction,
  setNotesVisibilityAction, setPageOverrideAction, clearOverridesAction, resetPasswordAction,
} from "./actions";

const ROLES = ["admin", "leadership", "closer", "setter", "csm"];

export function UsersEditor({ users, reps, meId }: { users: any[]; reps: any[]; meId: string }) {
  const [addState, addAction, adding] = useActionState(addUserAction, null as any);
  const [pwState, pwAction, pwPending] = useActionState(resetPasswordAction, null as any);
  const [, start] = useTransition();
  const [expanded, setExpanded] = useState<string | null>(null);

  return (
    <div className="max-w-5xl space-y-4">
      <div className="card p-4">
        <div className="mb-1 text-sm font-semibold">Logins & access</div>
        <p className="mb-3 text-xs" style={{ color: "var(--muted)" }}>
          The role sets the default pages; click a user to fine-tune page access with per-page toggles.
          Admins always see everything (plus Connections and this panel).
          The Notes checkbox controls whether that user sees contact notes and their attachments.
        </p>
        <table>
          <thead><tr><th></th><th>Name</th><th>Email</th><th>Role</th><th>Linked rep</th><th>Pages</th><th>Notes</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {users.map((u) => {
              const pages = u.role === "admin" ? [...PAGES] : effectivePages(u.role, u.page_overrides);
              const overridden = Object.keys(u.page_overrides ?? {}).length > 0;
              return (
                <FragmentRow key={u.id} u={u} pages={pages} overridden={overridden} reps={reps} meId={meId}
                  expanded={expanded === u.id} onExpand={() => setExpanded(expanded === u.id ? null : u.id)} start={start} />
              );
            })}
          </tbody>
        </table>
      </div>

      <div className="card p-4">
        <div className="mb-3 text-sm font-semibold">Add a user</div>
        <form action={addAction} className="flex flex-wrap gap-2">
          <input name="name" placeholder="Full name" required className="max-w-48" />
          <input name="email" type="email" placeholder="Email" required className="max-w-56" />
          <select name="role" defaultValue="closer" className="w-auto">
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
          <select name="repId" defaultValue="" className="w-auto">
            <option value="">No linked rep</option>
            {reps.map((r: any) => <option key={r.id} value={r.id}>{r.full_name}</option>)}
          </select>
          <input name="password" type="password" placeholder="Temp password (10+ chars)" required className="max-w-52" autoComplete="new-password" />
          <button type="submit" disabled={adding} className="btn">Add user</button>
        </form>
        {addState && <div className="mt-2 text-sm" style={{ color: addState.ok ? "var(--good)" : "var(--bad)" }}>{addState.message}</div>}
      </div>

      <div className="card p-4">
        <div className="mb-3 text-sm font-semibold">Reset a password</div>
        <form action={pwAction} className="flex flex-wrap gap-2">
          <select name="userId" required defaultValue="" className="w-auto">
            <option value="" disabled>Pick the user</option>
            {users.map((u) => <option key={u.id} value={u.id}>{u.full_name}</option>)}
          </select>
          <input name="password" type="password" placeholder="New temp password" required className="max-w-52" autoComplete="new-password" />
          <button type="submit" disabled={pwPending} className="btn">Reset</button>
        </form>
        {pwState && <div className="mt-2 text-sm" style={{ color: pwState.ok ? "var(--good)" : "var(--bad)" }}>{pwState.message}</div>}
      </div>
    </div>
  );
}

function FragmentRow({ u, pages, overridden, reps, meId, expanded, onExpand, start }: any) {
  return (
    <>
      <tr style={{ opacity: u.active ? 1 : 0.45 }}>
        <td><button onClick={onExpand} className="text-xs" style={{ color: "var(--accent)" }}>{expanded ? "close" : "access"}</button></td>
        <td>{u.full_name}{u.id === meId && <span className="ml-1 text-[10px]" style={{ color: "var(--muted)" }}>(you)</span>}</td>
        <td style={{ color: "var(--muted)" }}>{u.email}</td>
        <td>
          <select value={u.role} className="w-auto py-1" disabled={u.id === meId}
            onChange={(e) => start(() => setUserRoleAction(u.id, e.target.value))}>
            {ROLES.map((r) => <option key={r} value={r}>{r}</option>)}
          </select>
        </td>
        <td>
          <select value={u.rep_id ?? ""} className="w-auto py-1"
            onChange={(e) => start(() => setUserRepAction(u.id, e.target.value))}>
            <option value="">—</option>
            {reps.map((r: any) => <option key={r.id} value={r.id}>{r.full_name}</option>)}
          </select>
        </td>
        <td className="text-xs" style={{ color: "var(--muted)" }}>
          {u.role === "admin" ? "all" : `${pages.length}/${PAGES.length}${overridden ? " (custom)" : ""}`}
        </td>
        <td>
          {/* per-user notes visibility (core.app_user.can_view_notes): same
              instant-save interaction as the role/rep controls */}
          <input type="checkbox" checked={u.can_view_notes !== false}
            aria-label={`${u.full_name} can see contact notes`}
            title="Can this user see contact notes and their attachments?"
            onChange={() => start(() => setNotesVisibilityAction(u.id, u.can_view_notes === false))} />
        </td>
        <td>{u.active ? "active" : "disabled"}</td>
        <td className="text-right">
          <button className="btn-ghost btn px-2 py-0.5 text-[11px]" disabled={u.id === meId}
            onClick={() => start(() => toggleUserActiveAction(u.id))}>
            {u.active ? "Disable" : "Enable"}
          </button>
        </td>
      </tr>
      {expanded && u.role !== "admin" && (
        <tr>
          <td colSpan={9} style={{ background: "var(--panel-2)" }}>
            <div className="flex flex-wrap items-center gap-3 p-2">
              {PAGES.map((p: PageKey) => {
                const on = pages.includes(p);
                const isDefault = (ROLE_DEFAULTS[u.role] ?? []).includes(p);
                return (
                  <label key={p} className="flex cursor-pointer items-center gap-1.5 text-sm">
                    <input type="checkbox" checked={on}
                      onChange={() => start(() => setPageOverrideAction(u.id, p, !on))} />
                    {PAGE_LABELS[p]}
                    {on !== isDefault && <span className="text-[10px]" style={{ color: "var(--warn)" }}>override</span>}
                  </label>
                );
              })}
              {overridden && (
                <button className="btn-ghost btn px-2 py-0.5 text-[11px]" onClick={() => start(() => clearOverridesAction(u.id))}>
                  Reset to role default
                </button>
              )}
            </div>
          </td>
        </tr>
      )}
      {expanded && u.role === "admin" && (
        <tr><td colSpan={9} style={{ background: "var(--panel-2)" }}>
          <div className="p-2 text-sm" style={{ color: "var(--muted)" }}>Admins always have full access.</div>
        </td></tr>
      )}
    </>
  );
}
