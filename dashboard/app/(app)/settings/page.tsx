import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { isDemoMode, reportTimezone } from "@/lib/settings";
import { Card, SectionTitle, Badge, label } from "@/components/ui";
import { DemoToggle, ChangePasswordForm, AddUserForm } from "./forms";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const user = await requireSession();
  const demo = await isDemoMode();
  const tz = await reportTimezone();
  const users = await sql`select email, full_name, role, active, last_login_at from core.app_user order by created_at`;

  return (
    <div>
      <h1 className="text-xl font-semibold">Settings</h1>
      <p className="mb-6 text-sm" style={{ color: "var(--muted)" }}>Signed in as {user.name} ({user.role})</p>

      <SectionTitle>Data mode</SectionTitle>
      <Card>
        <p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>
          Demo mode shows obviously fake sample data so every widget can be verified. Real mode shows only synced data.
        </p>
        <DemoToggle demo={demo} isAdmin={user.role === "admin"} />
      </Card>

      <SectionTitle>Reporting timezone</SectionTitle>
      <Card>
        <p className="text-sm">
          All daily numbers bucket in <span className="font-semibold">{tz}</span>.
          <span style={{ color: "var(--muted)" }}> Pending client confirmation of the Meta ad-account timezone — flagged in the approvals doc.</span>
        </p>
      </Card>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        <div>
          <SectionTitle>Change my password</SectionTitle>
          <Card><ChangePasswordForm /></Card>
        </div>
        {user.role === "admin" && (
          <div>
            <SectionTitle>Add a user</SectionTitle>
            <Card><AddUserForm /></Card>
          </div>
        )}
      </div>

      <SectionTitle>Logins</SectionTitle>
      <Card>
        <table>
          <thead><tr><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Last login</th></tr></thead>
          <tbody>
            {users.map((u: any) => (
              <tr key={u.email}>
                <td>{u.full_name}</td>
                <td>{u.email}</td>
                <td className="capitalize">{label(u.role)}</td>
                <td><Badge tone={u.active ? "good" : "neutral"}>{u.active ? "active" : "disabled"}</Badge></td>
                <td style={{ color: "var(--muted)" }}>{u.last_login_at ? new Date(u.last_login_at).toLocaleString("en-US") : "never"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </Card>
    </div>
  );
}
