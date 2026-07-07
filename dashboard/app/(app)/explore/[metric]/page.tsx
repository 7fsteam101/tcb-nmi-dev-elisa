import Link from "next/link";
import { notFound } from "next/navigation";
import { EXPLORE } from "@/lib/explore";
import { requireAccess } from "@/lib/access";
import { isDemoMode } from "@/lib/settings";
import { money, dateTime, shortDate, num } from "@/lib/format";
import { Card, Badge, STATUS_TONE, label } from "@/components/ui";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Numeric-style columns sit right-aligned with tabular figures so they read as a
// column of numbers rather than ragged text.
const NUMERIC_KINDS = new Set(["money"]);
const NUMERIC_KEYS = new Set(["slots", "seq", "installment_no", "amount_minor", "clicks", "leads", "impressions"]);
const isNumericCol = (c: { key: string; kind?: string }) =>
  (c.kind && NUMERIC_KINDS.has(c.kind)) || NUMERIC_KEYS.has(c.key);

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
        {def.description} Last {days} days. {rows.length === 500 ? "Showing the most recent 500." : `${num(rows.length)} row${rows.length === 1 ? "" : "s"}.`}
      </p>
      <Card className="!p-0">
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                {def.columns.map((c) => (
                  <th key={c.key} className={isNumericCol(c) ? "text-right" : undefined}>{label(c.label)}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.map((r: { [key: string]: unknown }, i: number) => (
                <tr key={i}>
                  {def.columns.map((c) => (
                    <td key={c.key} className={isNumericCol(c) ? "text-right tabular-nums" : undefined}>
                      {renderCell(r[c.key], c.kind, c.key === "contact_name" ? (r.close_id as string | null) : undefined)}
                    </td>
                  ))}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={def.columns.length} className="py-6 text-center" style={{ color: "var(--muted)" }}>
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

function renderCell(value: unknown, kind?: string, contactCloseId?: string | null) {
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
          className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs"
          style={{ color: "var(--accent)", borderColor: `color-mix(in srgb, var(--accent) 35%, transparent)` }}>
          Close &nearr;
        </a>
      );
    default: {
      // The contact-name column links to the lead in Close when a close_id rode
      // along on the row; otherwise it renders as prominent, readable text.
      if (contactCloseId) {
        return (
          <a href={`https://app.close.com/lead/${contactCloseId}/`} target="_blank" rel="noreferrer"
            className="font-medium hover:underline" style={{ color: "var(--text)" }}>
            {String(value)}
          </a>
        );
      }
      return String(value);
    }
  }
}
