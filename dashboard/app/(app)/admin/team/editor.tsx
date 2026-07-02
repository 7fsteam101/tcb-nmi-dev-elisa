"use client";

import { useActionState, useTransition } from "react";
import { addRepAction, toggleRepAction, setRepRoleAction } from "./actions";

const ROLES = ["setter", "closer", "hybrid", "csm", "admin"];

export function TeamEditor({ reps }: { reps: any[] }) {
  const [state, action, pending] = useActionState(addRepAction, null as any);
  const [, start] = useTransition();

  return (
    <div className="max-w-3xl">
      <div className="card p-4">
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th></th></tr></thead>
          <tbody>
            {reps.map((r) => (
              <tr key={r.id} style={{ opacity: r.active ? 1 : 0.45 }}>
                <td>{r.full_name}</td>
                <td style={{ color: "var(--muted)" }}>{r.email ?? "—"}</td>
                <td>
                  <select value={r.role} className="w-auto py-1"
                    onChange={(e) => start(() => setRepRoleAction(r.id, e.target.value))}>
                    {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
                  </select>
                </td>
                <td>{r.active ? "active" : "disabled"}</td>
                <td className="text-right">
                  <button className="btn-ghost btn px-2 py-0.5 text-[11px]" onClick={() => start(() => toggleRepAction(r.id))}>
                    {r.active ? "Disable" : "Enable"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="card mt-4 p-4">
        <div className="mb-3 text-sm font-semibold">Add a team member</div>
        <form action={action} className="flex flex-wrap gap-2">
          <input name="name" placeholder="Full name" required className="max-w-52" />
          <input name="email" type="email" placeholder="Email (optional)" className="max-w-60" />
          <select name="role" defaultValue="closer" className="w-auto">
            {ROLES.map((role) => <option key={role} value={role}>{role}</option>)}
          </select>
          <button type="submit" disabled={pending} className="btn">Add</button>
        </form>
        {state && <div className="mt-2 text-sm" style={{ color: state.ok ? "var(--good)" : "var(--bad)" }}>{state.message}</div>}
        <p className="mt-3 text-xs" style={{ color: "var(--muted)" }}>
          This is the sales-team list the forms and reports use. Dashboard logins are separate — add those in Settings.
        </p>
      </div>
    </div>
  );
}
