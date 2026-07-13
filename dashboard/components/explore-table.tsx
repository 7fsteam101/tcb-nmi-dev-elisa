"use client";

import Link from "next/link";
import { Fragment, useMemo, useState } from "react";
import type { ExploreColumn } from "@/lib/explore";
import { Card, Badge, STATUS_TONE, label } from "@/components/ui";
import { money, dateTime, shortDate, num } from "@/lib/format";

// Client half of the drill-down table. The server page fetches the rows (and
// serializes Dates to ISO strings); this component owns search, sorting, and
// grouping. Row volumes are capped at 500 by the queries, so everything here
// is safely client-side.

type Cell = string | number | boolean | null | undefined;
export type ExploreRow = Record<string, Cell>;

type SortDir = "asc" | "desc";
type SortMode = "number" | "time" | "text";

// Numeric-style columns sit right-aligned with tabular figures so they read as
// a column of numbers rather than ragged text (same rule the server page used).
const NUMERIC_KINDS = new Set(["money"]);
const NUMERIC_KEYS = new Set(["slots", "seq", "installment_no", "amount_minor", "clicks", "leads", "impressions"]);
const isNumericCol = (c: ExploreColumn) =>
  (c.kind !== undefined && NUMERIC_KINDS.has(c.kind)) || NUMERIC_KEYS.has(c.key);

// Only label-ish columns make useful groups: explicit label kinds plus the
// known categorical keys across the metric registry.
const GROUPABLE_KEYS = new Set([
  "closer", "status", "current_status", "paid", "source", "booking_source_channel",
  "goal", "stage", "type", "processor", "campaign",
]);

const isEmpty = (v: Cell) => v === null || v === undefined || v === "";

// The string a cell renders as: search matches against this (so "Jul 8" or
// "$2,500" match what the user sees), and text sorting compares it.
function displayString(value: Cell, col: ExploreColumn, tz: string): string {
  if (isEmpty(value)) return "";
  switch (col.kind) {
    case "money": return money(value as number);
    case "datetime": return dateTime(String(value), tz);
    case "date": return shortDate(String(value), tz);
    case "label": return label(String(value));
    default: return String(value);
  }
}

// How a column sorts: money and all-numeric columns numerically, date kinds by
// Date value, everything else by localeCompare on the rendered string.
function sortModeFor(col: ExploreColumn, rows: ExploreRow[]): SortMode {
  if (col.kind === "money") return "number";
  if (col.kind === "datetime" || col.kind === "date") return "time";
  if (col.kind === "label" || col.kind === "close_link") return "text";
  let sawValue = false;
  for (const r of rows) {
    const v = r[col.key];
    if (isEmpty(v)) continue;
    sawValue = true;
    if (typeof v === "number") continue;
    if (typeof v === "string" && v.trim() !== "" && Number.isFinite(Number(v))) continue;
    return "text";
  }
  return sawValue ? "number" : "text";
}

export function ExploreTable({ columns, rows, tz }: { columns: ExploreColumn[]; rows: ExploreRow[]; tz: string }) {
  const [q, setQ] = useState("");
  const [sort, setSort] = useState<{ key: string; dir: SortDir } | null>(null);
  const [groupKey, setGroupKey] = useState("");

  const groupable = columns.filter((c) => c.kind === "label" || GROUPABLE_KEYS.has(c.key));

  // Precompute each row's search text once: every rendered cell string, lowercased.
  const searchable = useMemo(
    () => rows.map((row) => ({
      row,
      text: columns.map((c) => displayString(row[c.key], c, tz)).join(" ").toLowerCase(),
    })),
    [rows, columns, tz],
  );

  const query = q.trim().toLowerCase();
  const filtered = useMemo(
    () => (query ? searchable.filter((e) => e.text.includes(query)) : searchable).map((e) => e.row),
    [searchable, query],
  );

  const sorted = useMemo(() => {
    if (!sort) return filtered;
    const col = columns.find((c) => c.key === sort.key);
    if (!col) return filtered;
    const mode = sortModeFor(col, rows);
    const dir = sort.dir === "asc" ? 1 : -1;
    return [...filtered].sort((a, b) => {
      const av = a[col.key], bv = b[col.key];
      const aEmpty = isEmpty(av), bEmpty = isEmpty(bv);
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1; // empties sink to the bottom either direction
      if (bEmpty) return -1;
      let cmp = 0;
      if (mode === "number") cmp = Number(av) - Number(bv);
      else if (mode === "time") cmp = new Date(String(av)).getTime() - new Date(String(bv)).getTime();
      else cmp = displayString(av, col, tz).localeCompare(displayString(bv, col, tz), "en", { sensitivity: "base" });
      if (Number.isNaN(cmp)) cmp = 0;
      return cmp * dir;
    });
  }, [filtered, sort, columns, rows, tz]);

  // Grouping happens after filter + sort, so sorting still applies within each
  // group. Groups are ordered by size, biggest first.
  const groups = useMemo(() => {
    if (!groupKey) return null;
    const byValue = new Map<string, ExploreRow[]>();
    for (const row of sorted) {
      const v = row[groupKey];
      const k = isEmpty(v) ? "" : String(v);
      const list = byValue.get(k);
      if (list) list.push(row);
      else byValue.set(k, [row]);
    }
    return [...byValue.entries()].sort((a, b) => b[1].length - a[1].length || a[0].localeCompare(b[0]));
  }, [sorted, groupKey]);

  function onSortClick(key: string) {
    setSort((prev) => (prev?.key !== key ? { key, dir: "asc" } : prev.dir === "asc" ? { key, dir: "desc" } : null));
  }

  const total = rows.length;
  const countLine = query
    ? `${num(sorted.length)} of ${num(total)} rows`
    : `${num(total)} row${total === 1 ? "" : "s"}`;

  const bodyRow = (r: ExploreRow, key: string) => (
    <tr key={key}>
      {columns.map((c) => (
        <td key={c.key} className={isNumericCol(c) ? "text-right tabular-nums" : undefined}>
          {renderCell(r[c.key], c, tz, r)}
        </td>
      ))}
    </tr>
  );

  return (
    <Card className="!p-0">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b px-3 py-2.5" style={{ borderColor: "var(--line)" }}>
        <div className="flex items-center gap-3">
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Search rows"
            aria-label="Search rows"
            className="!w-56 !py-1.5 text-sm"
          />
          <span className="whitespace-nowrap text-xs" style={{ color: "var(--muted)" }}>{countLine}</span>
        </div>
        {groupable.length > 0 && (
          <label className="flex items-center gap-1.5 text-xs" style={{ color: "var(--muted)" }}>
            Group by
            <select
              value={groupKey}
              onChange={(e) => setGroupKey(e.target.value)}
              className="!w-auto !py-1.5 text-sm"
            >
              <option value="">None</option>
              {groupable.map((c) => (
                <option key={c.key} value={c.key}>{label(c.label)}</option>
              ))}
            </select>
          </label>
        )}
      </div>
      <div className="overflow-x-auto">
        <table>
          <thead>
            <tr>
              {columns.map((c) => {
                const dir = sort?.key === c.key ? sort.dir : null;
                return (
                  <th
                    key={c.key}
                    onClick={() => onSortClick(c.key)}
                    className={`cursor-pointer select-none ${isNumericCol(c) ? "text-right" : ""}`}
                    title="Sort"
                  >
                    {label(c.label)}
                    {dir && (
                      <span style={{ color: "var(--accent)" }}> {dir === "asc" ? <>&uarr;</> : <>&darr;</>}</span>
                    )}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {groups
              ? groups.map(([value, groupRows]) => (
                  <Fragment key={`g:${value}`}>
                    <tr>
                      <td
                        colSpan={columns.length}
                        className="!py-2 text-[13px] font-semibold"
                        style={{ background: "color-mix(in srgb, var(--panel-2) 70%, transparent)" }}
                      >
                        {label(value === "" ? null : value)}{" "}
                        <span className="font-normal" style={{ color: "var(--muted)" }}>({num(groupRows.length)})</span>
                      </td>
                    </tr>
                    {groupRows.map((r, i) => bodyRow(r, `g:${value}:${i}`))}
                  </Fragment>
                ))
              : sorted.map((r, i) => bodyRow(r, `r:${i}`))}
            {total === 0 && (
              <tr>
                <td colSpan={columns.length} className="py-6 text-center" style={{ color: "var(--muted)" }}>
                  Nothing in range yet: this fills as the connected systems send data.
                </td>
              </tr>
            )}
            {total > 0 && sorted.length === 0 && (
              <tr>
                <td colSpan={columns.length} className="py-6 text-center" style={{ color: "var(--muted)" }}>
                  No rows match this search.
                </td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
    </Card>
  );
}

function renderCell(value: Cell, col: ExploreColumn, tz: string, row: ExploreRow) {
  if (isEmpty(value)) return <span style={{ color: "var(--muted)" }}>&mdash;</span>;
  switch (col.kind) {
    case "money": return money(value as number);
    case "datetime": return dateTime(String(value), tz);
    case "date": return shortDate(String(value), tz);
    case "label": {
      const v = String(value);
      return <Badge tone={STATUS_TONE[v] ?? "neutral"}>{label(v)}</Badge>;
    }
    case "close_link":
      return (
        <a href={`https://app.close.com/lead/${value}/`} target="_blank" rel="noreferrer"
          className="inline-flex items-center gap-1 rounded border px-1.5 py-0.5 text-xs"
          style={{ color: "var(--accent)", borderColor: `color-mix(in srgb, var(--accent) 35%, transparent)` }}>
          Close {"↗"}
        </a>
      );
    default: {
      // Contact names deep-link to the in-app contact page when a contact_id
      // rode along on the row; the Close column stays the external jump.
      if (col.key === "contact_name" && !isEmpty(row.contact_id)) {
        return (
          <Link href={`/contacts/${row.contact_id}#opt-ins`} className="font-medium hover:underline" style={{ color: "var(--accent)" }}>
            {String(value)}
          </Link>
        );
      }
      return String(value);
    }
  }
}
