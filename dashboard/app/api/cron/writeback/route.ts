import { NextRequest, NextResponse } from "next/server";
import { checkCronSecret } from "@/lib/webhook";
import { sql } from "@/lib/db";
import { dispatchPending } from "@/lib/sync/writeback";
import { processPending } from "@/lib/sync/ingest";
import { syncAllGhl } from "@/lib/sync/ghl";
import { pullNmiRecent } from "@/lib/sync/nmi-pull";
import { mergeNameTwins } from "@/lib/sync/merge-twins";
import { reconcileStripe } from "@/lib/sync/stripe-reconcile";
import { notifyEvent } from "@/lib/notify";
import { money } from "@/lib/format";

export const maxDuration = 60;

// Daily sweep: push pending write-backs to Close/GHL, retry failed inbound
// events, pull the last 48h of GHL activity, and reconcile Stripe (charges,
// refunds, disputes) as the safety net under the webhooks. Also fired inline
// after form submits.
export async function GET(req: NextRequest) {
  const denied = checkCronSecret(req);
  if (denied) return denied;
  const writeback = await dispatchPending();
  const inbound = await processPending();
  let ghl: unknown = "no ghl connections";
  try { ghl = await syncAllGhl({ sinceDays: 2 }); } catch (err) { ghl = String(err); }
  let twins: unknown;
  try { twins = await mergeNameTwins(); } catch (err) { twins = String(err); }
  let nmi: unknown;
  try { nmi = await pullNmiRecent(3); } catch (err) { nmi = String(err); } // freshness until Silent Post is on
  let stripe: unknown;
  try { stripe = await reconcileStripe({ sinceDays: 3 }); } catch (err) { stripe = String(err); }
  // Slack daily digest: yesterday's KPIs (ET day), one query, fire-and-forget.
  // The rule engine decides whether anything actually posts.
  let digest: unknown;
  try {
    const todayEt = new Intl.DateTimeFormat("en-CA", { timeZone: "America/New_York" }).format(new Date());
    const d = new Date(`${todayEt}T12:00:00Z`);
    d.setUTCDate(d.getUTCDate() - 1);
    const yesterday = d.toISOString().slice(0, 10);
    const [k] = await sql`
      select
        (select count(*) from sales.opt_in
          where counted and counts_as_unique
            and (submitted_at at time zone 'America/New_York')::date = ${yesterday}::date) as leads,
        (select count(*) from sales.call
          where is_booking and (created_at at time zone 'America/New_York')::date = ${yesterday}::date) as booked,
        (select count(*) from sales.appointment
          where status = 'taken'
            and (scheduled_for at time zone 'America/New_York')::date = ${yesterday}::date) as taken,
        (select coalesce(sum(amount_minor), 0) from finance.successful_payment
          where type <> 'booking_25'
            and (occurred_at at time zone 'America/New_York')::date = ${yesterday}::date) as cash`;
    const cashMinor = Number(k?.cash ?? 0);
    await notifyEvent("daily_digest", {
      leads: Number(k?.leads ?? 0),
      booked: Number(k?.booked ?? 0),
      taken: Number(k?.taken ?? 0),
      cash: money(cashMinor),
      date: yesterday,
    });
    digest = { date: yesterday, leads: Number(k?.leads ?? 0), booked: Number(k?.booked ?? 0), taken: Number(k?.taken ?? 0), cashMinor };
  } catch (err) { digest = String(err); }
  return NextResponse.json({ ok: true, writeback, inbound, ghl, stripe, digest });
}
