"use client";

import { CSSProperties, useState, useTransition } from "react";
import { markShowAction, markNoShowAction } from "./actions";

type Result = { ok: boolean; results: string[] };
type Kind = "show" | "no_show";

const BTN =
  "cursor-pointer whitespace-nowrap rounded-lg border px-2.5 py-1 text-xs font-medium disabled:cursor-not-allowed disabled:opacity-50";

function tone(v: string): CSSProperties {
  return {
    color: `var(${v})`,
    borderColor: `color-mix(in srgb, var(${v}) 45%, transparent)`,
    background: `color-mix(in srgb, var(${v}) 12%, transparent)`,
  };
}

/** Inline Show up / No show buttons for a pending slot. On success the
 *  revalidated row replaces this cell (status badge flips); on failure the
 *  error shows here and the buttons stay so the click can be retried. */
export function MarkButtons({ appointmentId }: { appointmentId: string }) {
  const [pending, start] = useTransition();
  const [clicked, setClicked] = useState<Kind | null>(null);
  const [result, setResult] = useState<Result | null>(null);

  function run(kind: Kind) {
    setClicked(kind);
    setResult(null);
    start(async () => {
      const r = kind === "show" ? await markShowAction(appointmentId) : await markNoShowAction(appointmentId);
      setResult(r);
    });
  }

  if (result?.ok) {
    return (
      <div className="text-xs" style={{ color: "var(--good)" }}>
        {result.results.join(" · ")}
      </div>
    );
  }

  return (
    <div className="space-y-1">
      <div className="flex items-center gap-1.5">
        <button type="button" disabled={pending} onClick={() => run("show")} className={BTN} style={tone("--good")}>
          {pending && clicked === "show" ? "Saving..." : "Show up"}
        </button>
        <button type="button" disabled={pending} onClick={() => run("no_show")} className={BTN} style={tone("--bad")}>
          {pending && clicked === "no_show" ? "Saving..." : "No show"}
        </button>
      </div>
      {result && !result.ok && (
        <div className="text-xs" style={{ color: "var(--bad)" }}>
          {result.results.join(" · ")}
        </div>
      )}
    </div>
  );
}
