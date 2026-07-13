import { createHash, timingSafeEqual, randomInt } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { sql } from "./db";

// =============================================================================
// Customer portal authentication — email one-time passcode (Stripe-parity).
//
// Flow: enter email -> requestOtp (emails a 6-digit code) -> verifyOtp -> a
// short-lived httpOnly session cookie scoped to the contact. The URL/link never
// grants access on its own; the customer must prove control of the email.
//
// Mirrors the staff session in lib/auth.ts (jose HS256 + SESSION_SECRET cookie).
// =============================================================================

const COOKIE = "tcb_portal";
const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET!);

const SESSION_MINUTES = 45; // portal session lifetime (short; customers re-auth)
const OTP_TTL_MIN = 10; // code validity
const MAX_ATTEMPTS = 5; // wrong-code tries before the code is burned
const RESEND_SECONDS = 30; // min gap between code requests per email
const MAX_SENDS_PER_WINDOW = 5; // per rolling 15 min per email

export type PortalSession = { contactId: string; email: string };

// -----------------------------------------------------------------------------
// Session cookie
// -----------------------------------------------------------------------------

export async function createPortalSession(contactId: string, email: string): Promise<void> {
  const token = await new SignJWT({ contactId, email })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime(`${SESSION_MINUTES}m`)
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * SESSION_MINUTES,
    path: "/portal",
  });
}

export async function getPortalSession(): Promise<PortalSession | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return { contactId: payload.contactId as string, email: payload.email as string };
  } catch {
    return null;
  }
}

export async function destroyPortalSession(): Promise<void> {
  (await cookies()).set(COOKIE, "", {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/portal",
    maxAge: 0,
  });
}

// -----------------------------------------------------------------------------
// OTP internals
// -----------------------------------------------------------------------------

function hashCode(code: string): string {
  // Pepper with the server secret so a DB dump alone can't brute the 6-digit
  // space offline — the attacker also needs SESSION_SECRET.
  return createHash("sha256").update(`${code}:${process.env.SESSION_SECRET!}`).digest("hex");
}

function constantTimeEqualHex(a: string, b: string): boolean {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

async function findContactByEmail(email: string): Promise<{ id: string } | null> {
  const rows = await sql`
    select id from core.contact
    where lower(primary_email) = lower(${email})
    order by created_at desc
    limit 1`;
  return rows.length ? { id: rows[0].id as string } : null;
  // NOTE: to also match alternate addresses, union in core.contact_identifier
  // where type = 'email'. primary_email is the v2 floor.
}

// -----------------------------------------------------------------------------
// Public API: request + verify
// -----------------------------------------------------------------------------

export type RequestResult =
  | { ok: true }
  | { ok: false; retryAfter?: number; notFound?: boolean; message: string };

export async function requestOtp(rawEmail: string): Promise<RequestResult> {
  const email = rawEmail.trim().toLowerCase();
  if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email)) return { ok: false, message: "Enter a valid email." };

  // rate limit by email (throttle + cap)
  const recent = await sql`
    select created_at from core.portal_otp
    where lower(email) = ${email} and created_at > now() - interval '15 minutes'
    order by created_at desc`;
  if (recent.length) {
    const sinceLastMs = Date.now() - new Date(recent[0].created_at as string).getTime();
    if (sinceLastMs < RESEND_SECONDS * 1000) {
      return { ok: false, retryAfter: Math.ceil(RESEND_SECONDS - sinceLastMs / 1000), message: "Please wait a moment before requesting another code." };
    }
    if (recent.length >= MAX_SENDS_PER_WINDOW) {
      return { ok: false, message: "Too many requests. Please try again later." };
    }
  }

  const contact = await findContactByEmail(email);
  if (!contact) {
    // Product decision: accept the user-enumeration tradeoff for clearer UX —
    // tell the user explicitly when the email isn't a customer.
    return { ok: false, notFound: true, message: "No account found for that email." };
  }
  const code = String(randomInt(0, 1_000_000)).padStart(6, "0");
  const expiresAt = new Date(Date.now() + OTP_TTL_MIN * 60_000).toISOString();
  await sql`
    insert into core.portal_otp (contact_id, email, code_hash, expires_at)
    values (${contact.id}, ${email}, ${hashCode(code)}, ${expiresAt})`;
  await sendOtpEmail(email, code);
  return { ok: true };
}

export type VerifyResult = { ok: true } | { ok: false; message: string };

export async function verifyOtp(rawEmail: string, rawCode: string): Promise<VerifyResult> {
  const email = rawEmail.trim().toLowerCase();
  const code = rawCode.trim();
  if (!/^\d{6}$/.test(code)) return { ok: false, message: "Enter the 6-digit code." };

  const rows = await sql`
    select id, contact_id, code_hash, attempts
    from core.portal_otp
    where lower(email) = ${email} and consumed_at is null and expires_at > now()
    order by created_at desc
    limit 1`;
  if (!rows.length) return { ok: false, message: "That code has expired or is invalid. Request a new one." };
  const row = rows[0];

  if ((row.attempts as number) >= MAX_ATTEMPTS) {
    await sql`update core.portal_otp set consumed_at = now() where id = ${row.id}`;
    return { ok: false, message: "Too many attempts. Request a new code." };
  }

  if (!constantTimeEqualHex(hashCode(code), row.code_hash as string)) {
    await sql`update core.portal_otp set attempts = attempts + 1 where id = ${row.id}`;
    return { ok: false, message: "Incorrect code." };
  }

  // success: burn the code, issue the session
  await sql`update core.portal_otp set consumed_at = now() where id = ${row.id}`;
  await createPortalSession(row.contact_id as string, email);
  return { ok: true };
}

// -----------------------------------------------------------------------------
// EMAIL SENDER — the one thing you must wire.
//
// Default: Resend. Set RESEND_API_KEY and PORTAL_FROM_EMAIL. To use GHL /
// Postmark / SES / Sendblue-SMS instead, replace ONLY the body of this function;
// nothing else in the flow changes. With no key set, it logs the code to the
// server console so local testing isn't blocked.
// -----------------------------------------------------------------------------

async function sendOtpEmail(to: string, code: string): Promise<void> {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.PORTAL_FROM_EMAIL || "The Credit Brothers <billing@thecreditbrothers.com>";
  if (!apiKey) {
    console.warn(`[portal-otp] RESEND_API_KEY unset — dev fallback. Code for ${to}: ${code}`);
    return;
  }
  const html = `
    <div style="font-family:ui-sans-serif,system-ui,-apple-system,sans-serif;background:#f5f7fa;padding:32px">
      <div style="max-width:440px;margin:0 auto;background:#fff;border-radius:12px;padding:32px;border:1px solid #e6ebf1">
        <div style="font-weight:800;letter-spacing:.5px;font-size:14px;color:#0b0f17">THE CREDIT BROTHERS</div>
        <p style="color:#5b6b7f;font-size:14px;margin:20px 0 8px">Your one-time sign-in code:</p>
        <div style="font-size:34px;font-weight:800;letter-spacing:8px;color:#0b0f17;margin:8px 0">${code}</div>
        <p style="color:#8aa0bd;font-size:13px;margin-top:16px">This code expires in 10 minutes. If you didn't request it, you can ignore this email.</p>
      </div>
    </div>`;
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from, to,
      subject: `Your billing portal code: ${code}`,
      text: `Your one-time code is ${code}. It expires in 10 minutes.\n\nIf you didn't request this, you can ignore this email.`,
      html,
    }),
  });
  if (!res.ok) throw new Error(`OTP email failed: ${res.status} ${await res.text()}`);
}
