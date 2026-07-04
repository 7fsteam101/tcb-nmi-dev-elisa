import { NextRequest, NextResponse } from "next/server";
import { exchangeCode, saveGhlConnection, mintLocationTokens } from "@/lib/sync/ghl";

export const maxDuration = 60;

// OAuth callback for the GHL Marketplace app. A sub-account install returns a
// location token directly; an agency install returns a company token that we
// exchange for per-location tokens (one connection per sub-account).
export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get("code");
  const base = `https://${req.headers.get("host")}`;
  if (!code) return NextResponse.redirect(`${base}/connections?ghl=missing_code`);
  try {
    let token: any;
    try {
      token = await exchangeCode(code, "Location");
    } catch {
      token = await exchangeCode(code, "Company"); // agency-level install
    }
    if (token.userType === "Company" || (!token.locationId && token.companyId)) {
      const locations = await mintLocationTokens(token);
      return NextResponse.redirect(`${base}/connections?ghl=agency_connected&locations=${locations.length}`);
    }
    const locationId = await saveGhlConnection(token);
    return NextResponse.redirect(`${base}/connections?ghl=connected&location=${locationId}`);
  } catch (err) {
    return NextResponse.redirect(`${base}/connections?ghl=error&detail=${encodeURIComponent(String(err).slice(0, 200))}`);
  }
}
