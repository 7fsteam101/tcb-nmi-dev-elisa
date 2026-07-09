import { sql } from "@/lib/db";
import { requireAccess } from "@/lib/access";
import { isDemoMode, reportTimezone } from "@/lib/settings";
import { money, num } from "@/lib/format";
import { Stat } from "@/components/ui";
import { DealsTable, type DealRow } from "./table";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PAGE_SIZE = 50;

// Real filter values for ?status=. Anything else (including missing) means
// "all", so a stray query string cannot break the page. Mirrors the
// deal_status enum: active / churned / refunded.
const STATUSES = ["active", "churned", "refunded"] as const;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Whitelisted sortable columns -> a fixed SQL order fragment plus the direction
// a first header click uses (dates/money desc). The ?sort param is
// `<field>.<asc|desc>`; the field is looked up here and the direction mapped to
// a fixed fragment below, so raw input never reaches the SQL. Keys mirror the
// client table's COLUMNS exactly.
const SORTS: Record<string, { frag: ReturnType<typeof sql>; first: "asc" | "desc" }> = {
  close_date: { frag: sql`d.deal_close_date`, first: "desc" },
  value: { frag: sql`d.total_contract_value_minor`, first: "desc" },
  collected: { frag: sql`collected_minor`, first: "desc" }, // output-column alias
};

const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default async function Deals({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAccess("receivables");
  const sp = await searchParams;
  const demo = await isDemoMode();
  const tz = await reportTimezone();

  // ---- filters (?q by contact name, ?status, ?closer), all combinable ----
  const q = (first(sp.q) ?? "").trim();
  const pattern = q ? `%${q}%` : null;
  const statusRaw = (first(sp.status) ?? "").trim();
  const status = (STATUSES as readonly string[]).includes(statusRaw) ? statusRaw : null;
  const closerRaw = (first(sp.closer) ?? "").trim();
  const closer = UUID.test(closerRaw) ? closerRaw : null;

  // ---- sort (?sort=<field>.<asc|desc>), server-driven ----
  const [sfRaw = "", sdRaw = ""] = (first(sp.sort) ?? "").split(".");
  const sortEntry = sfRaw in SORTS ? SORTS[sfRaw] : undefined;
  const sortField = sortEntry ? sfRaw : null;
  const sortDir: "asc" | "desc" | null = sortEntry
    ? (sdRaw === "asc" || sdRaw === "desc" ? sdRaw : sortEntry.first)
    : null;
  // no sort param -> newest deals first; d.id is a stable tiebreaker so
  // LIMIT/OFFSET pages never overlap on equal sort keys
  const orderBy = sortEntry
    ? sql`${sortEntry.frag} ${sortDir === "asc" ? sql`asc` : sql`desc`} nulls last, d.id`
    : sql`d.deal_close_date desc nulls last, d.id`;

  // Cash actually collected on a deal: its program payments minus anything a
  // reversal (refund / chargeback) points back at. Booking $25 fees never carry
  // a deal_id, so they are excluded by construction. Embedded as a scalar
  // subquery so the list stays ONE query (no per-row fan-out).
  const collected = sql`(
    select coalesce(sum(p.amount_minor), 0)
    from finance.successful_payment p
    where p.deal_id = d.id
      and not exists (select 1 from finance.reversal v where v.payment_id = p.id))`;

  // one reusable WHERE fragment so the stats and the page query cannot drift
  const where = sql`
    d.is_demo = ${demo}
    and (${pattern}::text is null or ct.full_name ilike ${pattern})
    and (${status}::text is null or d.status::text = ${status})
    and (${closer}::uuid is null or d.closer_rep_id = ${closer}::uuid)`;

  // light pair batched (pooler-safe: well under the 4-connection cap), then the
  // heavier page query runs alone
  const [closerRows, statRows] = await Promise.all([
    sql`select distinct rep.id, rep.full_name
        from sales.deal d join sales.rep rep on rep.id = d.closer_rep_id
        where d.is_demo = ${demo}
        order by rep.full_name`,
    sql`select count(*)::int as filtered,
               coalesce(sum(d.total_contract_value_minor), 0) as contracted_minor,
               coalesce(sum(${collected}), 0) as collected_minor,
               (select count(*) from sales.deal d2 where d2.is_demo = ${demo})::int as total
        from sales.deal d
        left join core.contact ct on ct.id = d.contact_id
        where ${where}`,
  ]);
  const filtered = Number(statRows[0]?.filtered ?? 0);
  const total = Number(statRows[0]?.total ?? 0);
  const contractedMinor = Number(statRows[0]?.contracted_minor ?? 0);
  const collectedMinor = Number(statRows[0]?.collected_minor ?? 0);

  // ---- pagination (?page=N, 1-based), clamped to the filtered result set ----
  const pageRaw = Number.parseInt(first(sp.page) ?? "1", 10);
  const totalPages = Math.max(1, Math.ceil(filtered / PAGE_SIZE));
  const page = Math.min(Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1, totalPages);
  const offset = (page - 1) * PAGE_SIZE;

  const rows = await sql`
    select d.id, d.deal_close_date, d.total_contract_value_minor, d.plan_type_snapshot,
           d.product_type, d.status, d.source, d.contact_id,
           ct.full_name as contact_name, rep.full_name as closer,
           ${collected} as collected_minor
    from sales.deal d
    left join core.contact ct on ct.id = d.contact_id
    left join sales.rep rep on rep.id = d.closer_rep_id
    where ${where}
    order by ${orderBy}
    limit ${PAGE_SIZE} offset ${offset}`;

  // serialize for the client component (Dates -> ISO strings, house pattern)
  const data: DealRow[] = rows.map((r: any) => ({
    id: String(r.id),
    closeDate: r.deal_close_date ? new Date(r.deal_close_date).toISOString() : null,
    contactId: r.contact_id ? String(r.contact_id) : null,
    contactName: r.contact_name ?? null,
    closer: r.closer ?? null,
    valueMinor: Number(r.total_contract_value_minor ?? 0),
    planType: r.plan_type_snapshot ?? null,
    productType: r.product_type ?? null,
    status: r.status ?? null,
    source: r.source ?? null,
    collectedMinor: Number(r.collected_minor ?? 0),
  }));
  const closerOptions = closerRows.map((r: any) => ({ id: String(r.id), name: String(r.full_name) }));

  return (
    <div>
      <h1 className="text-xl font-semibold">Deals</h1>
      <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
        Every closed deal: what was contracted, who closed it, and how much has actually been collected.
        The stats follow the active filters.
      </p>

      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <Stat label="Total deals" value={num(filtered)} tone="accent"
          help="Deals matching the current filters." />
        <Stat label="Total contracted" value={money(contractedMinor)} tone="good"
          help="Sum of total contract value across the filtered deals. A promise, not cash." />
        <Stat label="Collected" value={money(collectedMinor)} tone="good"
          help="Non-reversed payments received on the filtered deals. Refunds and chargebacks are excluded." />
      </div>

      <div className="mt-4">
        <DealsTable
          rows={data}
          tz={tz}
          q={q}
          status={status ?? ""}
          closer={closer ?? ""}
          closerOptions={closerOptions}
          sortField={sortField}
          sortDir={sortDir}
          page={page}
          totalPages={totalPages}
          filteredCount={filtered}
          totalCount={total}
        />
      </div>
    </div>
  );
}
