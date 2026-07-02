import { NextRequest, NextResponse } from "next/server";
import { checkCronSecret } from "@/lib/webhook";
import { dispatchPending } from "@/lib/sync/writeback";
import { processPending } from "@/lib/sync/ingest";
import { syncAllGhl } from "@/lib/sync/ghl";

// Daily sweep: push pending write-backs to Close/GHL, retry failed inbound
// events, and pull the last 48h of GHL activity (appointments/contacts/forms)
// as a safety net under the webhooks. Also fired inline after form submits.
export async function GET(req: NextRequest) {
  const denied = checkCronSecret(req);
  if (denied) return denied;
  const writeback = await dispatchPending();
  const inbound = await processPending();
  let ghl: unknown = "no ghl connections";
  try { ghl = await syncAllGhl({ sinceDays: 2 }); } catch (err) { ghl = String(err); }
  return NextResponse.json({ ok: true, writeback, inbound, ghl });
}
