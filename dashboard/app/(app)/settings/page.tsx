import Link from "next/link";
import { requireSession } from "@/lib/auth";
import { isDemoMode, reportTimezone } from "@/lib/settings";
import { Card, SectionTitle } from "@/components/ui";
import { DemoToggle, ChangePasswordForm } from "./forms";

export const dynamic = "force-dynamic";

export default async function Settings() {
  const user = await requireSession();
  const demo = await isDemoMode();
  const tz = await reportTimezone();

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
            <SectionTitle>Users</SectionTitle>
            <Card>
              <p className="mb-3 text-sm" style={{ color: "var(--muted)" }}>
                Logins, roles, and per-page access live in the admin panel.
              </p>
              <Link href="/admin/users" className="btn inline-block">Manage users & access</Link>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}
