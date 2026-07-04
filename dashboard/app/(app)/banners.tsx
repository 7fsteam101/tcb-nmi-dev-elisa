import Link from "next/link";
import type { SystemAlert } from "@/lib/announcements";

const TINT: Record<string, { bg: string; fg: string }> = {
  info: { bg: "color-mix(in srgb, var(--accent) 15%, transparent)", fg: "var(--accent)" },
  success: { bg: "color-mix(in srgb, var(--good) 15%, transparent)", fg: "var(--good)" },
  warning: { bg: "color-mix(in srgb, var(--warn) 16%, transparent)", fg: "var(--warn)" },
  critical: { bg: "color-mix(in srgb, var(--bad) 16%, transparent)", fg: "var(--bad)" },
};

// Pure component — data comes from the shell's single query (no query here).
export function TopBanners({ alerts, pinned }: { alerts: SystemAlert[]; pinned: any[] }) {
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
          style={{ background: TINT[a.level]?.bg ?? TINT.info.bg, color: TINT[a.level]?.fg ?? TINT.info.fg }}>
          <span className="font-semibold">{a.title}</span>
          {a.body && <span className="hidden truncate opacity-90 sm:inline">— {a.body}</span>}
          <Link href="/announcements" className="underline opacity-80">Announcements</Link>
        </div>
      ))}
    </div>
  );
}
