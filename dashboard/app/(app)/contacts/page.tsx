import { sql } from "@/lib/db";
import { requireAccess } from "@/lib/access";
import { isDemoMode, reportTimezone } from "@/lib/settings";
import { ContactsTable, type ContactRow } from "@/components/contacts-table";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const PAGE_SIZE = 50;

// Whitelisted sortable columns -> a fixed SQL order fragment plus the direction
// a first header click uses (text asc, counts/dates desc). The ?sort param is
// `<field>.<asc|desc>`; the field is looked up here and the direction mapped to
// a fixed fragment below, so raw input never reaches the SQL.
const SORTS: Record<string, { frag: ReturnType<typeof sql>; first: "asc" | "desc" }> = {
  name: { frag: sql`ct.full_name`, first: "asc" },
  email: { frag: sql`ct.primary_email`, first: "asc" },
  phone: { frag: sql`ct.primary_phone`, first: "asc" },
  lifecycle: { frag: sql`ct.lifecycle_status`, first: "asc" },
  owner: { frag: sql`rep.full_name`, first: "asc" },
  opportunities: { frag: sql`opportunities`, first: "desc" }, // output-column alias
  created: { frag: sql`ct.created_at`, first: "desc" },
};

const first = (v: string | string[] | undefined): string | undefined => (Array.isArray(v) ? v[0] : v);

export default async function Contacts({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  await requireAccess("calls");
  const sp = await searchParams;
  const demo = await isDemoMode();
  const tz = await reportTimezone();

  // ---- filters (?q, ?lifecycle, ?has_email, ?has_phone, ?created_from,
  // ?created_to), all combinable ----
  const q = (first(sp.q) ?? "").trim();
  const pattern = q ? `%${q}%` : null;
  const lifecycleRaw = (first(sp.lifecycle) ?? "").trim();
  // parameterized (injection-safe by construction); the shape check just keeps
  // junk values from ever reaching the enum comparison
  const lifecycle = /^[a-z0-9_]{1,64}$/i.test(lifecycleRaw) ? lifecycleRaw : null;
  const hasEmail = first(sp.has_email) === "1";
  const hasPhone = first(sp.has_phone) === "1";
  // created-date range (YYYY-MM-DD, the native date-input format); anything
  // else is ignored so a malformed param can never reach the ::date cast
  const DATE = /^\d{4}-\d{2}-\d{2}$/;
  const createdFromRaw = (first(sp.created_from) ?? "").trim();
  const createdFrom = DATE.test(createdFromRaw) ? createdFromRaw : null;
  const createdToRaw = (first(sp.created_to) ?? "").trim();
  const createdTo = DATE.test(createdToRaw) ? createdToRaw : null;

  // ---- sort (?sort=<field>.<asc|desc>), server-driven ----
  const [sfRaw = "", sdRaw = ""] = (first(sp.sort) ?? "").split(".");
  const sortEntry = sfRaw in SORTS ? SORTS[sfRaw] : undefined;
  const sortField = sortEntry ? sfRaw : null;
  const sortDir: "asc" | "desc" | null = sortEntry
    ? (sdRaw === "asc" || sdRaw === "desc" ? sdRaw : sortEntry.first)
    : null;
  // no sort param -> the existing default ordering (newest first); ct.id is a
  // stable tiebreaker so LIMIT/OFFSET pages never overlap on equal sort keys
  const orderBy = sortEntry
    ? sql`${sortEntry.frag} ${sortDir === "asc" ? sql`asc` : sql`desc`} nulls last, ct.id`
    : sql`ct.created_at desc nulls last, ct.id`;

  // one reusable WHERE fragment so the count and the page query cannot drift
  const where = sql`
    ct.is_demo = ${demo} and ct.merged_into_contact_id is null
    and (${pattern}::text is null
         or ct.full_name ilike ${pattern}
         or ct.primary_email ilike ${pattern}
         or ct.primary_phone ilike ${pattern}
         or exists (select 1 from core.contact_identifier ci where ci.contact_id = ct.id and ci.value ilike ${pattern}))
    and (${lifecycle}::text is null or ct.lifecycle_status::text = ${lifecycle})
    and (${hasEmail} = false or coalesce(ct.primary_email, '') <> '')
    and (${hasPhone} = false or coalesce(ct.primary_phone, '') <> '')
    and (${createdFrom}::date is null or ct.created_at >= ${createdFrom}::date)
    and (${createdTo}::date is null or ct.created_at < ${createdTo}::date + interval '1 day')`;

  // light pair batched (pooler-safe: well under the 4-connection cap), then the
  // heavier page query runs alone
  const [lifecycleRows, countRows] = await Promise.all([
    sql`select distinct ct.lifecycle_status as v from core.contact ct
        where ct.is_demo = ${demo} and ct.merged_into_contact_id is null and ct.lifecycle_status is not null
        order by 1`,
    sql`select count(*)::int as filtered,
               (select count(*) from core.contact c2
                where c2.is_demo = ${demo} and c2.merged_into_contact_id is null)::int as total
        from core.contact ct where ${where}`,
  ]);
  const filtered = Number(countRows[0]?.filtered ?? 0);
  const total = Number(countRows[0]?.total ?? 0);

  // ---- pagination (?page=N, 1-based), clamped to the filtered result set ----
  const pageRaw = Number.parseInt(first(sp.page) ?? "1", 10);
  const totalPages = Math.max(1, Math.ceil(filtered / PAGE_SIZE));
  const page = Math.min(Number.isFinite(pageRaw) && pageRaw > 0 ? pageRaw : 1, totalPages);
  const offset = (page - 1) * PAGE_SIZE;

  const rows = await sql`
    select ct.id, ct.full_name, ct.primary_email, ct.primary_phone, ct.lifecycle_status, ct.created_at,
           rep.full_name as owner,
           (select count(*) from sales.opportunity o where o.contact_id = ct.id)::int as opportunities
    from core.contact ct
    left join sales.rep rep on rep.id = ct.owner_rep_id
    where ${where}
    order by ${orderBy}
    limit ${PAGE_SIZE} offset ${offset}`;

  // serialize for the client component (Dates -> ISO strings, house pattern)
  const data: ContactRow[] = rows.map((c: any) => ({
    id: String(c.id),
    name: c.full_name ?? null,
    email: c.primary_email ?? null,
    phone: c.primary_phone ?? null,
    lifecycle: c.lifecycle_status ?? null,
    owner: c.owner ?? null,
    opportunities: Number(c.opportunities ?? 0),
    created: c.created_at ? new Date(c.created_at).toISOString() : null,
  }));
  const lifecycleOptions = lifecycleRows.map((r: any) => String(r.v));

  return (
    <div>
      <h1 className="text-xl font-semibold">Contacts</h1>
      <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
        Click a name to open the profile. Click a column header to sort; drag its edge to resize.
      </p>
      <ContactsTable
        rows={data}
        tz={tz}
        q={q}
        lifecycle={lifecycle ?? ""}
        hasEmail={hasEmail}
        hasPhone={hasPhone}
        createdFrom={createdFrom ?? ""}
        createdTo={createdTo ?? ""}
        lifecycleOptions={lifecycleOptions}
        sortField={sortField}
        sortDir={sortDir}
        page={page}
        totalPages={totalPages}
        filteredCount={filtered}
        totalCount={total}
      />
    </div>
  );
}
