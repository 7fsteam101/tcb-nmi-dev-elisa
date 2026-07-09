import Link from "next/link";
import type { NeedsAttention } from "@/lib/attention";

// The forget-proofing banner: new calendars nobody categorized and Close stages
// nobody mapped. Everything still records; these only affect counting, so the
// banner is how an un-decided state stays impossible to miss.
export function AttentionBanner({ a }: { a: NeedsAttention }) {
  const items: React.ReactNode[] = [];
  if (a.newCalendars > 0)
    items.push(
      <span key="cal">
        <Link href="/admin/calendars" className="font-medium underline" style={{ color: "var(--warn)" }}>
          {a.newCalendars} new calendar{a.newCalendars === 1 ? "" : "s"}
        </Link>{" "}
        awaiting review{a.uncountedCalls > 0 ? ` (${a.uncountedCalls} calls recorded but not counted)` : ""}
      </span>,
    );
  if (a.unmappedStages > 0)
    items.push(
      <span key="st">
        <Link href="/admin/stages" className="font-medium underline" style={{ color: "var(--warn)" }}>
          {a.unmappedStages} Close stage{a.unmappedStages === 1 ? "" : "s"}
        </Link>{" "}
        awaiting mapping
      </span>,
    );
  if (a.newForms > 0)
    items.push(
      <span key="fm">
        <Link href="/admin/forms" className="font-medium underline" style={{ color: "var(--warn)" }}>
          {a.newForms} new form{a.newForms === 1 ? "" : "s"}
        </Link>{" "}
        recording but not counting as leads
      </span>,
    );
  for (const s of a.staleSources)
    items.push(
      <span key={s}>
        <Link href="/connections" className="font-medium underline" style={{ color: "var(--warn)" }}>{s}</Link>
      </span>,
    );
  if (!items.length) return null;
  return (
    <div className="mb-4 rounded-xl border px-4 py-2.5 text-sm"
      style={{ borderColor: "color-mix(in srgb, var(--warn) 40%, transparent)", background: "color-mix(in srgb, var(--warn) 10%, transparent)", color: "var(--text)" }}>
      <span className="font-semibold" style={{ color: "var(--warn)" }}>Needs a decision: </span>
      {items.map((it, i) => <span key={i}>{i > 0 && " · "}{it}</span>)}
    </div>
  );
}
