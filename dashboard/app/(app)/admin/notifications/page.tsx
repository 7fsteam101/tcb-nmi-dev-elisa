import { sql } from "@/lib/db";
import { slackStatus, listSlackChannels } from "@/lib/notify";
import { NotificationRulesEditor } from "./editor";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export default async function NotificationsAdmin() {
  // sequential on purpose: status first, channels only when connected, then rules
  const connected = await slackStatus();
  const channels = connected ? await listSlackChannels() : [];
  const rules = await sql`
    select id, event_type, label, enabled, channel_id, channel_name, template, variables, min_amount_minor
    from core.notification_rule order by label`;
  const serialized = rules.map((r: any) => ({
    id: String(r.id),
    eventType: String(r.event_type),
    label: String(r.label),
    enabled: Boolean(r.enabled),
    channelId: r.channel_id == null ? null : String(r.channel_id),
    channelName: r.channel_name == null ? null : String(r.channel_name),
    template: String(r.template),
    variables: String(r.variables),
    minAmountMinor: r.min_amount_minor == null ? null : Number(r.min_amount_minor),
  }));
  return <NotificationRulesEditor connected={connected} channels={channels} rules={serialized} />;
}
