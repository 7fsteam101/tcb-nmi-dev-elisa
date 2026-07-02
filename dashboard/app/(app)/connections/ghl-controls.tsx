"use client";

import { useState, useTransition } from "react";
import { runGhlSyncAction } from "./actions";

export function GhlControls({ appRegistered }: { appRegistered: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; message: string } | null>(null);

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap gap-2">
        <a href="/api/connect/crm" className={`btn inline-block ${appRegistered ? "" : "pointer-events-none opacity-50"}`}>
          Install / connect a sub-account
        </a>
        <button className="btn btn-ghost" disabled={pending}
          onClick={() => start(async () => setMsg((await runGhlSyncAction()) as never))}>
          {pending ? "Importing from GHL..." : "Import GHL history (calendars, bookings, contacts, opt-ins)"}
        </button>
      </div>
      {!appRegistered && (
        <div className="text-xs" style={{ color: "var(--warn)" }}>
          Waiting on the Marketplace app registration (GHL_CLIENT_ID / GHL_CLIENT_SECRET).
        </div>
      )}
      {msg && <div className="text-sm" style={{ color: msg.ok ? "var(--good)" : "var(--bad)" }}>{msg.message}</div>}
    </div>
  );
}
