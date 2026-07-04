import { NextResponse } from "next/server";
import { destroySession } from "@/lib/auth";

export const maxDuration = 60;

export async function POST() {
  await destroySession();
  return NextResponse.json({ ok: true });
}
