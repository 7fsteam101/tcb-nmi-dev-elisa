import { scryptSync, randomBytes, timingSafeEqual } from "crypto";
import { SignJWT, jwtVerify } from "jose";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { sql } from "./db";

const COOKIE = "tcb_session";
const secret = () => new TextEncoder().encode(process.env.SESSION_SECRET!);

export type SessionUser = {
  id: string;
  email: string;
  name: string;
  role: "admin" | "leadership" | "closer" | "setter" | "csm";
  repId: string | null;
};

// -- passwords (scrypt, no native deps) --------------------------------
export function hashPassword(password: string): string {
  const salt = randomBytes(16);
  const hash = scryptSync(password, salt, 64, { N: 16384, r: 8, p: 1 });
  return ["scrypt", "16384", "8", "1", salt.toString("base64"), hash.toString("base64")].join("$");
}

export function verifyPassword(password: string, stored: string): boolean {
  const [scheme, N, r, p, saltB64, hashB64] = stored.split("$");
  if (scheme !== "scrypt") return false;
  const expected = Buffer.from(hashB64, "base64");
  const actual = scryptSync(password, Buffer.from(saltB64, "base64"), expected.length, {
    N: Number(N), r: Number(r), p: Number(p),
  });
  return timingSafeEqual(actual, expected);
}

// -- sessions (JWT cookie) ---------------------------------------------
export async function createSession(user: SessionUser) {
  const token = await new SignJWT({ ...user })
    .setProtectedHeader({ alg: "HS256" })
    .setExpirationTime("7d")
    .sign(secret());
  (await cookies()).set(COOKIE, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });
}

export async function getSession(): Promise<SessionUser | null> {
  const token = (await cookies()).get(COOKIE)?.value;
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secret());
    return payload as unknown as SessionUser;
  } catch {
    return null;
  }
}

export async function requireSession(): Promise<SessionUser> {
  const s = await getSession();
  if (!s) redirect("/login");
  return s;
}

export async function destroySession() {
  (await cookies()).delete(COOKIE);
}

export async function loginWithPassword(email: string, password: string): Promise<SessionUser | null> {
  const rows = await sql`
    select id, email, full_name, password_hash, role, rep_id
    from core.app_user where lower(email) = lower(${email}) and active`;
  if (rows.length === 0) return null;
  const u = rows[0];
  if (!verifyPassword(password, u.password_hash)) return null;
  await sql`update core.app_user set last_login_at = now() where id = ${u.id}`;
  return { id: u.id, email: u.email, name: u.full_name, role: u.role, repId: u.rep_id };
}
