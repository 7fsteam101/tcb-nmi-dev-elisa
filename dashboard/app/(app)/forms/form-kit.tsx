import { ReactNode } from "react";
import { Icon } from "@/components/icons";

// Shared, PRESENTATION-ONLY building blocks for the three rep forms.
// No form logic, no field names, no server-action wiring lives here, only
// layout, spacing, headings, and theme-token styling so every form reads like a
// polished SaaS product in both dark and light mode. All color comes from
// var(--...) tokens; never a hardcoded hex.
//
// Layout contract: each form renders as ONE container (FormCard): a header with
// the form title and one-line purpose, the field sections separated by subtle
// labelled dividers (Section), and a single prominent submit footer (SubmitBar).
// The whole thing reads as one form, never a stack of floating groups.

const tint = (token: string, pct: number) => `color-mix(in srgb, var(${token}) ${pct}%, transparent)`;

/** Two-column shell: the form column on the left, a sticky summary rail on the right. */
export function FormLayout({ form, rail }: { form: ReactNode; rail?: ReactNode }) {
  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1fr)_20rem]">
      <div className="min-w-0">{form}</div>
      {rail && (
        <aside className="lg:sticky lg:top-6 lg:self-start">{rail}</aside>
      )}
    </div>
  );
}

/** THE form container: one bordered, rounded card holding the header (icon chip
 *  + title + one-line purpose), every field section, and the submit footer.
 *  Render it INSIDE the <form> element so the footer's submit button works. */
export function FormCard({
  icon, title, subtitle, footer, children,
}: { icon: string; title: string; subtitle: string; footer: ReactNode; children: ReactNode }) {
  return (
    <div className="card overflow-hidden">
      <div
        className="flex items-start gap-3.5 border-b px-5 py-5 sm:px-6"
        style={{ borderColor: "var(--line)", background: tint("--panel-2", 45) }}
      >
        <div
          className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl"
          style={{ background: tint("--accent", 14), color: "var(--accent)", border: `1px solid ${tint("--accent", 30)}` }}
        >
          <Icon name={icon} size={20} />
        </div>
        <div className="min-w-0">
          <h1 className="text-xl font-semibold tracking-tight">{title}</h1>
          <p className="mt-0.5 text-sm" style={{ color: "var(--muted)" }}>{subtitle}</p>
        </div>
      </div>
      <div className="space-y-7 px-5 py-6 sm:px-6">{children}</div>
      {footer}
    </div>
  );
}

/** A titled group of fields INSIDE the form container: a small uppercase muted
 *  label with a hairline rule as the divider, never a separate floating card. */
export function Section({
  title, hint, children,
}: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section>
      <div className="flex items-center gap-3">
        <h2 className="shrink-0 text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>
          {title}
        </h2>
        <span aria-hidden className="h-px flex-1" style={{ background: "var(--line)" }} />
      </div>
      {hint && <p className="mt-1.5 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>{hint}</p>}
      <div className="mt-3.5 space-y-4">{children}</div>
    </section>
  );
}

/** A labelled field row: label above the input (inputs themselves are full-width,
 *  14px, from the global input styles), optional helper below, and a required
 *  marker when the wrapped input is required. */
export function Field({
  label, hint, htmlFor, required, children, className = "",
}: { label: string; hint?: string; htmlFor?: string; required?: boolean; children: ReactNode; className?: string }) {
  return (
    <div className={className}>
      <label htmlFor={htmlFor} className="mb-1.5 block text-[13px] font-medium" style={{ color: "var(--text)" }}>
        {label}
        {required && <span aria-hidden title="Required" className="ml-0.5" style={{ color: "var(--bad)" }}>*</span>}
      </label>
      {children}
      {hint && <p className="mt-1 text-[11px] leading-relaxed" style={{ color: "var(--muted)" }}>{hint}</p>}
    </div>
  );
}

/** A tinted callout for a branch-specific group of fields (won / deposit / etc.). */
export function ConditionalPanel({
  tone = "accent", title, hint, children,
}: { tone?: "accent" | "good" | "warn" | "bad"; title?: string; hint?: string; children: ReactNode }) {
  const token = `--${tone}`;
  return (
    <div
      className="rounded-xl border p-4 sm:p-5"
      style={{ borderColor: tint(token, 45), background: tint(token, 7) }}
    >
      {title && (
        <div className="mb-3 flex items-center gap-2">
          <span className="h-2 w-2 rounded-full" style={{ background: `var(${token})` }} />
          <span className="text-[13px] font-semibold" style={{ color: `var(${token})` }}>{title}</span>
        </div>
      )}
      {hint && <p className="mb-3 text-xs leading-relaxed" style={{ color: "var(--muted)" }}>{hint}</p>}
      <div className="space-y-4">{children}</div>
    </div>
  );
}

/** A styled checkbox row that reads like a toggle option. */
export function CheckRow({ children }: { children: ReactNode }) {
  return (
    <label
      className="flex cursor-pointer items-center gap-2.5 rounded-lg border px-3.5 py-3 text-sm transition-colors"
      style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}
    >
      {children}
    </label>
  );
}

/** The container's footer: one prominent accent submit button plus the what-happens note. */
export function SubmitBar({ pending, label, pendingLabel }: { pending: boolean; label: string; pendingLabel: string }) {
  return (
    <div
      className="flex flex-col gap-3 border-t px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6"
      style={{ borderColor: "var(--line)", background: tint("--panel-2", 45) }}
    >
      <p className="text-xs" style={{ color: "var(--muted)" }}>
        Submitting logs the report, updates the reporting tables, and syncs to Close.
      </p>
      <button type="submit" disabled={pending} className="btn shrink-0 px-7" style={{ background: "var(--accent)" }}>
        {pending ? pendingLabel : label}
      </button>
    </div>
  );
}

/** The post-submit result list, tinted by success/failure. */
export function ResultBanner({ state }: { state: { ok: boolean; results: string[] } | null }) {
  if (!state) return null;
  const token = state.ok ? "--good" : "--bad";
  return (
    <div
      className="rounded-xl border p-4"
      style={{ borderColor: tint(token, 45), background: tint(token, 8) }}
    >
      <div className="mb-2 flex items-center gap-2">
        <span
          className="h-2.5 w-2.5 rounded-full"
          style={{ background: `var(${token})` }}
        />
        <span className="text-[13px] font-semibold" style={{ color: `var(${token})` }}>
          {state.ok ? "Report submitted" : "Could not submit"}
        </span>
      </div>
      <ul className="space-y-1 pl-7 text-sm" style={{ color: "var(--text)" }}>
        {state.results.map((r, i) => (
          <li key={i} className="list-disc" style={{ color: "var(--muted)" }}>{r}</li>
        ))}
      </ul>
    </div>
  );
}

/** Reusable summary-rail scaffold: a titled card with rows the form drives live. */
export function SummaryRail({ title, children, footer }: { title: string; children: ReactNode; footer?: ReactNode }) {
  return (
    <div className="card p-5">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>{title}</h3>
      <div className="mt-4 space-y-3">{children}</div>
      {footer && (
        <div className="mt-4 border-t pt-4 text-xs leading-relaxed" style={{ borderColor: "var(--line)", color: "var(--muted)" }}>
          {footer}
        </div>
      )}
    </div>
  );
}

/** One row inside the summary rail: a muted key and a value (or an accent chip). */
export function RailRow({ k, children }: { k: string; children: ReactNode }) {
  return (
    <div className="flex items-start justify-between gap-3">
      <span className="text-xs" style={{ color: "var(--muted)" }}>{k}</span>
      <span className="text-right text-[13px] font-medium">{children}</span>
    </div>
  );
}

/** A small outcome/branch chip, tinted by tone, for the summary rail. */
export function RailChip({ tone = "accent", children }: { tone?: "accent" | "good" | "warn" | "bad" | "neutral"; children: ReactNode }) {
  const token = tone === "neutral" ? "--muted" : `--${tone}`;
  return (
    <span
      className="inline-block rounded-full border px-2 py-0.5 text-[12px] font-medium"
      style={{ color: `var(${token})`, borderColor: tint(token, 40), background: tint(token, 10) }}
    >
      {children}
    </span>
  );
}
