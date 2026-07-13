# Customer Portal — Email OTP login (v2 security)

Adds Stripe-parity authentication to the portal: a **login link** (`/portal/login`)
where the customer enters their email, receives a **6-digit code**, and only after
verifying it gets a short-lived session. The raw link no longer grants access on its
own — this closes the "link = access" gap in v1.

## How it maps to Stripe
- **Login link** → `/portal/login` (shareable; personalize with `?prefilled_email=`,
  exactly like Stripe's param).
- **Email OTP** → 6-digit code, hashed + single-use + 10-min TTL + attempt-capped.
- **Short-lived session** → 45-min httpOnly cookie (`tcb_portal`), scoped by
  `contact_id`, mirroring the staff session in `lib/auth.ts` (jose HS256 +
  `SESSION_SECRET`).
- **Email not editable in-portal** → already true (v1 account form; parity).

## Files in this drop

| File | What it is |
|---|---|
| `supabase/migrations/0055_portal_otp.sql` | `core.portal_otp` (hashed, single-use codes) |
| `dashboard/lib/portal-auth.ts` | OTP request/verify, rate limiting, session cookie, **pluggable email sender** |
| `dashboard/app/portal/(auth)/login/{page,form,actions}` | Email → code login flow |
| `dashboard/app/portal/(app)/layout.tsx` | Guarded shell (redirects to /portal/login) + Sign out |
| `dashboard/app/portal/(app)/page.tsx` | Overview — now **cookie-scoped** (v1 content) |
| `dashboard/app/portal/(app)/account/{page,form,actions}` | Account edit — cookie-scoped |
| `dashboard/app/portal/logout/route.ts` | Clears the session cookie |

## Route restructure (important)
v2 replaces v1's `app/portal/[token]/*` (token-in-URL) with two route groups:
- `app/portal/(auth)/login/` — public login (its own layout via the login page).
- `app/portal/(app)/` — protected pages behind the guarded layout.

Route groups `(...)` don't change URLs: the overview is still `/portal`, account is
`/portal/account`, login is `/portal/login`. **Delete the old `app/portal/[token]/`
folder** — it's fully replaced. There must be **no** `app/portal/layout.tsx` (a
layout there would wrap the login page too and cause a redirect loop); each group
carries its own.

## Two required steps

**1. Pick + wire the email sender.** `lib/portal-auth.ts` → `sendOtpEmail()` is the
only integration point. Default is **Resend**: set `RESEND_API_KEY` and
`PORTAL_FROM_EMAIL` env vars. To use GHL / Postmark / SES / Sendblue-SMS instead,
replace only that function's body — nothing else changes. **With no key set it logs
the code to the server console**, so you can test the whole flow locally before
committing to a provider.

**2. Env.** `SESSION_SECRET` already exists (staff sessions use it) — reused here.
Add `RESEND_API_KEY` + `PORTAL_FROM_EMAIL` when you wire the sender.

`proxy.ts` already allows `/^\/portal\//` from v1, which covers `/portal/login` and
`/portal/logout` — no change needed.

## Recommended hardening (small, do with this)
Add response headers for `/portal/*` so the session/link can't leak via caches or
referers. In `dashboard/next.config.ts`:
```ts
async headers() {
  return [{
    source: "/portal/:path*",
    headers: [
      { key: "Cache-Control", value: "no-store" },
      { key: "Referrer-Policy", value: "no-referrer" },
    ],
  }];
}
```

## v1's portal_token is now optional
Access no longer uses the per-customer URL token. `core.portal_token` +
`createPortalToken`/`getPortalSession(token)`/`loadPortal` in `lib/portal.ts` are
**legacy** — safe to leave, or repurpose to generate personalized invite links that
deep-link to `/portal/login?prefilled_email=<email>`. The query layer in
`lib/portal.ts` (listCustomer*) is unchanged and still used.

## Security properties
- Codes hashed with a server pepper (`SESSION_SECRET`) — a DB dump alone can't brute
  the 6-digit space offline.
- Single-use, 10-min TTL, 5-attempt lockout (row burned on lockout).
- Rate limited per email: 30s min gap, 5 sends / 15 min.
- Generic "we sent a code" response whether or not the email matches — no
  enumeration.
- Session cookie: httpOnly, `secure` in prod, `sameSite=lax`, 45-min, `path=/portal`.

## Known gaps (v2.x)
- **Timing:** a code is only sent when the email matches a contact, a small timing
  signal. Acceptable; equalize later if needed.
- **Alt emails:** `findContactByEmail` matches `core.contact.primary_email` only.
  Union in `core.contact_identifier` (type='email') if customers use other addresses.
- **Re-auth for writes:** the account-edit save uses the same session as reads. If
  you want a higher bar, re-prompt OTP before the write (or before card update).
- **Card update page** (`/pay/<token>/card`) is still link-token based and outside
  this session. Fine for now (short-lived link), but note it's a separate surface.

## Test plan
1. Apply migration 0055 (dev/scratch DB, or same careful direct-apply as 0054).
2. Leave `RESEND_API_KEY` unset so codes print to the console.
3. Open `/portal/login`, enter a real contact's `primary_email`, submit.
4. Read the code from the dev-server console, enter it, verify → lands on `/portal`.
5. Confirm: wrong code 5× locks it; expired code (>10 min) is rejected; an unknown
   email still says "code sent" (no enumeration); `/portal` with no cookie bounces to
   `/portal/login`; Sign out clears the session.
6. Wire the real sender, set the env vars, repeat with a live email.
