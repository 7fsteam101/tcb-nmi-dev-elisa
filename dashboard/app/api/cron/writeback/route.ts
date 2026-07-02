import { NextRequest, NextResponse } from "next/server";
import { checkCronSecret } from "@/lib/webhook";
import { dispatchPending } from "@/lib/sync/writeback";
import { processPending } from "@/lib/sync/ingest";

// Sweep: push pending write-backs out to Close/GHL and retry failed inbound
// events. Also fired inline (fire-and-forget) right after a form submit.
export async function GET(req: NextRequest) {
  const denied = checkCronSecret(req);
  if (denied) return denied;
  const writeback = await dispatchPending();
  const inbound = await processPending();
  return NextResponse.json({ ok: true, writeback, inbound });
}
