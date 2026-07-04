import Link from "next/link";
import { notFound } from "next/navigation";
import { EXPLORE } from "@/lib/explore";
import { requireAccess } from "@/lib/access";
import { isDemoMode } from "@/lib/settings";
import { money, dateTime, shortDate } from "@/lib/format";
import { Card, Badge, STATUS_TONE, label } from "@/components/ui";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The Pulse-style drill-down: every widget links here and shows its rows.
export default async function Explore({
  params, searchParams,
}: {
  params: Promise<{ metric: string }>;
  searchParams: Promise<{ arg?: string; days?: string; title?: string }>;
}) {
  const { metric } = await params;
  const { arg, days: daysRaw, title } = await searchParams;
  const def = EXPLORE[metric];
  if (!def) notFound();
  await requireAccess(def.page);
  const demo = await isDemoMode();
  const days = Math.min(Math.max(parseInt(daysRaw ?? "30", 10) || 30, 1), 365);
  const rows = await def.query(demo, days, arg);

  return (
    <div>
      <div className="mb-1 flex items-center gap-3">
        <Link href={`/${def.page}`} className="text-sm" style={{ color: "var(--accent)" }}>&larr; Back</Link>
        <h1 className="text-xl font-semibold">{title ?? def.title}{arg && !title ? `: ${label(arg)}` : ""}</h1>
      </div>
      <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
        {def.description} Last {days} days. {rows.length === 500 ? "Showing the most recent 500." : `${rows.length} rows.`}
      </p>
      <Card>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>{def.columns.map((c) => <th key={c.key}>{c.label}</th>)}</tr>
            </thead>
            <tbody>
              {rows.map((r: any, i: number) => (
                <tr key={i}>
                  {def.columns.map((c) => <td key={c.key}>{renderCell(r[c.key], c.kind)}</td>)}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={def.columns.length} style={{ color: "var(--muted)" }}>
                  Nothing in range yet — this fills as the connected systems send data.
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}

function renderCell(value: unknown, kind?: string) {
  if (value === null || value === undefined || value === "") return <span style={{ color: "var(--muted)" }}>—</span>;
  switch (kind) {
    case "money": return money(value as number);
    case "datetime": return dateTime(value as string);
    case "date": return shortDate(value as string);
    case "label": {
      const v = String(value);
      return <Badge tone={STATUS_TONE[v] ?? "neutral"}>{label(v)}</Badge>;
    }
    case "close_link":
      return (
        <a href={`https://app.close.com/lead/${value}/`} target="_blank" rel="noreferrer"
          className="text-xs" style={{ color: "var(--accent)" }}>
          Close &nearr;
        </a>
      );
    default: return String(value);
  }
}
