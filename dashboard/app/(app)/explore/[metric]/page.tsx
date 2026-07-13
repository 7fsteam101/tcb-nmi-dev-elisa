import Link from "next/link";
import { notFound } from "next/navigation";
import { EXPLORE } from "@/lib/explore";
import { requireAccess } from "@/lib/access";
import { isDemoMode, reportTimezone } from "@/lib/settings";
import { num } from "@/lib/format";
import { label } from "@/components/ui";
import { ExploreTable, type ExploreRow } from "@/components/explore-table";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// The Pulse-style drill-down: every widget links here and shows its rows.
// Fetching stays on the server; the rows are serialized (Dates to ISO strings)
// and handed to the client table, which owns search, sorting, and grouping.
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
  const tz = await reportTimezone();
  const days = Math.min(Math.max(parseInt(daysRaw ?? "30", 10) || 30, 1), 365);
  const raw = await def.query(demo, days, arg);
  const rows: ExploreRow[] = raw.map((r: Record<string, unknown>) => {
    const out: ExploreRow = {};
    for (const [k, v] of Object.entries(r)) {
      out[k] = v instanceof Date ? v.toISOString() : (v as ExploreRow[string]);
    }
    return out;
  });

  return (
    <div>
      <div className="mb-1 flex items-center gap-3">
        <Link href={`/${def.page}`} className="text-sm" style={{ color: "var(--accent)" }}>&larr; Back</Link>
        <h1 className="text-xl font-semibold">{title ?? def.title}{arg && !title ? `: ${label(arg)}` : ""}</h1>
      </div>
      <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
        {def.description} Last {days} days. {rows.length === 500 ? "Showing the most recent 500." : `${num(rows.length)} row${rows.length === 1 ? "" : "s"}.`}
      </p>
      <ExploreTable columns={def.columns} rows={rows} tz={tz} />
    </div>
  );
}
