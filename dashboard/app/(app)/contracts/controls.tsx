"use client";

import { useState, useTransition } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { setAgreementStatusAction } from "./actions";

// The five filter tabs, keyed by the ?status= value. "all" means no filter.
// "sent" is labelled as awaiting signature since that is what a sent-but-unsigned
// agreement means to the team.
const FILTERS: { key: string; label: string }[] = [
  { key: "all", label: "All" },
  { key: "signed", label: "Signed" },
  { key: "sent", label: "Awaiting signature" },
  { key: "declined", label: "Declined" },
  { key: "draft", label: "Draft" },
];

export function StatusFilter({ active }: { active: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const sp = useSearchParams();

  const pick = (key: string) => {
    const p = new URLSearchParams(sp.toString());
    if (key === "all") p.delete("status");
    else p.set("status", key);
    router.push(`${pathname}?${p.toString()}`);
  };

  const pill = (on: boolean) => ({
    background: on ? "var(--accent)" : "var(--panel)",
    color: on ? "#fff" : "var(--muted)",
    borderColor: on ? "var(--accent)" : "var(--line)",
  });

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {FILTERS.map((f) => (
        <button
          key={f.key}
          type="button"
          onClick={() => pick(f.key)}
          className="rounded-lg border px-2.5 py-1 text-[12px] font-medium transition-colors"
          style={pill(active === f.key)}
        >
          {f.label}
        </button>
      ))}
    </div>
  );
}

// Per-row status updater. Only rendered for admin / leadership (the page decides
// via canEdit). Buttons offered depend on the current status so a person is not
// shown an action that would be a no-op.
export function RowStatusUpdater({ id, status }: { id: string; status: string }) {
  const [pending, start] = useTransition();
  const [error, setError] = useState<string | null>(null);

  const run = (next: string) => {
    setError(null);
    start(async () => {
      const res = await setAgreementStatusAction(id, next);
      if (res && !res.ok) setError(res.message);
    });
  };

  const btn = "btn-ghost btn px-2 py-0.5 text-[11px] whitespace-nowrap";

  return (
    <div className="flex items-center justify-end gap-1">
      {status !== "signed" && (
        <button type="button" className={btn} disabled={pending} onClick={() => run("signed")}>
          Mark signed
        </button>
      )}
      {status !== "sent" && status !== "signed" && (
        <button type="button" className={btn} disabled={pending} onClick={() => run("sent")}>
          Mark sent
        </button>
      )}
      {status !== "voided" && (
        <button type="button" className={btn} disabled={pending} onClick={() => run("voided")}>
          Void
        </button>
      )}
      {error && (
        <span className="text-[11px]" style={{ color: "var(--bad)" }}>
          {error}
        </span>
      )}
    </div>
  );
}
