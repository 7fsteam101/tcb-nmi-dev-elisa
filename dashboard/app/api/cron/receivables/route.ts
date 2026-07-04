import { NextRequest, NextResponse } from "next/server";
import { sql } from "@/lib/db";
import { checkCronSecret } from "@/lib/webhook";

export const maxDuration = 60;

// Daily receivable aging: scheduled → late when past due; late → delinquent at 14+ days.
export async function GET(req: NextRequest) {
  const denied = checkCronSecret(req);
  if (denied) return denied;
  const late = await sql`
    update finance.receivable set status = 'late'
    where status = 'scheduled' and due_date < current_date and not is_demo
    returning id`;
  const delinquent = await sql`
    update finance.receivable set status = 'delinquent'
    where status = 'late' and due_date <= current_date - 14 and not is_demo
    returning id`;
  return NextResponse.json({ ok: true, marked_late: late.length, marked_delinquent: delinquent.length });
}
