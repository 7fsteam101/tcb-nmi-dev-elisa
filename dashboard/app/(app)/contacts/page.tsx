import Link from "next/link";
import { sql } from "@/lib/db";
import { requireAccess } from "@/lib/access";
import { isDemoMode, reportTimezone } from "@/lib/settings";
import { num, shortDate } from "@/lib/format";
import { Card, Badge, label } from "@/components/ui";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LIFECYCLE_TONE: Record<string, "good" | "warn" | "bad" | "neutral" | "accent"> = {
  lead: "neutral", qualified: "accent", customer: "good", do_not_contact: "bad",
};

// Whitelisted sortable columns -> a SQL order fragment (safe; never raw input).
const SORTS: Record<string, ReturnType<typeof sql>> = {
  name: sql`ct.full_name`,
  created: sql`ct.created_at`,
  lifecycle: sql`ct.lifecycle_status`,
  owner: sql`rep.full_name`,
  opportunities: sql`opportunities`,
};
const TEXT_COLS = new Set(["name", "owner", "lifecycle"]);

export default async function Contacts({
  searchParams,
}: {
  searchParams: Promise<{ q?: string; sort?: string; dir?: string }>;
}) {
  await requireAccess("calls");
  const sp = await searchParams;
  const demo = await isDemoMode();
  const tz = await reportTimezone();
  const query = (sp.q ?? "").trim();
  const pattern = query ? `%${query}%` : null;
  const sort = sp.sort && sp.sort in SORTS ? sp.sort : "created";
  const dirRaw = sp.dir === "asc" ? "asc" : sp.dir === "desc" ? "desc" : (TEXT_COLS.has(sort) ? "asc" : "desc");
  const orderCol = SORTS[sort];
  const orderDir = dirRaw === "asc" ? sql`asc` : sql`desc`;

  const rows = await sql`
    select ct.id, ct.full_name, ct.primary_email, ct.primary_phone, ct.lifecycle_status, ct.created_at,
           rep.full_name as owner,
           (select count(*) from sales.opportunity o where o.contact_id = ct.id) as opportunities
    from core.contact ct
    left join sales.rep rep on rep.id = ct.owner_rep_id
    where ct.is_demo = ${demo} and ct.merged_into_contact_id is null
      and (${pattern}::text is null
           or ct.full_name ilike ${pattern}
           or ct.primary_email ilike ${pattern}
           or ct.primary_phone ilike ${pattern}
           or exists (select 1 from core.contact_identifier ci where ci.contact_id = ct.id and ci.value ilike ${pattern}))
    order by ${orderCol} ${orderDir} nulls last
    limit 50`;

  // sortable header: links to the same view with this column's sort toggled
  const Th = ({ col, children, right }: { col: string; children: React.ReactNode; right?: boolean }) => {
    const active = sort === col;
    const nextDir = active ? (dirRaw === "asc" ? "desc" : "asc") : (TEXT_COLS.has(col) ? "asc" : "desc");
    const p = new URLSearchParams();
    if (query) p.set("q", query);
    p.set("sort", col); p.set("dir", nextDir);
    return (
      <th className={right ? "text-right" : ""}>
        <Link href={`/contacts?${p.toString()}`} className="inline-flex items-center gap-1"
          style={{ color: active ? "var(--text)" : "var(--muted)" }}>
          {children}{active ? <span style={{ color: "var(--accent)" }}>{dirRaw === "asc" ? "▲" : "▼"}</span> : null}
        </Link>
      </th>
    );
  };

  return (
    <div>
      <h1 className="text-xl font-semibold">Contacts</h1>
      <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
        {query
          ? `${rows.length} match${rows.length === 1 ? "" : "es"}${rows.length === 50 ? " (first 50)" : ""}.`
          : "Most recent 50. Click a name to open the profile; click a column to sort."}
      </p>

      <form method="get" action="/contacts" className="mb-4 flex max-w-lg gap-2">
        <input name="q" defaultValue={query} placeholder="Name, email or phone" aria-label="Search contacts" />
        <button type="submit" className="btn">Search</button>
      </form>

      <Card>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <Th col="name">Name</Th>
                <th>Email</th>
                <th>Phone</th>
                <Th col="lifecycle">Lifecycle</Th>
                <Th col="owner">Owner</Th>
                <Th col="opportunities" right>Opps</Th>
                <Th col="created">Created</Th>
              </tr>
            </thead>
            <tbody>
              {rows.map((c: any) => (
                <tr key={c.id}>
                  <td>
                    <Link href={`/contacts/${c.id}`} className="font-medium" style={{ color: "var(--accent)" }}>
                      {c.full_name}
                    </Link>
                  </td>
                  <td style={{ color: "var(--muted)" }}>{c.primary_email ?? "—"}</td>
                  <td style={{ color: "var(--muted)" }}>{c.primary_phone ?? "—"}</td>
                  <td><Badge tone={LIFECYCLE_TONE[c.lifecycle_status] ?? "neutral"}>{label(c.lifecycle_status)}</Badge></td>
                  <td>{c.owner ?? "—"}</td>
                  <td className="text-right">{num(c.opportunities)}</td>
                  <td style={{ color: "var(--muted)" }}>{shortDate(c.created_at, tz)}</td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={7} style={{ color: "var(--muted)" }}>{query ? "No contacts match" : "No contacts yet"}</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
