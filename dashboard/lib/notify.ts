import { sql } from "./db";
import { getProviderToken } from "./sync/providers";

// Slack notification engine (Katie, July 13). Rules live in
// core.notification_rule (per-event toggle, channel, editable {placeholder}
// template). Everything here is fire-and-forget: a Slack failure logs to the
// rule row and NEVER breaks the calling pipeline.

const SLACK = "https://slack.com/api";

async function botToken(): Promise<string | null> {
  try { return await getProviderToken("slack"); } catch { return null; }
}

export async function slackApi(method: string, body: Record<string, unknown>): Promise<any> {
  const token = await botToken();
  if (!token) return { ok: false, error: "slack not connected" };
  const res = await fetch(`${SLACK}/${method}`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json; charset=utf-8" },
    body: JSON.stringify(body),
  });
  return res.json();
}

/** Channels the bot can see (public + private it was invited to). */
export async function listSlackChannels(): Promise<{ id: string; name: string; isPrivate: boolean }[]> {
  const out: { id: string; name: string; isPrivate: boolean }[] = [];
  let cursor: string | undefined;
  for (let i = 0; i < 5; i++) {
    const res = await slackApi("conversations.list", {
      types: "public_channel,private_channel", exclude_archived: true, limit: 200, cursor,
    });
    if (!res.ok) break;
    for (const c of res.channels ?? []) out.push({ id: c.id, name: c.name, isPrivate: Boolean(c.is_private) });
    cursor = res.response_metadata?.next_cursor || undefined;
    if (!cursor) break;
  }
  return out.sort((a, b) => a.name.localeCompare(b.name));
}

/** Workspace identity for the Connections page (null = not connected/bad token). */
export async function slackStatus(): Promise<{ team: string; botUser: string } | null> {
  const res = await slackApi("auth.test", {});
  return res.ok ? { team: res.team, botUser: res.user } : null;
}

// per-rule sender identity: an :emoji: icon or an https image URL; blank = app default.
// Requires the chat:write.customize bot scope; without it Slack ignores the fields.
const identity = (name?: string | null, icon?: string | null) => ({
  ...(name ? { username: name } : {}),
  ...(icon ? (icon.startsWith("http") ? { icon_url: icon } : { icon_emoji: icon }) : {}),
});

// Template rendering with optional date-format modifiers: {time|date} -> Jul 18,
// {time|time} -> 1:30 PM, {time|datetime} -> Jul 18, 1:30 PM. A bare {var} whose
// value is an ISO timestamp auto-formats as datetime so raw ISO never reaches
// Slack. All dates render in the report timezone (locked ET per decision 3).
const TZ = "America/New_York";
const ISO_RE = /^\d{4}-\d{2}-\d{2}T/;
const fmtDate = (d: Date, mode: string) => {
  const date = new Intl.DateTimeFormat("en-US", { timeZone: TZ, month: "short", day: "numeric" }).format(d);
  const time = new Intl.DateTimeFormat("en-US", { timeZone: TZ, hour: "numeric", minute: "2-digit" }).format(d);
  return mode === "date" ? date : mode === "time" ? time : date + ", " + time;
};
const render = (template: string, vars: Record<string, string | number | null | undefined>) =>
  template.replace(/\{(\w+)(?:\|(\w+))?\}/g, (_, k, mod) => {
    const v = vars[k];
    if (v === null || v === undefined || v === "") return "";
    const s = String(v);
    if (mod || ISO_RE.test(s)) {
      const d = new Date(s);
      if (!isNaN(d.getTime())) return fmtDate(d, mod ?? "datetime");
    }
    return s;
  }).replace(/\s{2,}/g, " ").trim();

/**
 * Fire a notification event. vars are the event's custom values; amountMinor
 * (when given) is checked against the rule's min_amount_minor gate.
 */
export async function notifyEvent(eventType: string, vars: Record<string, string | number | null | undefined>, amountMinor?: number) {
  try {
    const [rule] = await sql`
      select id, enabled, channel_id, template, min_amount_minor, bot_name, bot_icon
      from core.notification_rule where event_type = ${eventType} limit 1`;
    if (!rule || !rule.enabled || !rule.channel_id) return;
    if (rule.min_amount_minor != null && amountMinor != null && amountMinor < Number(rule.min_amount_minor)) return;
    const text = render(String(rule.template), vars);
    if (!text) return;
    const res = await slackApi("chat.postMessage", { channel: rule.channel_id, text, ...identity(rule.bot_name, rule.bot_icon) });
    if (!res.ok) {
      await sql`update core.notification_rule set template = template where id = ${rule.id}`; // touch updated_at
      console.error(`slack notify ${eventType} failed: ${res.error}`);
    }
  } catch (err) {
    console.error(`slack notify ${eventType} error:`, err);
  }
}

/** Test-send used by the admin page. */
export async function sendTestMessage(channelId: string, text: string, botName?: string | null, botIcon?: string | null): Promise<{ ok: boolean; error?: string }> {
  const res = await slackApi("chat.postMessage", { channel: channelId, text, ...identity(botName, botIcon) });
  return res.ok ? { ok: true } : { ok: false, error: res.error };
}
