import { NextRequest, NextResponse } from "next/server";
import { loginWithPassword, createSession } from "@/lib/auth";

export const maxDuration = 60;

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();
  if (!email || !password) return NextResponse.json({ error: "Email and password required" }, { status: 400 });
  const user = await loginWithPassword(email, password);
  if (!user) return NextResponse.json({ error: "Invalid email or password" }, { status: 401 });
  await createSession(user);
  return NextResponse.json({ ok: true });
}
