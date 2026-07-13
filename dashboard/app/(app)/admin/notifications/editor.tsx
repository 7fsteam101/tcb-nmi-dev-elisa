"use client";

import Link from "next/link";
import { useState, useTransition } from "react";
import { Badge } from "@/components/ui";
import { updateRuleAction, testRuleAction, type RulePatch } from "./actions";

type Channel = { id: string; name: string; isPrivate: boolean };
type Rule = {
  id: string;
  eventType: string;
  label: string;
  enabled: boolean;
  channelId: string | null;
  channelName: string | null;
  template: string;
  variables: string;
  minAmountMinor: number | null;
};

// min-amount gate only makes sense on money events
const MONEY_EVENTS = ["payment_succeeded", "payment_refunded"];

export function NotificationRulesEditor({ connected, channels, rules }: {
  connected: { team: string; botUser: string } | null;
  channels: Channel[];
  rules: Rule[];
}) {
  return (
    <div className="max-w-4xl space-y-4">
      {connected ? (
        <div className="card p-4" style={{ borderColor: "color-mix(in srgb, var(--good) 40%, transparent)" }}>
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <Badge tone="good">Connected</Badge>
            <span>
              Slack workspace <span className="font-semibold">{connected.team}</span>, posting as{" "}
              <span className="font-semibold">{connected.botUser}</span>.
            </span>
          </div>
          <p className="mt-1 text-xs" style={{ color: "var(--muted)" }}>
            The channel list shows what the bot can see. For a private channel, /invite the bot there first.
          </p>
        </div>
      ) : (
        <div className="card p-4">
          <div className="mb-2 flex items-center gap-2 text-sm font-semibold">
            <Badge tone="warn">Not connected</Badge>
            <span>Slack is not connected yet</span>
          </div>
          <ol className="list-decimal space-y-1 pl-5 text-xs" style={{ color: "var(--muted)" }}>
            <li>Create an app at api.slack.com/apps (From scratch), in the client&apos;s Slack workspace.</li>
            <li>OAuth &amp; Permissions, Bot Token Scopes: add chat:write, channels:read, groups:read.</li>
            <li>Install to Workspace, then copy the xoxb- Bot User OAuth Token.</li>
            <li>
              Paste it on the <Link href="/connections" style={{ color: "var(--accent)" }}>Connections page</Link> with
              provider Slack.
            </li>
            <li>/invite the bot in any private channel it should post to.</li>
          </ol>
          <p className="mt-2 text-xs" style={{ color: "var(--muted)" }}>
            Rules can be edited now; nothing posts until Slack is connected and a rule is on with a channel.
          </p>
        </div>
      )}

      {rules.map((r) => <RuleCard key={r.id} rule={r} channels={channels} />)}
      {rules.length === 0 && (
        <div className="card p-4 text-sm" style={{ color: "var(--muted)" }}>
          No notification rules found. Apply migration 0050 to seed the catalog.
        </div>
      )}
    </div>
  );
}

function RuleCard({ rule, channels }: { rule: Rule; channels: Channel[] }) {
  const [, start] = useTransition();
  const [template, setTemplate] = useState(rule.template);
  const [minAmount, setMinAmount] = useState(rule.minAmountMinor == null ? "" : String(rule.minAmountMinor / 100));
  const [test, setTest] = useState<{ ok: boolean; error?: string } | "sending" | null>(null);
  const known = rule.channelId != null && channels.some((c) => c.id === rule.channelId);
  const save = (patch: RulePatch) => start(() => updateRuleAction(rule.id, patch));

  return (
    <div className="card p-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="mr-auto text-sm font-semibold">{rule.label}</div>
        <button
          className="btn-ghost btn px-2 py-0.5 text-[11px]"
          style={{ color: rule.enabled ? "var(--good)" : "var(--muted)" }}
          onClick={() => save({ enabled: !rule.enabled })}
        >
          {rule.enabled ? "On" : "Off"}
        </button>
        <select
          className="!w-auto max-w-56 !py-1 text-sm"
          value={rule.channelId ?? ""}
          aria-label="Slack channel"
          onChange={(e) => {
            const id = e.target.value || null;
            const ch = channels.find((c) => c.id === id);
            save({ channelId: id, channelName: ch?.name ?? (id === rule.channelId ? rule.channelName : null) });
          }}
        >
          <option value="">No channel</option>
          {rule.channelId && !known && (
            <option value={rule.channelId}>
              {rule.channelName ? `#${rule.channelName}` : rule.channelId} (unknown channel)
            </option>
          )}
          {channels.map((c) => (
            <option key={c.id} value={c.id}>#{c.name}{c.isPrivate ? " (private)" : ""}</option>
          ))}
        </select>
        {MONEY_EVENTS.includes(rule.eventType) && (
          <label className="flex items-center gap-1 text-[11px]" style={{ color: "var(--muted)" }}>
            Min $
            <input
              className="num !w-20 !py-1 text-sm"
              value={minAmount}
              inputMode="decimal"
              placeholder="none"
              aria-label="Minimum amount in dollars"
              onChange={(e) => setMinAmount(e.target.value)}
              onBlur={() => {
                const v = minAmount.trim();
                const minor = v === "" ? null : Math.round(parseFloat(v) * 100);
                save({ minAmountMinor: minor != null && Number.isFinite(minor) ? minor : null });
              }}
            />
          </label>
        )}
        <button
          className="btn !py-1 text-[12px]"
          disabled={test === "sending"}
          onClick={async () => {
            setTest("sending");
            setTest(await testRuleAction(rule.id));
          }}
        >
          {test === "sending" ? "Sending..." : "Send test"}
        </button>
      </div>
      <textarea
        rows={2}
        className="mt-3 text-sm"
        value={template}
        aria-label="Message template"
        onChange={(e) => setTemplate(e.target.value)}
        onBlur={() => { if (template !== rule.template) save({ template }); }}
      />
      <div className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>
        Available values: {rule.variables}
      </div>
      {test !== null && test !== "sending" && (
        <div className="mt-1 text-xs" style={{ color: test.ok ? "var(--good)" : "var(--bad)" }}>
          {test.ok ? "Test sent" : `Test failed: ${test.error ?? "unknown error"}`}
        </div>
      )}
    </div>
  );
}
