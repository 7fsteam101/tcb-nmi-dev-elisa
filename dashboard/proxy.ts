import { NextRequest, NextResponse } from "next/server";
import { jwtVerify } from "jose";

// Auth gate (Next 16 "proxy", formerly middleware) for everything except
// login, webhooks (secret-checked in-route), crons (secret-checked in-route)
// and static assets.
const PUBLIC = [/^\/login/, /^\/api\/login/, /^\/api\/webhooks\//, /^\/api\/cron\//, /^\/api\/connect\//, /^\/pay\//, /^\/api\/charge/, /^\/portal\//, /^\/_next\//, /^\/favicon/];

export async function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  // Temporary auth-off switch (env AUTH_DISABLED=true): let everything through.
  // getSession() supplies a default admin so pages/actions still work.
  if (process.env.AUTH_DISABLED === "true") return NextResponse.next();
  if (PUBLIC.some((p) => p.test(pathname))) return NextResponse.next();

  const token = req.cookies.get("tcb_session")?.value;
  if (token) {
    try {
      await jwtVerify(token, new TextEncoder().encode(process.env.SESSION_SECRET!));
      return NextResponse.next();
    } catch {
      // fall through to redirect
    }
  }
  const url = req.nextUrl.clone();
  url.pathname = "/login";
  return NextResponse.redirect(url);
}

export const config = { matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"] };
