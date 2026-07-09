import { NextRequest, NextResponse } from "next/server";
import { checkCronSecret } from "@/lib/webhook";
import { dispatchPending } from "@/lib/sync/writeback";
import { processPending } from "@/lib/sync/ingest";
import { syncAllGhl } from "@/lib/sync/ghl";
import { pullNmiRecent } from "@/lib/sync/nmi-pull";
import { reconcileStripe } from "@/lib/sync/stripe-reconcile";

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
  let nmi: unknown;
  try { nmi = await pullNmiRecent(3); } catch (err) { nmi = String(err); } // freshness until Silent Post is on
  let stripe: unknown;
  try { stripe = await reconcileStripe({ sinceDays: 3 }); } catch (err) { stripe = String(err); }
  return NextResponse.json({ ok: true, writeback, inbound, ghl, stripe });
}
