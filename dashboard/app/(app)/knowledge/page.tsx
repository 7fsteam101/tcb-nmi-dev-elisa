import Link from "next/link";
import { sql } from "@/lib/db";
import { requireAccess } from "@/lib/access";
import { requireSession } from "@/lib/auth";
import { Card, SectionTitle, Badge } from "@/components/ui";
import { ArticleEditor } from "./editor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function Knowledge() {
  await requireAccess("overview");
  const user = await requireSession();
  const canWrite = ["admin", "leadership"].includes(user.role);
  const articles = canWrite
    ? await sql`select id, title, category, published, updated_at from core.kb_article order by category nulls last, sort_order nulls last, title`
    : await sql`select id, title, category, published, updated_at from core.kb_article where published order by category nulls last, sort_order nulls last, title`;

  const byCategory = new Map<string, any[]>();
  for (const a of articles) {
    const c = a.category ?? "General";
    if (!byCategory.has(c)) byCategory.set(c, []);
    byCategory.get(c)!.push(a);
  }

  return (
    <div>
      <h1 className="text-xl font-semibold">Knowledge</h1>
      <p className="mb-6 text-sm" style={{ color: "var(--muted)" }}>
        Playbooks, scripts, and SOPs for the team.
      </p>

      {articles.length === 0 && <Card><span style={{ color: "var(--muted)" }}>No articles yet.</span></Card>}

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
        {[...byCategory.entries()].map(([cat, list]) => (
          <div key={cat}>
            <SectionTitle>{cat}</SectionTitle>
            <Card>
              <div className="space-y-1">
                {list.map((a: any) => (
                  <Link key={a.id} href={`/knowledge/${a.id}`} className="flex items-center justify-between rounded px-2 py-1.5 text-sm hover:bg-white/5">
                    <span>{a.title}</span>
                    {!a.published && <Badge tone="neutral">draft</Badge>}
                  </Link>
                ))}
              </div>
            </Card>
          </div>
        ))}
      </div>

      {canWrite && (
        <div className="mt-8 max-w-2xl">
          <SectionTitle>New article</SectionTitle>
          <Card><ArticleEditor /></Card>
        </div>
      )}
    </div>
  );
}
