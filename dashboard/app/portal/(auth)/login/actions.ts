"use server";

import { redirect } from "next/navigation";
import { requestOtp, verifyOtp } from "@/lib/portal-auth";

export type LoginState = { phase: "request" | "verify"; email: string; error: string | null };

// One action, two phases. phase=request emails the code; phase=verify checks it
// and (on success) issues the session cookie inside verifyOtp, then redirects.
export async function loginAction(_prev: LoginState | null, formData: FormData): Promise<LoginState> {
  const phase = String(formData.get("phase") || "request");
  const email = String(formData.get("email") || "");

  if (phase === "request") {
    const r = await requestOtp(email);
    if (!r.ok) return { phase: "request", email, error: r.message };
    return { phase: "verify", email, error: null };
  }

  const code = String(formData.get("code") || "");
  const r = await verifyOtp(email, code);
  if (!r.ok) return { phase: "verify", email, error: r.message };
  redirect("/portal");
}
