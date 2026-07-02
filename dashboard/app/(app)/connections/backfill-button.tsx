"use client";

import { useState, useTransition } from "react";
import { runBackfillAction } from "./actions";

export function BackfillButton() {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);

  function run() {
    start(async () => {
      const result = await runBackfillAction();
      setMsg(result as never);
      // long histories process in passes — keep going until finished
      if ((result as any)?.ok && (result as any)?.finished === false) run();
    });
  }

  return (
    <div className="space-y-2">
      <button onClick={run} disabled={pending} className="btn">
        {pending ? "Importing from Close..." : "Import Close history (backfill)"}
      </button>
      {msg && <div className="text-sm" style={{ color: msg.ok ? "var(--good)" : "var(--bad)" }}>{msg.message}</div>}
    </div>
  );
}
