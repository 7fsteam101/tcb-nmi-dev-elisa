"use client";

import Link from "next/link";
import { ReactNode, useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge, label } from "@/components/ui";
import { money, num, pct, shortDate } from "@/lib/format";

// Client half of the Deals list. The server page owns the data (search, status
// and closer filters, sort and pagination all run in SQL); this component owns
// the URL (every control is a router.push that rewrites the query string) plus
// the filter bar chrome. Same pattern as components/contacts-table.tsx.

export type DealRow = {
  id: string;
  closeDate: string | null; // ISO string (serialized server-side)
  contactId: string | null;
  contactName: string | null;
  closer: string | null;
  valueMinor: number;
  planType: string | null;
  productType: string | null;
  status: string | null;
  source: string | null;
  collectedMinor: number;
};

type SortDir = "asc" | "desc";
type SortKey = "close_date" | "value" | "collected";

// Mirrors the server's STATUSES whitelist exactly.
const STATUS_OPTIONS = ["active", "churned", "refunded"] as const;

// Deal status is its own small vocabulary: active is the healthy state,
// refunded is lost money, churned is a warning.
const DEAL_TONE: Record<string, "good" | "warn" | "bad" | "neutral"> = {
  active: "good", refunded: "bad", churned: "warn",
};

type Col = {
  key: string;
  label: string;
  right?: boolean;
  sort?: SortKey; // present only on the server-whitelisted sortable columns
  first?: SortDir; // direction of the first click (dates/money desc)
};

const COLUMNS: Col[] = [
  { key: "close_date", label: "Close date", sort: "close_date", first: "desc" },
  { key: "contact", label: "Contact" },
  { key: "closer", label: "Closer" },
  { key: "value", label: "Total value", right: true, sort: "value", first: "desc" },
  { key: "plan", label: "Plan" },
  { key: "product", label: "Product" },
  { key: "status", label: "Status" },
  { key: "source", label: "Source" },
  { key: "collected", label: "Collected", right: true, sort: "collected", first: "desc" },
  { key: "open", label: "Open", right: true },
];

type Props = {
  rows: DealRow[];
  tz: string;
  q: string;
  status: string;
  closer: string;
  closerOptions: { id: string; name: string }[];
  sortField: string | null;
  sortDir: SortDir | null;
  page: number;
  totalPages: number;
  filteredCount: number;
  totalCount: number;
};

type NavState = { q: string; status: string; closer: string; sort: string | null; page: number };

export function DealsTable({
  rows, tz, q, status, closer, closerOptions,
  sortField, sortDir, page, totalPages, filteredCount, totalCount,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // search box: local text, applied on submit (server-side ?q=)
  const [qInput, setQInput] = useState(q);
  useEffect(() => setQInput(q), [q]);

  // ---- URL state: every control rewrites the query string ----
  function navigate(next: Partial<NavState>) {
    const s: NavState = {
      q, status, closer,
      sort: sortField && sortDir ? `${sortField}.${sortDir}` : null,
      page,
      ...next,
    };
    const p = new URLSearchParams();
    if (s.q) p.set("q", s.q);
    if (s.status) p.set("status", s.status);
    if (s.closer) p.set("closer", s.closer);
    if (s.sort) p.set("sort", s.sort);
    if (s.page > 1) p.set("page", String(s.page));
    const qs = p.toString();
    startTransition(() => router.push(qs ? `/deals?${qs}` : "/deals", { scroll: false }));
  }

  // header click cycles: first direction -> opposite -> clear (default order)
  function onSortClick(c: Col) {
    if (!c.sort || !c.first) return;
    let sort: string | null;
    if (sortField !== c.sort) sort = `${c.sort}.${c.first}`;
    else if (sortDir === c.first) sort = `${c.sort}.${c.first === "asc" ? "desc" : "asc"}`;
    else sort = null;
    navigate({ sort, page: 1 });
  }

  const activeFilters = [q !== "", status !== "", closer !== ""].filter(Boolean).length;
  const filtersActive = activeFilters > 0;
  const countLine = filtersActive
    ? `${num(filteredCount)} of ${num(totalCount)} deals`
    : `${num(filteredCount)} deal${filteredCount === 1 ? "" : "s"}`;

  return (
    <Card className="!p-0">
      {/* filter bar: contact search (?q=), status (?status=), closer (?closer=) */}
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5" style={{ borderColor: "var(--line)" }}>
        <form
          onSubmit={(e) => { e.preventDefault(); navigate({ q: qInput.trim(), page: 1 }); }}
          className="flex items-center gap-2"
        >
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Contact name"
            aria-label="Search deals by contact name"
            className="!w-48 !py-1.5 text-sm"
          />
          <button type="submit" className="btn !py-1.5 text-sm">Search</button>
        </form>
        <select
          value={status}
          onChange={(e) => navigate({ status: e.target.value, page: 1 })}
          aria-label="Filter by deal status"
          className="!w-auto !py-1.5 text-sm"
        >
          <option value="">All statuses</option>
          {STATUS_OPTIONS.map((v) => <option key={v} value={v}>{label(v)}</option>)}
        </select>
        <select
          value={closer}
          onChange={(e) => navigate({ closer: e.target.value, page: 1 })}
          aria-label="Filter by closer"
          className="!w-auto !py-1.5 text-sm"
        >
          <option value="">All closers</option>
          {closerOptions.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        {filtersActive && (
          <button
            type="button"
            onClick={() => { setQInput(""); navigate({ q: "", status: "", closer: "", page: 1 }); }}
            className="rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-white/5"
            style={{ color: "var(--muted)", borderColor: "var(--line)" }}
          >
            Clear ({activeFilters})
          </button>
        )}
        <span className="ml-auto whitespace-nowrap text-xs" style={{ color: "var(--muted)" }}>{countLine}</span>
      </div>

      <div className="overflow-x-auto" style={{ opacity: pending ? 0.6 : 1, transition: "opacity 120ms" }}>
        <table>
          <thead>
            <tr>
              {COLUMNS.map((c) => {
                const sortable = Boolean(c.sort);
                const active = sortable && sortField === c.sort;
                return (
                  <th
                    key={c.key}
                    onClick={sortable ? () => onSortClick(c) : undefined}
                    title={sortable ? "Sort" : undefined}
                    aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
                    className={`${sortable ? "cursor-pointer select-none" : ""} ${c.right ? "text-right" : ""}`}
                  >
                    <span className="inline-flex items-center gap-1" style={active ? { color: "var(--text)" } : undefined}>
                      {c.label}
                      {active && <span style={{ color: "var(--accent)" }}>{sortDir === "asc" ? <>&uarr;</> : <>&darr;</>}</span>}
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const collectedPct = r.valueMinor > 0 ? r.collectedMinor / r.valueMinor : null;
              return (
                <tr key={r.id}>
                  <td className="whitespace-nowrap">{shortDate(r.closeDate, tz)}</td>
                  <td className="max-w-[180px] truncate" title={r.contactName ?? undefined}>
                    {r.contactId ? (
                      <Link href={`/contacts/${r.contactId}#opt-ins`} className="hover:underline" style={{ color: "var(--accent)" }}>
                        {r.contactName ?? "View contact"}
                      </Link>
                    ) : (
                      <span style={{ color: "var(--muted)" }}>{r.contactName ?? "—"}</span>
                    )}
                  </td>
                  <td className="truncate" title={r.closer ?? undefined}>{r.closer ?? "—"}</td>
                  <td className="num text-right">{money(r.valueMinor)}</td>
                  <td><Badge tone="accent">{label(r.planType)}</Badge></td>
                  <td style={{ color: "var(--muted)" }}>{label(r.productType)}</td>
                  <td><Badge tone={DEAL_TONE[r.status ?? ""] ?? "neutral"}>{label(r.status)}</Badge></td>
                  <td style={{ color: "var(--muted)" }}>{label(r.source)}</td>
                  <td className="num whitespace-nowrap text-right">
                    {money(r.collectedMinor)}
                    <span className="ml-1.5 text-[11px]" style={{ color: "var(--muted)" }}>
                      {collectedPct != null ? pct(collectedPct, 0) : "—"}
                    </span>
                  </td>
                  <td className="text-right">
                    <Link href={`/deals/${r.id}`} style={{ color: "var(--accent)" }}>View</Link>
                  </td>
                </tr>
              );
            })}
            {rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="py-6 text-center" style={{ color: "var(--muted)" }}>
                  {filtersActive ? "No deals match these filters" : "No deals yet"}
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between border-t px-3 py-2" style={{ borderColor: "var(--line)" }}>
          <span className="text-xs" style={{ color: "var(--muted)" }}>Page {num(page)} of {num(totalPages)}</span>
          <div className="flex gap-2">
            <PageBtn disabled={page <= 1 || pending} onClick={() => navigate({ page: page - 1 })}>Previous</PageBtn>
            <PageBtn disabled={page >= totalPages || pending} onClick={() => navigate({ page: page + 1 })}>Next</PageBtn>
          </div>
        </div>
      )}
    </Card>
  );
}

function PageBtn({ disabled, onClick, children }: { disabled: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" className="btn btn-ghost !py-1 text-xs" disabled={disabled} onClick={onClick}>
      {children}
    </button>
  );
}
