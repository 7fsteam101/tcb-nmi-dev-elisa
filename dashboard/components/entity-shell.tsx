import { ReactNode } from "react";
import { CloseX } from "@/components/close-x";

// Standard layout for a data-entity sub-page (opportunity, appointment, deal,
// contract, receivable, payment plan, call, payment). A focused header with the
// entity name + an X in the top-right that closes and returns to the previous
// page, then the entity body.
export function EntityShell({
  kicker, title, subtitle, badges, actions, children,
}: {
  kicker: string;
  title: ReactNode;
  subtitle?: ReactNode;
  badges?: ReactNode;
  actions?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-4xl">
      <div className="mb-5 flex items-start justify-between gap-3 border-b pb-4" style={{ borderColor: "var(--line)" }}>
        <div className="min-w-0">
          <div className="text-[11px] font-semibold uppercase tracking-wider" style={{ color: "var(--muted)" }}>{kicker}</div>
          <div className="mt-0.5 flex flex-wrap items-center gap-2">
            <h1 className="text-xl font-semibold">{title}</h1>
            {badges}
          </div>
          {subtitle && <p className="mt-1 text-sm" style={{ color: "var(--muted)" }}>{subtitle}</p>}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {actions}
          <CloseX />
        </div>
      </div>
      {children}
    </div>
  );
}
