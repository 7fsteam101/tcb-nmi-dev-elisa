import Link from "next/link";
import { requireAccess } from "@/lib/access";
import { requireSession } from "@/lib/auth";
import { sql } from "@/lib/db";
import { isDemoMode, reportTimezone } from "@/lib/settings";
import { money, shortDate } from "@/lib/format";
import { Card, Stat, SectionTitle, Badge, label } from "@/components/ui";
import { ProgressRing } from "@/components/charts";
import { StatusFilter, RowStatusUpdater } from "./controls";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

// Which ?status= values are real filters. Anything else (including missing)
// falls back to "all" so a stray query string cannot break the page.
const STATUSES = ["signed", "sent", "declined", "draft", "voided"] as const;
type StatusFilterKey = (typeof STATUSES)[number] | "all";

// Badge tone per agreement status. Signed is the win (good), sent is in flight
// (warn), declined / voided are dead (bad), draft is not started (neutral).
const AGREEMENT_TONE: Record<string, "good" | "warn" | "bad" | "neutral"> = {
  signed: "good",
  sent: "warn",
  declined: "bad",
  voided: "bad",
  draft: "neutral",
};

type SummaryRow = {
  total: string | number;
  signed: string | number;
  sent: string | number;
  declined: string | number;
  draft: string | number;
  voided: string | number;
};

type AgreementRow = {
  id: string;
  title: string | null;
  status: string;
  amount_minor: string | number | null;
  sent_at: string | null;
  signed_at: string | null;
  document_url: string | null;
  contact_id: string | null;
  contact_name: string | null;
};

export default async function Contracts({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>;
}) {
  await requireAccess("reps");
  const user = await requireSession();
  const canEdit = user.role === "admin" || user.role === "leadership";

  const { status: statusRaw } = await searchParams;
  const filter: StatusFilterKey =
    statusRaw && (STATUSES as readonly string[]).includes(statusRaw)
      ? (statusRaw as StatusFilterKey)
      : "all";

  // Sequential, low-concurrency reads (this page issues a few queries on top of
  // the layout shell): one aggregate for the cards, one list for the table, plus
  // the report timezone. No Promise.all fan-out.
  const demo = await isDemoMode();
  const tz = await reportTimezone();

  const [summary] = (await sql`
    select
      count(*) as total,
      count(*) filter (where status = 'signed') as signed,
      count(*) filter (where status = 'sent') as sent,
      count(*) filter (where status = 'declined') as declined,
      count(*) filter (where status = 'draft') as draft,
      count(*) filter (where status = 'voided') as voided
    from sales.agreement
    where is_demo = ${demo}`) as unknown as SummaryRow[];

  // The list respects the active filter. "all" leaves the status predicate off
  // (still passing a value keeps the fragment shape safe — no bare arrays).
  const rows = (await sql`
    select a.id, a.title, a.status, a.amount_minor, a.sent_at, a.signed_at, a.document_url,
           c.id as contact_id, c.full_name as contact_name
    from sales.agreement a
    left join core.contact c on c.id = a.contact_id
    where a.is_demo = ${demo}
      and (${filter} = 'all' or a.status = ${filter})
    order by
      coalesce(a.signed_at, a.sent_at, a.updated_at, a.created_at) desc nulls last
    limit 300`) as unknown as AgreementRow[];

  const total = Number(summary?.total ?? 0);
  const signed = Number(summary?.signed ?? 0);
  const sent = Number(summary?.sent ?? 0);
  const signedRate = signed + sent > 0 ? signed / (signed + sent) : null;

  return (
    <div>
      <div className="mb-1 flex flex-wrap items-start justify-between gap-3">
        <h1 className="text-xl font-semibold">Contracts</h1>
      </div>
      <p className="mb-1 text-sm" style={{ color: "var(--muted)" }}>
        Agreements sent for signature and the deals that closed. Signed rate is signed over signed plus sent.
      </p>
      <p className="mb-6 text-[12px]" style={{ color: "var(--muted)" }}>
        A contract tool (PandaDoc, DocuSign, or GHL) can sync into this later. Today it reflects deals that signed plus
        contracts that were sent.
      </p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat
          label="Total agreements"
          value={total.toLocaleString("en-US")}
          help="Every agreement on record: signed, sent, declined, draft, or voided."
        />
        <Stat
          label="Signed"
          value={signed.toLocaleString("en-US")}
          tone="good"
          help="Agreements marked signed."
        />
        <Stat
          label="Awaiting signature"
          value={sent.toLocaleString("en-US")}
          tone="warn"
          help="Sent for signature and not yet signed."
        />
        <Card>
          <div className="text-xs" style={{ color: "var(--muted)" }}>
            Signed rate
          </div>
          {signedRate != null ? (
            <div className="mt-2 flex items-center gap-3">
              <ProgressRing value={signedRate} label={`${signed} of ${signed + sent}`} size={72} />
              <div className="text-xs" style={{ color: "var(--muted)" }}>
                Signed over signed plus sent
              </div>
            </div>
          ) : (
            <div className="mt-2 text-sm" style={{ color: "var(--muted)" }}>
              No signed or sent agreements yet
            </div>
          )}
        </Card>
      </div>

      <SectionTitle right={<StatusFilter active={filter} />}>Agreements</SectionTitle>
      <Card>
        <div className="overflow-x-auto">
          <table>
            <thead>
              <tr>
                <th>Contact</th>
                <th>Title</th>
                <th>Status</th>
                <th className="text-right">Amount</th>
                <th>Sent</th>
                <th>Signed</th>
                <th>Document</th>
                {canEdit && <th className="text-right">Update</th>}
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td>
                    {r.contact_id ? (
                      <Link href={`/contacts/${r.contact_id}`} style={{ color: "var(--accent)" }}>
                        {r.contact_name ?? "View contact"}
                      </Link>
                    ) : (
                      <span style={{ color: "var(--muted)" }}>{r.contact_name ?? "—"}</span>
                    )}
                  </td>
                  <td>{r.title ?? "—"}</td>
                  <td>
                    <Badge tone={AGREEMENT_TONE[r.status] ?? "neutral"}>{label(r.status)}</Badge>
                  </td>
                  <td className="text-right">{money(r.amount_minor)}</td>
                  <td>{shortDate(r.sent_at, tz)}</td>
                  <td>{shortDate(r.signed_at, tz)}</td>
                  <td>
                    {r.document_url ? (
                      <a
                        href={r.document_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        style={{ color: "var(--accent)" }}
                      >
                        View
                      </a>
                    ) : (
                      <span style={{ color: "var(--muted)" }}>—</span>
                    )}
                  </td>
                  {canEdit && (
                    <td className="text-right">
                      <RowStatusUpdater id={r.id} status={r.status} />
                    </td>
                  )}
                </tr>
              ))}
              {rows.length === 0 && (
                <tr>
                  <td colSpan={canEdit ? 8 : 7} style={{ color: "var(--muted)" }}>
                    No agreements{filter === "all" ? "" : ` with status ${label(filter)}`} yet
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </Card>
    </div>
  );
}
