import { NextResponse } from "next/server";
import { destroyPortalSession } from "@/lib/portal-auth";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  await destroyPortalSession();
  return NextResponse.redirect(new URL("/portal/login", req.url));
}
