"use client";

import Link from "next/link";
import { useActionState, useTransition } from "react";
import { Badge } from "@/components/ui";
import { addTestRuleAction, deleteTestRuleAction, untrackTestContactAction } from "./actions";

type Rule = { id: string; kind: string; value: string };
type Flagged = { id: string; name: string; email: string | null; reason: string; opps: number };

export function TestRulesEditor({ rules, flagged }: { rules: Rule[]; flagged: Flagged[] }) {
  const [state, action, pending] = useActionState(addTestRuleAction, null as any);
  const [, start] = useTransition();

  return (
    <div className="max-w-4xl space-y-4">
      <div className="card p-4">
        <div className="mb-1 text-sm font-semibold">Test data rules</div>
        <p className="mb-3 text-xs" style={{ color: "var(--muted)" }}>
          Contacts matching a rule are flagged as test automatically (at creation and on every sweep):
          they drop out of every number but are never deleted, and you can untrack any of them below.
          Emails match exactly; keywords match as a standalone word in the name, so a real name that
          merely contains the letters never flags.
        </p>
        <form action={action} className="mb-4 flex flex-wrap items-center gap-2">
          <select name="kind" defaultValue="keyword" className="!w-auto !py-1.5 text-sm" aria-label="Rule type">
            <option value="keyword">Keyword (name)</option>
            <option value="email">Email (exact)</option>
          </select>
          <input name="value" placeholder="e.g. mctest or qa@thecreditbrothers.com" required className="!w-72 !py-1.5 text-sm" />
          <button type="submit" disabled={pending} className="btn !py-1.5 text-sm">Add rule</button>
          {state && <span className="text-xs" style={{ color: state.ok ? "var(--good)" : "var(--bad)" }}>{state.message}</span>}
        </form>
        <table>
          <thead><tr><th>Type</th><th>Value</th><th></th></tr></thead>
          <tbody>
            {rules.map((r) => (
              <tr key={r.id}>
                <td><Badge tone={r.kind === "email" ? "accent" : "neutral"}>{r.kind === "email" ? "Email" : "Keyword"}</Badge></td>
                <td className="num">{r.value}</td>
                <td className="text-right">
                  <button className="btn-ghost btn px-2 py-0.5 text-[11px]" style={{ color: "var(--muted)" }}
                    onClick={() => start(() => deleteTestRuleAction(r.id))}>
                    Remove
                  </button>
                </td>
              </tr>
            ))}
            {rules.length === 0 && <tr><td colSpan={3} style={{ color: "var(--muted)" }}>No rules yet.</td></tr>}
          </tbody>
        </table>
        <p className="mt-2 text-[11px]" style={{ color: "var(--muted)" }}>
          Removing a rule stops future flagging; contacts it already flagged stay flagged until untracked below.
        </p>
      </div>

      <div className="card p-4">
        <div className="mb-1 text-sm font-semibold">Flagged as test ({flagged.length})</div>
        <p className="mb-3 text-xs" style={{ color: "var(--muted)" }}>
          Everything here is excluded from KPIs and lists. Untrack restores a contact and all its
          activity to the real numbers instantly.
        </p>
        <table>
          <thead><tr><th>Contact</th><th>Email</th><th>Opps</th><th>Why</th><th></th></tr></thead>
          <tbody>
            {flagged.map((f) => (
              <tr key={f.id}>
                <td><Link href={`/contacts/${f.id}`} style={{ color: "var(--accent)" }}>{f.name}</Link></td>
                <td style={{ color: "var(--muted)" }}>{f.email ?? "—"}</td>
                <td className="num">{f.opps}</td>
                <td className="text-xs" style={{ color: "var(--muted)" }}>{f.reason}</td>
                <td className="text-right">
                  <button className="btn-ghost btn px-2 py-0.5 text-[11px]" style={{ color: "var(--good)" }}
                    onClick={() => start(() => untrackTestContactAction(f.id))}>
                    Untrack
                  </button>
                </td>
              </tr>
            ))}
            {flagged.length === 0 && <tr><td colSpan={5} style={{ color: "var(--muted)" }}>Nothing flagged.</td></tr>}
          </tbody>
        </table>
      </div>
    </div>
  );
}
