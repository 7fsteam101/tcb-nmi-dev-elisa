"use client";

import { useTransition } from "react";
import { Badge, SectionTitle } from "@/components/ui";
import { setRuleEnabledAction } from "./actions";

type Rule = {
  id: string; key: string; name: string; description: string | null;
  params: Record<string, unknown> | null; default_enabled: boolean; sort_order: number | null;
};
type Rep = { id: string; full_name: string };
type Setting = { rep_id: string; rule_id: string; enabled: boolean };

const paramsText = (p: Rule["params"]) =>
  p && Object.keys(p).length
    ? Object.entries(p).map(([k, v]) => `${k}: ${String(v)}`).join(", ")
    : "no params";

export function CommissionEditor({
  rules, reps, settings, demo,
}: { rules: Rule[]; reps: Rep[]; settings: Setting[]; demo: boolean }) {
  const [, start] = useTransition();

  // effective enabled = per-rep setting if present, else rule default
  const settingMap = new Map(settings.map((s) => [`${s.rep_id}|${s.rule_id}`, s.enabled]));
  const isEnabled = (repId: string, rule: Rule) => {
    const s = settingMap.get(`${repId}|${rule.id}`);
    return s === undefined ? rule.default_enabled : s;
  };

  return (
    <div className="max-w-5xl space-y-4">
      <p className="text-sm" style={{ color: "var(--muted)" }}>
        Toggle which commission rules apply to each rep. Off means the rule has no effect for that rep. Changes take effect
        on the next recompute; the leaderboard below shows the statements as last computed.{demo ? " Showing demo data." : ""}
      </p>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
        {rules.map((r) => (
          <div key={r.id} className="card p-4">
            <div className="mb-1 flex items-center justify-between gap-2">
              <div className="text-sm font-semibold">{r.name}</div>
              <Badge tone={r.default_enabled ? "good" : "neutral"}>{r.default_enabled ? "on by default" : "off by default"}</Badge>
            </div>
            <div className="text-xs" style={{ color: "var(--muted)" }}>{r.description ?? "—"}</div>
            <div className="mt-2 text-xs" style={{ color: "var(--muted)" }}>{paramsText(r.params)}</div>
          </div>
        ))}
      </div>

      <SectionTitle>Rules per rep</SectionTitle>
      <div className="card p-4">
        <table>
          <thead>
            <tr>
              <th>Rep</th>
              {rules.map((r) => <th key={r.id} className="text-center">{r.name}</th>)}
            </tr>
          </thead>
          <tbody>
            {reps.map((rep) => (
              <tr key={rep.id}>
                <td className="font-medium">{rep.full_name}</td>
                {rules.map((rule) => {
                  const checked = isEnabled(rep.id, rule);
                  return (
                    <td key={rule.id} className="text-center">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(e) => { const v = e.target.checked; start(() => setRuleEnabledAction(rep.id, rule.id, v)); }}
                      />
                    </td>
                  );
                })}
              </tr>
            ))}
            {reps.length === 0 && (
              <tr><td colSpan={rules.length + 1} style={{ color: "var(--muted)" }}>No active closers</td></tr>
            )}
          </tbody>
        </table>
      </div>

    </div>
  );
}
