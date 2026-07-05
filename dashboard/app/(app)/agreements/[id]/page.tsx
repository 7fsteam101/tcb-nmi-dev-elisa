import Link from "next/link";
import { notFound } from "next/navigation";
import { requireAccess } from "@/lib/access";
import { sql } from "@/lib/db";
import { reportTimezone } from "@/lib/settings";
import { money, dateTime } from "@/lib/format";
import { EntityShell } from "@/components/entity-shell";
import { Card, SectionTitle, Badge, label } from "@/components/ui";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

// Agreement status is a text column (draft/sent/signed/declined/voided). Signed is
// the win, sent is in flight, declined / voided are dead, draft is not started.
const AGREEMENT_TONE: Record<string, "good" | "warn" | "bad" | "neutral"> = {
  signed: "good", sent: "warn", declined: "bad", voided: "bad", draft: "neutral",
};
const tone = (s: string | null | undefined) => AGREEMENT_TONE[s ?? ""] ?? "neutral";

function Detail({ label: l, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-baseline gap-2">
      <span className="w-32 shrink-0 text-xs" style={{ color: "var(--muted)" }}>{l}</span>
      <span className="min-w-0 truncate text-sm" style={{ color: "var(--text)" }}>{value || "—"}</span>
    </div>
  );
}

// Contract (agreement) detail: title, status, amount, sent / signed timestamps,
// an external document link, and its source. Links to the signer contact and the
// deal it backs.
export default async function AgreementDetailPage({ params }: { params: Promise<{ id: string }> }) {
  await requireAccess("reps");
  const { id } = await params;
  if (!UUID.test(id)) notFound();
  const tz = await reportTimezone();

  const [a] = await sql`
    select a.id, a.contact_id, a.deal_id, a.title, a.status, a.amount_minor,
           a.sent_at, a.signed_at, a.document_url, a.source,
           ct.full_name as contact_name
    from sales.agreement a
    left join core.contact ct on ct.id = a.contact_id
    where a.id = ${id}`;
  if (!a) notFound();

  return (
    <EntityShell
      kicker="Contract"
      title={a.title ?? "Agreement"}
      subtitle={a.amount_minor != null ? money(a.amount_minor) : undefined}
      badges={<Badge tone={tone(a.status)}>{label(a.status)}</Badge>}
    >
      <SectionTitle>Overview</SectionTitle>
      <Card>
        <div className="grid grid-cols-1 gap-x-8 gap-y-2 sm:grid-cols-2">
          <Detail label="Title" value={a.title} />
          <Detail label="Status" value={label(a.status)} />
          <Detail label="Amount" value={a.amount_minor != null ? money(a.amount_minor) : "—"} />
          <Detail label="Source" value={label(a.source)} />
          <Detail label="Sent" value={a.sent_at ? dateTime(a.sent_at, tz) : "—"} />
          <Detail label="Signed" value={a.signed_at ? dateTime(a.signed_at, tz) : "—"} />
          <Detail
            label="Document"
            value={
              a.document_url ? (
                <a href={a.document_url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--accent)" }}>
                  View document
                </a>
              ) : null
            }
          />
          <Detail
            label="Contact"
            value={
              a.contact_id ? (
                <Link href={`/contacts/${a.contact_id}`} style={{ color: "var(--accent)" }}>
                  {a.contact_name ?? "View contact"}
                </Link>
              ) : null
            }
          />
          <Detail
            label="Deal"
            value={
              a.deal_id ? (
                <Link href={`/deals/${a.deal_id}`} style={{ color: "var(--accent)" }}>
                  View deal
                </Link>
              ) : null
            }
          />
        </div>
      </Card>
    </EntityShell>
  );
}
