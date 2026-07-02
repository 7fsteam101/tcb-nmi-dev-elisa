# Go-Live Runbook

Each connection below is independent — do them in any order, and the system lights up
piece by piece. Until then, Demo Mode (on by default) shows sample data on every page.

## 0. The app itself (once)

Deployed on Vercel from `dashboard/`. Env vars it needs:

| Var | Value |
|---|---|
| `DATABASE_URL` | Supabase transaction pooler string: `postgresql://postgres.<ref>:<password>@aws-1-us-east-1.pooler.supabase.com:6543/postgres` |
| `SESSION_SECRET` | `openssl rand -base64 32` |
| `WEBHOOK_SECRET` | `openssl rand -hex 16` — goes in every inbound webhook URL |
| `CRON_SECRET` | `openssl rand -hex 16` — protects the cron routes |
| `META_AD_ACCOUNT_ID` | the Meta ad account id (numbers only), when connecting Meta |

The exact webhook URLs (with the secret placeholder) are shown on the app's
**Connections** page after deploy.

## 1. Close — one paste, fully automatic after that

1. In Close: Settings, then API Keys, create a key (https://app.close.com/settings/api/).
2. In the app: **Connections → Connect with a key → Close**, paste it.

Saving the key does everything else automatically: it stores the key encrypted in the
database vault, **subscribes Close's webhooks to this app** (lead + opportunity events),
and releases any queued write-backs. From that moment: changes in Close mirror in, and
form outcomes push back (opportunity stage + notes).

## 2. GoHighLevel — inbound today via workflows, write-back via the Marketplace app

Inbound (each sub-account, works immediately, no app install):
create a workflow per event with a **custom webhook action** posting to the GHL webhook URL
from the Connections page. Set the body to JSON like:

```json
{
  "tcb_event": "appointment_booked",
  "location_id": "<sub-account location id>",
  "contact": { "id": "{{contact.id}}", "name": "{{contact.name}}", "email": "{{contact.email}}", "phone": "{{contact.phone}}" },
  "appointment": { "id": "{{appointment.id}}", "start_time": "{{appointment.start_time}}" }
}
```

One workflow per `tcb_event` value: `appointment_booked`, `appointment_rescheduled`,
`appointment_confirmed`, `appointment_cancelled_by_lead`, `appointment_cancelled_by_team`,
`appointment_no_show`, `appointment_showed`, `form_submitted`, `intake_submitted`.
(Exact GHL menu names shift between releases — the workflow builder's webhook action is the
thing to look for; verify field tags against GHL's current docs when setting up.)

Write-back to GHL (notes on contacts) needs the Marketplace app's OAuth token — the agency
installs the app once, each sub-account becomes its own connection. Until then GHL
write-backs stay queued, harmless.

## 3. Stripe — the $25 booking fee

Stripe Dashboard → Developers → Webhooks (event destinations): add the Stripe webhook URL,
send `charge.succeeded`. Each $25 charge links to the matching strategy call by email.

## 4. NMI — program payments

In the NMI gateway, set the silent-post/webhook URL to the NMI webhook URL. Approved
payments match to the open receivable of the same amount on the client's plan; unmatched
ones surface on the Receivables page for review.

## 5. Meta — daily ad spend

Create a system-user access token with `ads_read` on the ad account, paste it in
**Connections → Meta**, and set `META_AD_ACCOUNT_ID` in Vercel. The daily cron pulls
per-ad spend (re-pulling a trailing window to catch restatements).

## 6. Team logins

Settings → Add a user (admin only). Roles: admin, leadership, closer, setter, csm.
Everyone can change their own password in Settings.

## Switching off demo data

Settings → Data mode → toggle. Demo rows never mix with real rows (separate flag on every
table). Purging demo data entirely, later: `delete ... where is_demo` per table.
