"use client";

import { useActionState } from "react";
import { toggleDemoAction, changePasswordAction, addUserAction } from "./actions";

export function DemoToggle({ demo, isAdmin }: { demo: boolean; isAdmin: boolean }) {
  return (
    <form action={toggleDemoAction}>
      <button type="submit" disabled={!isAdmin} className={demo ? "btn" : "btn btn-ghost"}>
        {demo ? "Demo mode is ON — click to switch to real data" : "Demo mode is OFF — click to show demo data"}
      </button>
    </form>
  );
}

export function ChangePasswordForm() {
  const [state, action, pending] = useActionState(changePasswordAction, null as any);
  return (
    <form action={action} className="space-y-3">
      <input name="current" type="password" placeholder="Current password" required autoComplete="current-password" />
      <input name="next" type="password" placeholder="New password (10+ characters)" required autoComplete="new-password" />
      <button type="submit" disabled={pending} className="btn">{pending ? "Saving..." : "Change password"}</button>
      {state && <div className="text-sm" style={{ color: state.ok ? "var(--good)" : "var(--bad)" }}>{state.message}</div>}
    </form>
  );
}

export function AddUserForm() {
  const [state, action, pending] = useActionState(addUserAction, null as any);
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <input name="name" placeholder="Full name" required />
        <input name="email" type="email" placeholder="Email" required />
      </div>
      <div className="grid grid-cols-2 gap-3">
        <select name="role" defaultValue="closer">
          <option value="admin">Admin</option>
          <option value="leadership">Leadership</option>
          <option value="closer">Closer</option>
          <option value="setter">Setter</option>
          <option value="csm">CSM</option>
        </select>
        <input name="password" type="password" placeholder="Temp password (10+ chars)" required autoComplete="new-password" />
      </div>
      <button type="submit" disabled={pending} className="btn">{pending ? "Adding..." : "Add user"}</button>
      {state && <div className="text-sm" style={{ color: state.ok ? "var(--good)" : "var(--bad)" }}>{state.message}</div>}
    </form>
  );
}
