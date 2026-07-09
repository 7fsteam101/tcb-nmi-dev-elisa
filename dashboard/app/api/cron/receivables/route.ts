import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { checkCronSecret } from "@/lib/webhook";
import { chargeDueCustomInstallments } from "@/lib/nmi-links";
import { recomputeCommissions } from "@/lib/commission";

export const maxDuration = 60;

// Daily: charge due custom-plan installments, then age receivables
// (scheduled -> late when past due; late -> delinquent at 14+ days).
export async function GET(req: NextRequest) {
  const denied = checkCronSecret(req);
  if (denied) return denied;
  const custom = await chargeDueCustomInstallments();
  const late = await sql`
    update finance.receivable set status = 'late'
    where status = 'scheduled' and due_date < current_date and not is_demo
    returning id`;
  const delinquent = await sql`
    update finance.receivable set status = 'delinquent'
    where status = 'late' and due_date <= current_date - 14 and not is_demo
    returning id`;
  await recomputeCommissions(false); // refresh open commission statements daily
  return NextResponse.json({ ok: true, custom_installments_charged: custom.charged, custom_installments_failed: custom.failed, marked_late: late.length, marked_delinquent: delinquent.length });
}
