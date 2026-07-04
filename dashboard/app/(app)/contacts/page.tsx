import Link from "next/link";
import { sql } from "@/lib/db";
import { requireAccess } from "@/lib/access";
import { isDemoMode } from "@/lib/settings";
import { num } from "@/lib/format";
import { Card, Badge, label } from "@/components/ui";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const LIFECYCLE_TONE: Record<string, "good" | "warn" | "bad" | "neutral" | "accent"> = {
  lead: "neutral", qualified: "accent", customer: "good", do_not_contact: "bad",
};

export default async function Contacts({
  searchParams,
}: {
  searchParams: Promise<{ q?: string }>;
}) {
  await requireAccess("calls");
  const { q } = await searchParams;
  const demo = await isDemoMode();
  const query = (q ?? "").trim();
  const pattern = query ? `%${query}%` : null;

  const rows = await sql`
    select ct.id, ct.full_name, ct.primary_email, ct.primary_phone, ct.lifecycle_status,
           rep.full_name as owner,
           (select count(*) from sales.opportunity o where o.contact_id = ct.id) as opportunities
    from core.contact ct
    left join sales.rep rep on rep.id = ct.owner_rep_id
    where ct.is_demo = ${demo} and ct.merged_into_contact_id is null
      and (${pattern}::text is null
           or ct.full_name ilike ${pattern}
           or ct.primary_email ilike ${pattern}
           or ct.primary_phone ilike ${pattern}
           or exists (select 1 from core.contact_identifier ci
                      where ci.contact_id = ct.id and ci.value ilike ${pattern}))
    order by ct.created_at desc
    limit 50`;

  return (
    <div>
      <h1 className="text-xl font-semibold">Contacts</h1>
      <p className="mb-4 text-sm" style={{ color: "var(--muted)" }}>
        {query
          ? `${rows.length} match${rows.length === 1 ? "" : "es"}${rows.length === 50 ? " (first 50)" : ""}.`
          : "Most recent 50. Search covers names, emails and phones, including extra identifiers."}
      </p>

      <form method="get" action="/contacts" className="mb-4 flex max-w-lg gap-2">
        <input name="q" defaultValue={query} placeholder="Name, email or phone" aria-label="Search contacts" />
        <button type="submit" className="btn">Search</button>
      </form>

      <Card>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr><th>Name</th><th>Email</th><th>Phone</th><th>Lifecycle</th><th>Owner</th><th>Opportunities</th><th></th></tr>
            </thead>
            <tbody>
              {rows.map((c: any) => (
                <tr key={c.id}>
                  <td>{c.full_name}</td>
                  <td style={{ color: "var(--muted)" }}>{c.primary_email ?? "—"}</td>
                  <td style={{ color: "var(--muted)" }}>{c.primary_phone ?? "—"}</td>
                  <td><Badge tone={LIFECYCLE_TONE[c.lifecycle_status] ?? "neutral"}>{label(c.lifecycle_status)}</Badge></td>
                  <td>{c.owner ?? "—"}</td>
                  <td>{num(c.opportunities)}</td>
                  <td>
                    <Link href={`/contacts/${c.id}`} className="text-xs" style={{ color: "var(--accent)" }}>
                      Open &rarr;
                    </Link>
                  </td>
                </tr>
              ))}
              {rows.length === 0 && (
                <tr><td colSpan={7} style={{ color: "var(--muted)" }}>
                  {query ? "No contacts match" : "No contacts yet"}
                </td></tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
