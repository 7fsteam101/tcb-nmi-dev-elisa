import { sql } from "./db";

// Active announcements within their show window, pinned first.
export async function activeAnnouncements() {
  return sql`
    select a.id, a.title, a.body, a.level, a.pinned_to_banner, a.starts_at, a.ends_at,
           a.created_at, u.full_name as author
    from core.announcement a
    left join core.app_user u on u.id = a.created_by_user_id
    where a.active
      and (a.starts_at is null or a.starts_at <= now())
      and (a.ends_at is null or a.ends_at >= now())
    order by a.pinned_to_banner desc, a.created_at desc`;
}

export async function allAnnouncements() {
  return sql`
    select a.id, a.title, a.body, a.level, a.pinned_to_banner, a.active, a.starts_at, a.ends_at,
           a.created_at, u.full_name as author
    from core.announcement a
    left join core.app_user u on u.id = a.created_by_user_id
    order by a.created_at desc`;
}

// Live system alerts computed from the data — the "something is off" banners.
export type SystemAlert = { level: "warning" | "critical"; text: string; href: string };

// ONE query for everything the app shell needs on every page: the pending-calls
// badge count, the system alerts, and the pinned banner announcements. Cutting
// the shell from ~4 queries to 1 is the biggest per-page connection saving we
// control on the shared (free-tier) pooler.
export async function shellSignals(): Promise<{ pendingCalls: number; alerts: SystemAlert[]; pinned: any[] }> {
  const [row] = await sql`
    select
      (select count(*)::int from sync.connections where status = 'error' or last_error is not null) as conn_err,
      (select count(*)::int from sales.appointment where is_current and status in ('scheduled','confirmed') and scheduled_for <= now()) as pending,
      (select count(*)::int from sales.appointment where is_current and status = 'pending_rebook') as rebook,
      (select coalesce(json_agg(row_to_json(x) order by x.created_at desc), '[]'::json) from (
        select a.id, a.title, a.body, a.level, a.created_at from core.announcement a
        where a.active and a.pinned_to_banner
          and (a.starts_at is null or a.starts_at <= now())
          and (a.ends_at is null or a.ends_at >= now())) x) as pinned`;
  const alerts: SystemAlert[] = [];
  if (row?.conn_err > 0) alerts.push({ level: "critical", text: "A data source has a sync error — check Connections", href: "/connections" });
  if (row?.pending > 0) alerts.push({ level: "warning", text: `${row.pending} call${row.pending === 1 ? "" : "s"} need attendance marking`, href: "/calls?status=pending" });
  if (row?.rebook > 0) alerts.push({ level: "warning", text: `${row.rebook} reschedule${row.rebook === 1 ? "" : "s"} have no new date set`, href: "/calls" });
  return { pendingCalls: Number(row?.pending ?? 0), alerts, pinned: row?.pinned ?? [] };
}
