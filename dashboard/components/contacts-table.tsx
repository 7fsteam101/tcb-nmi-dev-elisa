"use client";

import Link from "next/link";
import { ReactNode, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Card, Badge, InfoTip, label } from "@/components/ui";
import { num, shortDate } from "@/lib/format";

// Client half of the Contacts list. The server page owns the data (search,
// filters, sort and pagination all run in SQL); this component owns the URL
// (every control is a router.push that rewrites the query string) plus the
// purely visual bits: sticky header row, drag-to-resize columns persisted to
// localStorage, and the filter bar chrome.

export type ContactRow = {
  id: string;
  name: string | null;
  email: string | null;
  phone: string | null;
  lifecycle: string | null;
  owner: string | null;
  opportunities: number;
  created: string | null; // ISO string (serialized server-side)
};

type SortDir = "asc" | "desc";
type ColKey = "name" | "email" | "phone" | "lifecycle" | "owner" | "opportunities" | "created";

type Col = {
  key: ColKey;
  label: string;
  width: number; // default px, user-resizable down to MIN_WIDTH
  right?: boolean;
  first: SortDir; // direction of the first click (text asc, counts/dates desc)
  help?: string;
};

// Keys mirror the server's whitelisted SORTS map exactly; the ?sort param is
// always `<key>.<asc|desc>` built from these, never free text.
const COLUMNS: Col[] = [
  { key: "name", label: "Name", width: 200, first: "asc" },
  { key: "email", label: "Email", width: 230, first: "asc" },
  { key: "phone", label: "Phone", width: 150, first: "asc" },
  { key: "lifecycle", label: "Lifecycle", width: 140, first: "asc" },
  {
    key: "owner", label: "Owner", width: 160, first: "asc",
    help: "The contact's assigned rep, mirrored from Close lead ownership. Empty when the Close lead has no owner.",
  },
  { key: "opportunities", label: "Opps", width: 90, right: true, first: "desc" },
  { key: "created", label: "Created", width: 120, first: "desc" },
];

const WIDTHS_KEY = "tcb_contact_col_widths";
const MIN_WIDTH = 80;

const LIFECYCLE_TONE: Record<string, "good" | "warn" | "bad" | "neutral" | "accent"> = {
  lead: "neutral", qualified: "accent", customer: "good", do_not_contact: "bad",
};

type Props = {
  rows: ContactRow[];
  tz: string;
  q: string;
  lifecycle: string;
  hasEmail: boolean;
  hasPhone: boolean;
  createdFrom: string; // YYYY-MM-DD or "" (?created_from=)
  createdTo: string;   // YYYY-MM-DD or "" (?created_to=)
  lifecycleOptions: string[];
  sortField: string | null;
  sortDir: SortDir | null;
  page: number;
  totalPages: number;
  filteredCount: number;
  totalCount: number;
};

type NavState = {
  q: string; lifecycle: string; hasEmail: boolean; hasPhone: boolean;
  createdFrom: string; createdTo: string; sort: string | null; page: number;
};

export function ContactsTable({
  rows, tz, q, lifecycle, hasEmail, hasPhone, createdFrom, createdTo, lifecycleOptions,
  sortField, sortDir, page, totalPages, filteredCount, totalCount,
}: Props) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // search box: local text, applied on submit (server-side ?q=)
  const [qInput, setQInput] = useState(q);
  useEffect(() => setQInput(q), [q]);

  // created-date range: local mirrors so the inputs never snap back while the
  // route transition is pending; a change navigates immediately
  const [fromInput, setFromInput] = useState(createdFrom);
  useEffect(() => setFromInput(createdFrom), [createdFrom]);
  const [toInput, setToInput] = useState(createdTo);
  useEffect(() => setToInput(createdTo), [createdTo]);

  // ---- column widths (drag handles on header edges, persisted) ----
  const [widths, setWidths] = useState<Record<ColKey, number>>(
    () => Object.fromEntries(COLUMNS.map((c) => [c.key, c.width])) as Record<ColKey, number>,
  );
  const widthsRef = useRef(widths);
  useEffect(() => {
    // restore after mount (never during SSR render, so hydration stays clean)
    try {
      const raw = localStorage.getItem(WIDTHS_KEY);
      if (!raw) return;
      const saved = JSON.parse(raw) as Record<string, unknown>;
      const next = { ...widthsRef.current };
      for (const c of COLUMNS) {
        const v = saved[c.key];
        if (typeof v === "number" && Number.isFinite(v)) next[c.key] = Math.max(MIN_WIDTH, Math.round(v));
      }
      widthsRef.current = next;
      setWidths(next);
    } catch { /* corrupted storage: keep defaults */ }
  }, []);

  const drag = useRef<{ key: ColKey; startX: number; startW: number } | null>(null);
  // a drag ending over the header would otherwise fire the header's sort click
  const didResize = useRef(false);

  function startResize(e: React.MouseEvent, key: ColKey) {
    e.preventDefault();
    e.stopPropagation();
    drag.current = { key, startX: e.clientX, startW: widthsRef.current[key] };
    const prevCursor = document.body.style.cursor;
    const prevSelect = document.body.style.userSelect;
    document.body.style.cursor = "col-resize";
    document.body.style.userSelect = "none";
    const move = (ev: MouseEvent) => {
      const d = drag.current;
      if (!d) return;
      const w = Math.max(MIN_WIDTH, Math.round(d.startW + ev.clientX - d.startX));
      if (widthsRef.current[d.key] === w) return;
      didResize.current = true;
      widthsRef.current = { ...widthsRef.current, [d.key]: w };
      setWidths(widthsRef.current);
    };
    const up = () => {
      window.removeEventListener("mousemove", move);
      window.removeEventListener("mouseup", up);
      document.body.style.cursor = prevCursor;
      document.body.style.userSelect = prevSelect;
      drag.current = null;
      try { localStorage.setItem(WIDTHS_KEY, JSON.stringify(widthsRef.current)); } catch { /* storage unavailable */ }
      // clear after the click event that follows mouseup has been (dis)counted
      setTimeout(() => { didResize.current = false; }, 0);
    };
    window.addEventListener("mousemove", move);
    window.addEventListener("mouseup", up);
  }

  // ---- URL state: every control rewrites the query string ----
  function navigate(next: Partial<NavState>) {
    const s: NavState = {
      q, lifecycle, hasEmail, hasPhone, createdFrom, createdTo,
      sort: sortField && sortDir ? `${sortField}.${sortDir}` : null,
      page,
      ...next,
    };
    const p = new URLSearchParams();
    if (s.q) p.set("q", s.q);
    if (s.lifecycle) p.set("lifecycle", s.lifecycle);
    if (s.hasEmail) p.set("has_email", "1");
    if (s.hasPhone) p.set("has_phone", "1");
    if (s.createdFrom) p.set("created_from", s.createdFrom);
    if (s.createdTo) p.set("created_to", s.createdTo);
    if (s.sort) p.set("sort", s.sort);
    if (s.page > 1) p.set("page", String(s.page));
    const qs = p.toString();
    startTransition(() => router.push(qs ? `/contacts?${qs}` : "/contacts", { scroll: false }));
  }

  // header click cycles: first direction -> opposite -> clear (default order)
  function onSortClick(c: Col) {
    if (didResize.current) return;
    let sort: string | null;
    if (sortField !== c.key) sort = `${c.key}.${c.first}`;
    else if (sortDir === c.first) sort = `${c.key}.${c.first === "asc" ? "desc" : "asc"}`;
    else sort = null;
    navigate({ sort, page: 1 });
  }

  // back to the top of the list whenever the underlying result set changes
  const scrollRef = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (scrollRef.current) scrollRef.current.scrollTop = 0;
  }, [page, sortField, sortDir, q, lifecycle, hasEmail, hasPhone, createdFrom, createdTo]);

  const activeFilters = [q !== "", lifecycle !== "", hasEmail, hasPhone, createdFrom !== "", createdTo !== ""].filter(Boolean).length;
  const filtersActive = activeFilters > 0;
  const countLine = filtersActive
    ? `${num(filteredCount)} of ${num(totalCount)} contacts`
    : `${num(filteredCount)} contact${filteredCount === 1 ? "" : "s"}`;

  const totalWidth = COLUMNS.reduce((s, c) => s + widths[c.key], 0);

  return (
    <Card className="!p-0">
      {/* filter bar: text search (?q=), lifecycle (?lifecycle=), presence toggles */}
      <div className="flex flex-wrap items-center gap-2 border-b px-3 py-2.5" style={{ borderColor: "var(--line)" }}>
        <form
          onSubmit={(e) => { e.preventDefault(); navigate({ q: qInput.trim(), page: 1 }); }}
          className="flex items-center gap-2"
        >
          <input
            value={qInput}
            onChange={(e) => setQInput(e.target.value)}
            placeholder="Name, email or phone"
            aria-label="Search contacts"
            className="!w-56 !py-1.5 text-sm"
          />
          <button type="submit" className="btn !py-1.5 text-sm">Search</button>
        </form>
        <select
          value={lifecycle}
          onChange={(e) => navigate({ lifecycle: e.target.value, page: 1 })}
          aria-label="Filter by lifecycle"
          className="!w-auto !py-1.5 text-sm"
        >
          <option value="">All lifecycles</option>
          {lifecycleOptions.map((v) => <option key={v} value={v}>{label(v)}</option>)}
        </select>
        <Toggle active={hasEmail} onClick={() => navigate({ hasEmail: !hasEmail, page: 1 })}>Has email</Toggle>
        <Toggle active={hasPhone} onClick={() => navigate({ hasPhone: !hasPhone, page: 1 })}>Has phone</Toggle>
        <span className="flex items-center gap-1.5 text-xs" style={{ color: "var(--muted)" }}>
          Created
          <input
            type="date"
            value={fromInput}
            max={toInput || undefined}
            onChange={(e) => { setFromInput(e.target.value); navigate({ createdFrom: e.target.value, page: 1 }); }}
            aria-label="Created from"
            className="!w-auto !py-1 text-xs"
          />
          to
          <input
            type="date"
            value={toInput}
            min={fromInput || undefined}
            onChange={(e) => { setToInput(e.target.value); navigate({ createdTo: e.target.value, page: 1 }); }}
            aria-label="Created to"
            className="!w-auto !py-1 text-xs"
          />
        </span>
        {filtersActive && (
          <button
            type="button"
            onClick={() => { setQInput(""); setFromInput(""); setToInput(""); navigate({ q: "", lifecycle: "", hasEmail: false, hasPhone: false, createdFrom: "", createdTo: "", page: 1 }); }}
            className="rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-white/5"
            style={{ color: "var(--muted)", borderColor: "var(--line)" }}
          >
            Clear ({activeFilters})
          </button>
        )}
        <span className="ml-auto whitespace-nowrap text-xs" style={{ color: "var(--muted)" }}>{countLine}</span>
      </div>

      {/* the table scrolls inside this container, so the sticky header row
          (top: 0 within it) stays visible however deep the list goes */}
      <div
        ref={scrollRef}
        className="overflow-auto"
        style={{ maxHeight: "max(320px, calc(100vh - 280px))", opacity: pending ? 0.6 : 1, transition: "opacity 120ms" }}
      >
        {/* border-collapse separate: with collapse, the sticky header's bottom
            border would stay behind while the cells float; fixed layout makes
            the <col> widths (and so the drag-resize) authoritative */}
        <table style={{ tableLayout: "fixed", width: totalWidth, borderCollapse: "separate", borderSpacing: 0 }}>
          <colgroup>
            {COLUMNS.map((c) => <col key={c.key} style={{ width: widths[c.key] }} />)}
          </colgroup>
          <thead>
            <tr>
              {COLUMNS.map((c) => {
                const active = sortField === c.key;
                return (
                  <th
                    key={c.key}
                    onClick={() => onSortClick(c)}
                    title="Sort"
                    aria-sort={active ? (sortDir === "asc" ? "ascending" : "descending") : undefined}
                    className={`cursor-pointer select-none ${c.right ? "text-right" : ""}`}
                    style={{ position: "sticky", top: 0, zIndex: 2, background: "var(--panel)" }}
                  >
                    <span className="inline-flex items-center gap-1" style={active ? { color: "var(--text)" } : undefined}>
                      {c.label}
                      {c.help && (
                        <span onClick={(e) => e.stopPropagation()}><InfoTip text={c.help} /></span>
                      )}
                      {active && <span style={{ color: "var(--accent)" }}>{sortDir === "asc" ? <>&uarr;</> : <>&darr;</>}</span>}
                    </span>
                    {/* drag handle: thin grab area on the column's right edge */}
                    <span
                      aria-hidden
                      onMouseDown={(e) => startResize(e, c.key)}
                      onClick={(e) => e.stopPropagation()}
                      className="absolute inset-y-0 right-0 w-1.5 cursor-col-resize hover:bg-white/5"
                      style={{ zIndex: 3 }}
                    />
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="truncate" title={r.name ?? undefined}>
                  <Link href={`/contacts/${r.id}`} className="font-medium hover:underline" style={{ color: "var(--accent)" }}>
                    {r.name ?? "—"}
                  </Link>
                </td>
                <td className="truncate" title={r.email ?? undefined} style={{ color: "var(--muted)" }}>{r.email ?? "—"}</td>
                <td className="truncate" title={r.phone ?? undefined} style={{ color: "var(--muted)" }}>{r.phone ?? "—"}</td>
                <td className="truncate">
                  <Badge tone={LIFECYCLE_TONE[r.lifecycle ?? ""] ?? "neutral"}>{label(r.lifecycle)}</Badge>
                </td>
                <td className="truncate" title={r.owner ?? undefined}>{r.owner ?? "—"}</td>
                <td className="text-right tabular-nums">{num(r.opportunities)}</td>
                <td className="truncate" style={{ color: "var(--muted)" }}>{shortDate(r.created, tz)}</td>
              </tr>
            ))}
            {rows.length === 0 && (
              <tr>
                <td colSpan={COLUMNS.length} className="py-6 text-center" style={{ color: "var(--muted)" }}>
                  {filtersActive ? "No contacts match these filters" : "No contacts yet"}
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
            <button type="button" className="btn btn-ghost !py-1 text-xs" disabled={page <= 1 || pending}
              onClick={() => navigate({ page: page - 1 })}>
              Previous
            </button>
            <button type="button" className="btn btn-ghost !py-1 text-xs" disabled={page >= totalPages || pending}
              onClick={() => navigate({ page: page + 1 })}>
              Next
            </button>
          </div>
        </div>
      )}
    </Card>
  );
}

function Toggle({ active, onClick, children }: { active: boolean; onClick: () => void; children: ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className="rounded-md border px-2.5 py-1.5 text-xs font-medium"
      style={active
        ? { color: "var(--accent)", borderColor: "var(--accent)", background: "color-mix(in srgb, var(--accent) 12%, transparent)" }
        : { color: "var(--muted)", borderColor: "var(--line)", background: "transparent" }}
    >
      {children}
    </button>
  );
}
