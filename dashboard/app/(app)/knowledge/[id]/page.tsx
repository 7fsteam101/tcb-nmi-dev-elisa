import Link from "next/link";
import { notFound } from "next/navigation";
import { sql } from "@/lib/db";
import { requireAccess } from "@/lib/access";
import { requireSession } from "@/lib/auth";
import { Card, Badge } from "@/components/ui";
import { dateTime } from "@/lib/format";
import { MarkdownLite } from "@/components/markdown-lite";
import { ArticleEditor, EditToggle } from "../editor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function Article({ params }: { params: Promise<{ id: string }> }) {
  await requireAccess("overview");
  const user = await requireSession();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();

  const [a] = await sql`
    select k.id, k.title, k.category, k.body, k.published, k.updated_at, u.full_name as editor
    from core.kb_article k left join core.app_user u on u.id = k.updated_by_user_id where k.id = ${id}`;
  if (!a) notFound();
  const canWrite = ["admin", "leadership"].includes(user.role);
  if (!a.published && !canWrite) notFound();

  const view = (
    <Card>
      <div className="mb-3 flex items-center gap-2">
        <h1 className="text-lg font-semibold">{a.title}</h1>
        {a.category && <Badge tone="accent">{a.category}</Badge>}
        {!a.published && <Badge tone="neutral">draft</Badge>}
      </div>
      <MarkdownLite text={a.body || "_Empty_"} />
      <div className="mt-4 text-[11px]" style={{ color: "var(--muted)" }}>
        {a.editor ? `Last edited by ${a.editor} · ${dateTime(a.updated_at)}` : dateTime(a.updated_at)}
      </div>
    </Card>
  );

  return (
    <div className="max-w-3xl">
      <Link href="/knowledge" className="mb-3 inline-block text-sm" style={{ color: "var(--accent)" }}>&larr; Knowledge</Link>
      {canWrite
        ? <EditToggle editor={<Card><ArticleEditor article={{ id: a.id, title: a.title, category: a.category, body: a.body, published: a.published }} /></Card>}>{view}</EditToggle>
        : view}
    </div>
  );
}
