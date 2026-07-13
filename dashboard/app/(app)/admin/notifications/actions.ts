"use server";

import { revalidatePath } from "next/cache";
import { sql } from "@/lib/db";
import { requireSession } from "@/lib/auth";
import { sendTestMessage } from "@/lib/notify";

async function guard() {
  const user = await requireSession();
  if (user.role !== "admin") throw new Error("Admins only");
}

export type RulePatch = {
  enabled?: boolean;
  channelId?: string | null;
  channelName?: string | null;
  template?: string;
  minAmountMinor?: number | null;
};

export async function updateRuleAction(id: string, patch: RulePatch) {
  await guard();
  const [r] = await sql`
    select enabled, channel_id, channel_name, template, min_amount_minor
    from core.notification_rule where id = ${id} limit 1`;
  if (!r) return;
  await sql`
    update core.notification_rule set
      enabled = ${patch.enabled ?? r.enabled},
      channel_id = ${patch.channelId !== undefined ? patch.channelId : r.channel_id},
      channel_name = ${patch.channelName !== undefined ? patch.channelName : r.channel_name},
      template = ${patch.template ?? r.template},
      min_amount_minor = ${patch.minAmountMinor !== undefined ? patch.minAmountMinor : r.min_amount_minor}
    where id = ${id}`;
  revalidatePath("/admin/notifications");
}

// Sample values for the test send: obviously fake names, real shape. Covers
// every {placeholder} across the seeded rule catalog (migration 0050).
const SAMPLE: Record<string, string> = {
  contact_name: "Jane Sample",
  amount: "$2,500",
  processor: "NMI",
  plan_type: "3pay",
  collected_pct: "33%",
  deal_value: "$7,500",
  kind: "refund",
  closer: "Sample Closer",
  time: "Jul 14, 2:00 PM",
  calendar: "Strategy Calls",
  booked_by: "Self book",
  source: "meta ads",
  campaign: " (Sample Campaign)",
  leads: "12",
  booked: "5",
  taken: "4",
  cash: "$8,250",
  date: "2026-07-12",
};

// same substitution the engine uses (lib/notify.ts render, which is private)
const renderSample = (template: string) =>
  template.replace(/\{(\w+)\}/g, (_, k: string) => SAMPLE[k] ?? "").replace(/\s{2,}/g, " ").trim();

export async function testRuleAction(id: string): Promise<{ ok: boolean; error?: string }> {
  try {
    await guard();
    const [r] = await sql`
      select channel_id, template from core.notification_rule where id = ${id} limit 1`;
    if (!r) return { ok: false, error: "rule not found" };
    if (!r.channel_id) return { ok: false, error: "pick a channel first" };
    const text = renderSample(String(r.template));
    if (!text) return { ok: false, error: "template renders empty" };
    return await sendTestMessage(String(r.channel_id), text);
  } catch (err) {
    return { ok: false, error: String(err instanceof Error ? err.message : err) };
  }
}
