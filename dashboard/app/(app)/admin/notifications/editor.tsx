"use client";

import Link from "next/link";
import { useEffect, useRef, useState, useTransition } from "react";
import { Badge } from "@/components/ui";
import { updateRuleAction, testRuleAction, type RulePatch } from "./actions";

type Channel = { id: string; name: string; isPrivate: boolean };
type Rule = {
  botName: string | null;
  botIcon: string | null;
  id: string;
  eventType: string;
  label: string;
  enabled: boolean;
  channelId: string | null;
  channelName: string | null;
  template: string;
  variables: string;
  minAmountMinor: number | null;
  sample: Record<string, string>;
  example: Record<string, string> | null;
};

// same substitution the engine uses (lib/notify.ts render), incl. the date
// modifiers: {time|date}, {time|time}, {time|datetime}; bare ISO auto-formats.
const TZ = "America/New_York";
const ISO_RE = /^\d{4}-\d{2}-\d{2}T/;
const fmtDate = (d: Date, mode: string) => {
  const date = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric" }).format(d);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(d);
  return mode === "date" ? date : mode === "time" ? time : date + ", " + time;
};
const renderPreview = (template: string, vars: Record<string, string>) =>
  template.replace(/\{(\w+)(?:\|(\w+))?\}/g, (_, k: string, mod?: string) => {
    const v = vars[k];
    if (v === null || v === undefined || v === "") return "";
    if (mod || ISO_RE.test(v)) {
      const d = new Date(v);
      if (!isNaN(d.getTime())) return fmtDate(d, mod ?? "datetime");
    }
    return v;
  }).replace(/\s{2,}/g, " ").trim();

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

// Two-level insert menu: level one lists the event's values with their LIVE
// example (whatever the preview currently shows); date values expand to a
// format picker where every option shows exactly what it renders.
const DATE_VARS = ["time", "date"];
const friendly = (name: string) => name.replace(/_/g, " ").replace(/^./, (c) => c.toUpperCase());
const clip = (s: string, n = 26) => (s.length > n ? s.slice(0, n - 3) + "..." : s);

function InsertMenu({ vars, previewVars, onInsert }: {
  vars: string[];
  previewVars: Record<string, string>;
  onInsert: (v: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") setOpen(false); };
    document.addEventListener("mousedown", away);
    document.addEventListener("keydown", esc);
    return () => { document.removeEventListener("mousedown", away); document.removeEventListener("keydown", esc); };
  }, [open]);

  const pick = (token: string) => { onInsert(token); setOpen(false); setExpanded(null); };
  const exampleFor = (name: string, mode?: string) => {
    const raw = previewVars[name] ?? "";
    if (!raw) return "empty";
    if (ISO_RE.test(raw)) {
      const d = new Date(raw);
      if (!isNaN(d.getTime())) return fmtDate(d, mode ?? "datetime");
    }
    return clip(raw);
  };

  return (
    <div ref={wrapRef} className="relative inline-block">
      <button
        type="button"
        onClick={() => { setOpen((o) => !o); setExpanded(null); }}
        className="rounded-md border px-2 py-1 text-[12px]"
        style={{
          borderColor: "color-mix(in srgb, var(--accent) 35%, var(--line))",
          color: "var(--accent)",
          background: "color-mix(in srgb, var(--accent) 8%, transparent)",
        }}
      >
        + Insert value
      </button>
      {open && (
        <div
          className="absolute left-0 z-20 mt-1 w-72 overflow-hidden rounded-lg border shadow-lg"
          style={{ borderColor: "var(--line)", background: "var(--panel)" }}
        >
          {vars.map((v) => {
            const name = v.slice(1, -1);
            const isDate = DATE_VARS.includes(name);
            const isOpen = expanded === name;
            return (
              <div key={v} style={{ borderTop: "1px solid var(--line)" }}>
                <button
                  type="button"
                  onClick={() => (isDate ? setExpanded(isOpen ? null : name) : pick(v))}
                  className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-[12px] hover:brightness-110"
                  style={{ background: isOpen ? "var(--panel-2)" : "transparent" }}
                >
                  <span className="font-medium">{friendly(name)}</span>
                  <span className="num truncate text-[11px]" style={{ color: "var(--muted)" }}>
                    {isDate ? (isOpen ? "pick a format" : exampleFor(name)) : exampleFor(name)}
                  </span>
                  {isDate && <span className="text-[10px]" style={{ color: "var(--muted)" }}>{isOpen ? String.fromCharCode(9662) : String.fromCharCode(9656)}</span>}
                </button>
                {isDate && isOpen && (
                  <div style={{ background: "var(--panel-2)" }}>
                    {([["datetime", "Date + time", v], ["date", "Date only", `{${name}|date}`], ["time", "Time only", `{${name}|time}`]] as const).map(([mode, labelTxt, token]) => (
                      <button
                        key={mode}
                        type="button"
                        onClick={() => pick(token)}
                        className="flex w-full items-center justify-between gap-2 py-1.5 pl-6 pr-3 text-left text-[12px] hover:brightness-110"
                      >
                        <span>{labelTxt}</span>
                        <span className="num text-[11px]" style={{ color: "var(--accent)" }}>{exampleFor(name, mode)}</span>
                      </button>
                    ))}
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RuleCard({ rule, channels }: { rule: Rule; channels: Channel[] }) {
  const [, start] = useTransition();
  const [template, setTemplate] = useState(rule.template);
  const [minAmount, setMinAmount] = useState(rule.minAmountMinor == null ? "" : String(rule.minAmountMinor / 100));
  const [botName, setBotName] = useState(rule.botName ?? "");
  const [botIcon, setBotIcon] = useState(rule.botIcon ?? "");
  const [test, setTest] = useState<{ ok: boolean; error?: string } | "sending" | null>(null);
  const [previewMode, setPreviewMode] = useState<"sample" | "real">(rule.example ? "real" : "sample");
  const taRef = useRef<HTMLTextAreaElement>(null);
  const known = rule.channelId != null && channels.some((c) => c.id === rule.channelId);
  const save = (patch: RulePatch) => start(() => updateRuleAction(rule.id, patch));

  // inserting a value: at the cursor when the textarea has been interacted
  // with, otherwise appended at the end (never silently at position 0)
  const caretRef = useRef<number | null>(null);
  const vars = (rule.variables.match(/\{\w+\}/g) ?? []);
  const insertVar = (v: string) => {
    const ta = taRef.current;
    const at = caretRef.current ?? template.length;
    const before = template.slice(0, at);
    const pad = before.length > 0 && !/\s$/.test(before) && caretRef.current === null ? " " : "";
    const next = before + pad + v + template.slice(at);
    setTemplate(next);
    save({ template: next });
    const newCaret = at + pad.length + v.length;
    caretRef.current = newCaret;
    requestAnimationFrame(() => {
      if (ta) { ta.focus(); ta.selectionStart = ta.selectionEnd = newCaret; }
    });
  };
  const trackCaret = () => {
    const ta = taRef.current;
    if (ta) caretRef.current = ta.selectionStart ?? null;
  };
  const previewVars = previewMode === "real" && rule.example ? rule.example : rule.sample;
  const previewText = renderPreview(template, previewVars);

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
      <div className="mt-3 grid gap-3 md:grid-cols-[1fr_300px]">
        <div>
          <textarea
            ref={taRef}
            rows={3}
            className="text-sm"
            value={template}
            aria-label="Message template"
            onChange={(e) => { setTemplate(e.target.value); trackCaret(); }}
            onClick={trackCaret}
            onKeyUp={trackCaret}
            onSelect={trackCaret}
            onBlur={() => { trackCaret(); if (template !== rule.template) save({ template }); }}
          />
          <div className="mt-1.5">
            <InsertMenu vars={vars} previewVars={previewVars} onInsert={insertVar} />
          </div>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <label className="flex items-center gap-1 text-[11px]" style={{ color: "var(--muted)" }}>
              Bot name
              <input
                className="!w-36 !py-1 text-sm"
                value={botName}
                placeholder="default"
                aria-label="Sender name override"
                onChange={(e) => setBotName(e.target.value)}
                onBlur={() => { if (botName !== (rule.botName ?? "")) save({ botName: botName.trim() || null }); }}
              />
            </label>
            <label className="flex items-center gap-1 text-[11px]" style={{ color: "var(--muted)" }}>
              Icon
              <input
                className="!w-44 !py-1 text-sm"
                value={botIcon}
                placeholder=":moneybag: or https URL"
                aria-label="Sender icon override"
                onChange={(e) => setBotIcon(e.target.value)}
                onBlur={() => { if (botIcon !== (rule.botIcon ?? "")) save({ botIcon: botIcon.trim() || null }); }}
              />
            </label>
          </div>
          <p className="mt-1 text-[11px]" style={{ color: "var(--muted)" }}>
            Blank identity = the app default. Custom name/icon needs the chat:write.customize scope.
          </p>
        </div>

        {/* live preview: what this message will look like in Slack */}
        <div className="rounded-lg border p-3" style={{ borderColor: "var(--line)", background: "var(--panel-2)" }}>
          <div className="mb-2 flex items-center justify-between gap-2">
            <span className="text-[11px] font-semibold uppercase tracking-wide" style={{ color: "var(--muted)" }}>Preview</span>
            <div className="flex gap-1">
              <button
                type="button"
                onClick={() => setPreviewMode("sample")}
                className="rounded px-1.5 py-0.5 text-[10px]"
                style={previewMode === "sample" ? { background: "color-mix(in srgb, var(--accent) 16%, var(--panel))", color: "var(--accent)" } : { color: "var(--muted)" }}
              >
                Sample
              </button>
              <button
                type="button"
                onClick={() => setPreviewMode("real")}
                disabled={!rule.example}
                title={rule.example ? "Preview with the latest real record" : "No real data yet for this event"}
                className="rounded px-1.5 py-0.5 text-[10px]"
                style={previewMode === "real" ? { background: "color-mix(in srgb, var(--good) 16%, var(--panel))", color: "var(--good)" } : { color: "var(--muted)", opacity: rule.example ? 1 : 0.5 }}
              >
                Real example
              </button>
            </div>
          </div>
          <div className="flex items-start gap-2">
            <div
              className="flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-md text-base"
              style={{ background: "color-mix(in srgb, var(--accent) 14%, var(--panel))" }}
            >
              {botIcon.startsWith("http") ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={botIcon} alt="" className="h-8 w-8 object-cover" />
              ) : botIcon ? (
                <span className="text-[10px]">{botIcon}</span>
              ) : (
                <span className="text-[11px] font-semibold" style={{ color: "var(--accent)" }}>TCB</span>
              )}
            </div>
            <div className="min-w-0">
              <div className="text-[13px]">
                <span className="font-semibold">{botName || "TCB Sales System"}</span>{" "}
                <span className="rounded px-1 text-[9px] uppercase" style={{ background: "var(--line)", color: "var(--muted)" }}>app</span>
              </div>
              <div className="mt-0.5 break-words text-[13px]" style={{ color: "var(--text)" }}>
                {previewText || <span style={{ color: "var(--muted)" }}>Template renders empty</span>}
              </div>
              <div className="mt-1 text-[10px]" style={{ color: "var(--muted)" }}>
                to {rule.channelName ? `#${rule.channelName}` : "no channel selected"}
              </div>
            </div>
          </div>
        </div>
      </div>
      {test !== null && test !== "sending" && (
        <div className="mt-1 text-xs" style={{ color: test.ok ? "var(--good)" : "var(--bad)" }}>
          {test.ok ? "Test sent" : `Test failed: ${test.error ?? "unknown error"}`}
        </div>
      )}
    </div>
  );
}
