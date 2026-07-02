import { createHash } from "crypto";
import { NextRequest, NextResponse } from "next/server";

/** All inbound webhook URLs carry ?secret=<WEBHOOK_SECRET>. */
export function checkWebhookSecret(req: NextRequest): NextResponse | null {
  const secret = req.nextUrl.searchParams.get("secret");
  if (!secret || secret !== process.env.WEBHOOK_SECRET)
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  return null;
}

/** Vercel cron sends Authorization: Bearer <CRON_SECRET>; manual runs may use ?secret=. */
export function checkCronSecret(req: NextRequest): NextResponse | null {
  const header = req.headers.get("authorization");
  const qs = req.nextUrl.searchParams.get("secret");
  if (header === `Bearer ${process.env.CRON_SECRET}` || qs === process.env.CRON_SECRET) return null;
  return NextResponse.json({ error: "unauthorized" }, { status: 401 });
}

export const bodyHash = (raw: string) => createHash("sha256").update(raw).digest("hex");
