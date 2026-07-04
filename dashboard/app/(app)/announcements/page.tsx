import { requireAccess } from "@/lib/access";
import { requireSession } from "@/lib/auth";
import { allAnnouncements, activeAnnouncements } from "@/lib/announcements";
import { dateTime } from "@/lib/format";
import { Card, SectionTitle, Badge, label } from "@/components/ui";
import { Composer, RowActions, LevelBadge } from "./composer";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function Announcements() {
  await requireAccess("overview");
  const user = await requireSession();
  const canWrite = ["admin", "leadership"].includes(user.role);
  const list = canWrite ? await allAnnouncements() : await activeAnnouncements();

  return (
    <div>
      <h1 className="text-xl font-semibold">Announcements</h1>
      <p className="mb-6 text-sm" style={{ color: "var(--muted)" }}>
        {canWrite ? "Post updates for the team. Pinned announcements appear as a banner across the app." : "Team updates."}
      </p>

      {canWrite && (
        <div className="mb-6">
          <SectionTitle>New announcement</SectionTitle>
          <Card><Composer /></Card>
        </div>
      )}

      <SectionTitle>{canWrite ? "All announcements" : "Latest"}</SectionTitle>
      <div className="space-y-2">
        {list.map((a: any) => (
          <Card key={a.id} className={a.active === false ? "opacity-50" : ""}>
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-semibold">{a.title}</span>
                  <LevelBadge level={a.level} />
                  {a.pinned_to_banner && <Badge tone="accent">pinned</Badge>}
                  {a.active === false && <Badge tone="neutral">inactive</Badge>}
                </div>
                {a.body && <div className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{a.body}</div>}
                <div className="mt-1.5 flex items-center gap-1.5">
                  <span className="text-[11px]" style={{ color: "var(--muted)" }}>Audience:</span>
                  {Array.isArray(a.audience_roles) && a.audience_roles.length > 0
                    ? a.audience_roles.map((r: string) => <Badge key={r} tone="neutral">{label(r)}</Badge>)
                    : <Badge tone="accent">Everyone</Badge>}
                </div>
                <div className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>
                  {a.author ?? "System"} · {dateTime(a.created_at)}
                </div>
              </div>
              {canWrite && <RowActions id={a.id} active={a.active !== false} pinned={a.pinned_to_banner} />}
            </div>
          </Card>
        ))}
        {list.length === 0 && <Card><span style={{ color: "var(--muted)" }}>No announcements yet</span></Card>}
      </div>
    </div>
  );
}
