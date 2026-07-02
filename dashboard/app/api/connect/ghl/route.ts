import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { ghlInstallUrl } from "@/lib/sync/ghl";

// Kicks off the GHL Marketplace install: redirects to the chooselocation
// consent screen. Requires GHL_CLIENT_ID/SECRET env (from the registered app).
export async function GET(req: NextRequest) {
  const session = await getSession();
  if (!session || session.role !== "admin")
    return NextResponse.json({ error: "admin login required" }, { status: 401 });
  if (!process.env.GHL_CLIENT_ID)
    return NextResponse.json({ error: "GHL app not registered yet — set GHL_CLIENT_ID / GHL_CLIENT_SECRET" }, { status: 400 });
  const redirect = `https://${req.headers.get("host")}/api/connect/ghl/callback`;
  return NextResponse.redirect(ghlInstallUrl(redirect));
}
