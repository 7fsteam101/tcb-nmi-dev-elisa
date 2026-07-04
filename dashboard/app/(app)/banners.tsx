import Link from "next/link";
import { systemAlerts, activeAnnouncements } from "@/lib/announcements";

const TINT: Record<string, { bg: string; fg: string }> = {
  info: { bg: "color-mix(in srgb, var(--accent) 15%, transparent)", fg: "var(--accent)" },
  success: { bg: "color-mix(in srgb, var(--good) 15%, transparent)", fg: "var(--good)" },
  warning: { bg: "color-mix(in srgb, var(--warn) 16%, transparent)", fg: "var(--warn)" },
  critical: { bg: "color-mix(in srgb, var(--bad) 16%, transparent)", fg: "var(--bad)" },
};

// Slim top bars: live system alerts first, then admin-pinned announcements.
export async function TopBanners() {
  const [alerts, anns] = await Promise.all([systemAlerts(), activeAnnouncements()]);
  const pinned = anns.filter((a: any) => a.pinned_to_banner);
  if (!alerts.length && !pinned.length) return null;
  return (
    <div>
      {alerts.map((a, i) => (
        <Link key={`sa${i}`} href={a.href} className="block px-6 py-1.5 text-center text-xs font-medium hover:underline"
          style={{ background: TINT[a.level].bg, color: TINT[a.level].fg }}>
          {a.text}
        </Link>
      ))}
      {pinned.map((a: any) => (
        <div key={a.id} className="flex items-center justify-center gap-2 px-6 py-1.5 text-center text-xs"
          style={{ background: TINT[a.level].bg, color: TINT[a.level].fg }}>
          <span className="font-semibold">{a.title}</span>
          {a.body && <span className="hidden truncate opacity-90 sm:inline">— {a.body}</span>}
          <Link href="/announcements" className="underline opacity-80">Announcements</Link>
        </div>
      ))}
    </div>
  );
}
