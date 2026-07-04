// Minimal inline icon set (stroke, 16px) — no icon library dependency.
export function Icon({ name, size = 16 }: { name: string; size?: number }) {
  const p = PATHS[name] ?? PATHS.dot;
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor"
      strokeWidth={1.8} strokeLinecap="round" strokeLinejoin="round" className="shrink-0">
      {p}
    </svg>
  );
}

const PATHS: Record<string, React.ReactNode> = {
  dot: <circle cx="12" cy="12" r="3" />,
  overview: <><rect x="3" y="3" width="7" height="7" rx="1" /><rect x="14" y="3" width="7" height="7" rx="1" /><rect x="3" y="14" width="7" height="7" rx="1" /><rect x="14" y="14" width="7" height="7" rx="1" /></>,
  weekly: <><rect x="3" y="4" width="18" height="17" rx="2" /><path d="M8 2v4M16 2v4M3 10h18" /></>,
  funnel: <path d="M3 4h18l-7 8v6l-4 2v-8L3 4z" />,
  calls: <path d="M4 4h4l2 5-3 2a12 12 0 006 6l2-3 5 2v4a2 2 0 01-2 2A16 16 0 014 6a2 2 0 000-2z" />,
  contacts: <><circle cx="9" cy="8" r="3" /><path d="M4 20a5 5 0 0110 0M17 8h4M19 6v4" /></>,
  reps: <><path d="M3 20a6 6 0 0112 0" /><circle cx="9" cy="7" r="3" /><path d="M16 11l2 2 4-4" /></>,
  money: <><rect x="2" y="6" width="20" height="12" rx="2" /><circle cx="12" cy="12" r="2.5" /></>,
  revenue: <path d="M3 17l6-6 4 4 8-8M21 7v5M21 7h-5" />,
  link: <path d="M9 15l6-6M10 6l1-1a4 4 0 016 6l-1 1M14 18l-1 1a4 4 0 01-6-6l1-1" />,
  marketing: <path d="M3 11l16-6v14L3 13v-2zM3 11v4a2 2 0 002 2h1" />,
  forms: <><rect x="4" y="3" width="16" height="18" rx="2" /><path d="M8 8h8M8 12h8M8 16h5" /></>,
  announce: <path d="M3 11v2a1 1 0 001 1h2l5 4V6L6 10H4a1 1 0 00-1 1zM16 8a4 4 0 010 8" />,
  knowledge: <path d="M4 5a2 2 0 012-2h13v16H6a2 2 0 00-2 2V5zM4 19h15" />,
  connections: <path d="M8 12h8M6 8a3 3 0 100 6M18 10a3 3 0 100 6" />,
  admin: <><circle cx="12" cy="12" r="3" /><path d="M12 2v3M12 19v3M4 12H1M23 12h-3M5 5l2 2M17 17l2 2M19 5l-2 2M7 17l-2 2" /></>,
  settings: <><circle cx="12" cy="12" r="3" /><path d="M19 12a7 7 0 00-.1-1l2-1.5-2-3.5-2.4 1a7 7 0 00-1.7-1l-.3-2.5h-4l-.3 2.5a7 7 0 00-1.7 1l-2.4-1-2 3.5 2 1.5a7 7 0 000 2l-2 1.5 2 3.5 2.4-1a7 7 0 001.7 1l.3 2.5h4l.3-2.5a7 7 0 001.7-1l2.4 1 2-3.5-2-1.5c.06-.3.1-.66.1-1z" /></>,
  eye: <><path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" /><circle cx="12" cy="12" r="3" /></>,
  sun: <><circle cx="12" cy="12" r="4" /><path d="M12 2v2M12 20v2M4 12H2M22 12h-2M5 5l1.5 1.5M17.5 17.5L19 19M19 5l-1.5 1.5M6.5 17.5L5 19" /></>,
  moon: <path d="M21 12.8A9 9 0 1111.2 3a7 7 0 009.8 9.8z" />,
  people: <><circle cx="9" cy="8" r="3" /><path d="M15 8a3 3 0 010 6M3 20a6 6 0 0112 0M15 14a6 6 0 016 6" /></>,
};
